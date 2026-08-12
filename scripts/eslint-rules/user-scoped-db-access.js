"use strict";

const DIRECT_USER_OWNED_TABLES = new Set([
  "accounts",
  "assets",
  "budgets",
  "daily_snapshot_assets",
  "daily_snapshot_balance",
  "daily_snapshot_net_worth",
  "debts",
  "profiles",
  "recurring_payments",
  "sms_review_queues",
  "sms_review_draft_items",
  "dismissed_sms_fingerprints",
  "transactions",
  "transfers",
  "user_category_settings",
]);

const CHILD_USER_OWNED_TABLES = new Set([
  "account_sms_senders",
  "asset_metals",
  "bank_details",
]);

const MIXED_VISIBILITY_TABLES = new Set(["categories"]);

const ALLOWED_FILE_SUFFIXES = [
  "apps/mobile/services/user-data-access.ts",
  "apps/mobile/services/sms-review-draft-repository.ts",
  "apps/mobile/services/sync.ts",
];

const OWNED_HELPERS = new Set([
  "queryOwned",
  "findOwnedById",
  "observeOwnedById",
  "findOwned",
]);

const CATEGORY_HELPERS = new Set([
  "queryAccessibleCategories",
  "findAccessibleCategory",
]);

const CHILD_HELPERS = new Set([
  "queryChildrenOfOwnedParent",
  "queryChildrenOfOwnedParents",
  "assertChildRecordParentOwned",
]);

function normalizePath(fileName) {
  return fileName.replace(/\\/g, "/");
}

function isAllowedFile(fileName) {
  const normalized = normalizePath(fileName);
  return ALLOWED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isTestFile(fileName) {
  const normalized = normalizePath(fileName);
  return (
    normalized.includes("/__tests__/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.tsx")
  );
}

function getPropertyName(memberExpression) {
  if (!memberExpression || memberExpression.type !== "MemberExpression") {
    return null;
  }

  const property = memberExpression.property;
  if (property.type === "Identifier") {
    return property.name;
  }

  if (property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }

  return null;
}

function getLiteralString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function getDatabaseGetTable(callExpression, databaseVariables) {
  if (!callExpression || callExpression.type !== "CallExpression") {
    return null;
  }

  const callee = callExpression.callee;
  if (!callee || callee.type !== "MemberExpression") {
    return null;
  }

  if (getPropertyName(callee) !== "get") {
    return null;
  }

  if (callee.object.type !== "Identifier") {
    return null;
  }

  if (!databaseVariables.has(callee.object.name)) {
    return null;
  }

  return getLiteralString(callExpression.arguments[0]);
}

function getScopedHelperKind(callExpression) {
  if (!callExpression || callExpression.type !== "CallExpression") {
    return null;
  }

  const callee = callExpression.callee;
  if (callee.type === "Identifier") {
    if (OWNED_HELPERS.has(callee.name)) return "owned";
    if (CATEGORY_HELPERS.has(callee.name)) return "mixed";
    if (CHILD_HELPERS.has(callee.name)) return "child";
    return null;
  }

  if (callee.type !== "MemberExpression") {
    return null;
  }

  const propertyName = getPropertyName(callee);
  if (OWNED_HELPERS.has(propertyName)) return "owned";
  if (CATEGORY_HELPERS.has(propertyName)) return "mixed";
  if (CHILD_HELPERS.has(propertyName)) return "child";
  return null;
}

function isProtectedTable(tableName) {
  return (
    DIRECT_USER_OWNED_TABLES.has(tableName) ||
    CHILD_USER_OWNED_TABLES.has(tableName) ||
    MIXED_VISIBILITY_TABLES.has(tableName)
  );
}

function getTableKind(tableName) {
  if (CHILD_USER_OWNED_TABLES.has(tableName)) return "child";
  return MIXED_VISIBILITY_TABLES.has(tableName) ? "mixed" : "owned";
}

function getCollectionNameFromNode(
  node,
  collectionVariables,
  databaseVariables
) {
  if (!node) return null;

  if (node.type === "Identifier") {
    return collectionVariables.get(node.name) ?? null;
  }

  if (node.type === "CallExpression") {
    return getDatabaseGetTable(node, databaseVariables);
  }

  return null;
}

function getCollectionNameFromMemberObject(
  node,
  collectionVariables,
  databaseVariables
) {
  return getCollectionNameFromNode(
    node,
    collectionVariables,
    databaseVariables
  );
}

function getMessage(tableName, accessKind) {
  const tableKind = getTableKind(tableName);
  if (tableKind === "mixed") {
    return `Avoid direct ${accessKind} access to mixed-visibility table '${tableName}'. Use user-data-access category helpers so system rows and current-user rows are handled together.`;
  }

  if (tableKind === "child") {
    return `Avoid direct ${accessKind} access to child-owned table '${tableName}'. Use user-data-access child helpers with a verified owned parent instead.`;
  }

  return `Avoid direct ${accessKind} access to user-owned table '${tableName}'. Use getCurrentUserDataScope(), queryOwned(), findOwnedById(), or observeOwnedById() instead.`;
}

function getInvalidScopedHelperMessage(tableName, helperKind) {
  const tableKind = getTableKind(tableName);
  if (tableKind === helperKind) {
    return null;
  }

  if (tableKind === "child") {
    return `Avoid ${helperKind} scoped helper access to child-owned table '${tableName}'. Use user-data-access child helpers with a verified owned parent instead.`;
  }

  if (tableKind === "mixed") {
    return `Avoid ${helperKind} scoped helper access to mixed-visibility table '${tableName}'. Use user-data-access category helpers so system rows and current-user rows are handled together.`;
  }

  return `Avoid ${helperKind} scoped helper access to user-owned table '${tableName}'. Use user-data-access owned helpers instead.`;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require scoped helper APIs for local WatermelonDB access to user-owned data.",
      recommended: false,
    },
    schema: [],
    messages: {
      unsafeAccess: "{{message}}",
    },
  },

  create(context) {
    if (
      isAllowedFile(context.getFilename()) ||
      isTestFile(context.getFilename())
    ) {
      return {};
    }

    const collectionVariables = new Map();
    const databaseVariables = new Set(["database"]);

    return {
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== "Identifier") {
          return;
        }

        if (
          node.init?.type === "Identifier" &&
          databaseVariables.has(node.init.name)
        ) {
          databaseVariables.add(node.id.name);
          return;
        }

        const tableName = getDatabaseGetTable(node.init, databaseVariables);
        if (tableName && isProtectedTable(tableName)) {
          collectionVariables.set(node.id.name, tableName);
        }
      },

      CallExpression(node) {
        const helperKind = getScopedHelperKind(node);
        if (helperKind) {
          const tableName = getCollectionNameFromNode(
            node.arguments[0],
            collectionVariables,
            databaseVariables
          );
          if (!tableName || !isProtectedTable(tableName)) {
            return;
          }

          const message = getInvalidScopedHelperMessage(tableName, helperKind);
          if (message) {
            context.report({
              node,
              messageId: "unsafeAccess",
              data: { message },
            });
          }
          return;
        }

        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") {
          return;
        }

        const methodName = getPropertyName(callee);
        if (
          methodName !== "find" &&
          methodName !== "findAndObserve" &&
          methodName !== "query"
        ) {
          return;
        }

        const tableName = getCollectionNameFromMemberObject(
          callee.object,
          collectionVariables,
          databaseVariables
        );
        if (!tableName || !isProtectedTable(tableName)) {
          return;
        }

        context.report({
          node,
          messageId: "unsafeAccess",
          data: {
            message: getMessage(tableName, methodName),
          },
        });
      },
    };
  },
};
