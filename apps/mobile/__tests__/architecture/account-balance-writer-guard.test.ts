import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const REGISTRY_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/services/account-balance-writer-registry.ts"
);

const LOCAL_WRITER_IDS = [
  "account.cash.create-within-writer",
  "account.cash.prepare",
  "account.cash.prepare-named",
  "account.create",
  "account.pending.prepare",
  "account.edit-balance",
  "transaction.create",
  "transaction.update",
  "transaction.delete",
  "transaction.convert-to-transfer",
  "transaction.batch-delete",
  "transfer.create",
  "transfer.update",
  "transfer.delete",
  "transfer.convert-to-transaction",
  "transaction.batch-import",
] as const;

const INDIRECT_PATH_IDS = [
  "recurring.pay-now",
  "sms.review-durable",
  "sms.review-legacy",
  "sms.live-foreground",
  "sms.live-background",
  "sms.live-headless",
  "sms.live-auto-confirm",
  "sms.notification-confirm",
  "sms.live-atm",
  "debt.no-active-writer",
] as const;

const REMOTE_WRITER_IDS = [
  "sync.accounts.push-full-row",
  "sync.accounts.pull-full-row",
  "remote.accounts.authenticated-update",
  "fixture.accounts.upsert",
  "fixture.accounts.restore",
  "repair.accounts.recalculate-all",
] as const;

const REQUIRED_REGISTRY_IDS = [
  ...LOCAL_WRITER_IDS,
  ...INDIRECT_PATH_IDS,
  ...REMOTE_WRITER_IDS,
] as const;

const LEGACY_MUTATION_OWNER_BY_SYMBOL: Readonly<Record<string, string>> = {
  "apps/mobile/services/account-service.ts#createCashAccountWithinWriter":
    "account.cash.create-within-writer",
  "apps/mobile/services/account-service.ts#prepareCashAccount":
    "account.cash.prepare",
  "apps/mobile/services/account-service.ts#prepareNamedCashAccount":
    "account.cash.prepare-named",
  "apps/mobile/services/account-service.ts#createAccountForUser":
    "account.create",
  "apps/mobile/services/pending-account-service.ts#preparePendingAccounts":
    "account.pending.prepare",
  "apps/mobile/services/edit-account-service.ts#updateAccountWithinWriter":
    "account.edit-balance",
  "apps/mobile/services/transaction-service.ts#prepareTransactionCreateWithBalance":
    "transaction.create",
  "apps/mobile/services/transaction-financial-action-service.ts#buildPlan":
    "transaction.create",
  "apps/mobile/services/recurring-payment-financial-action-service.ts#buildPlan":
    "recurring.pay-now",
  "apps/mobile/services/financial-action-reconciliation-production.ts#installCanonicalSnapshotAtomically":
    "sync.accounts.pull-full-row",
  "apps/mobile/services/transaction-service.ts#updateTransaction":
    "transaction.update",
  "apps/mobile/services/transaction-service.ts#deleteTransaction":
    "transaction.delete",
  "apps/mobile/services/transaction-service.ts#convertTransactionToTransfer":
    "transaction.convert-to-transfer",
  "apps/mobile/services/transaction-service.ts#batchDeleteDisplayTransactions":
    "transaction.batch-delete",
  "apps/mobile/services/transfer-service.ts#createTransfer": "transfer.create",
  "apps/mobile/services/transfer-service.ts#updateTransfer": "transfer.update",
  "apps/mobile/services/transfer-service.ts#deleteTransfer": "transfer.delete",
  "apps/mobile/services/transfer-service.ts#convertTransferToTransaction":
    "transfer.convert-to-transaction",
  "apps/mobile/services/batch-create-transactions.ts#prepareBatchCreateTransactions":
    "transaction.batch-import",
};

function readText(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function listSourceFiles(directory: string): readonly string[] {
  const absoluteDirectory = path.join(REPO_ROOT, directory);
  return readdirSync(absoluteDirectory).flatMap((entry): readonly string[] => {
    const relativePath = path.posix.join(
      directory.replaceAll("\\", "/"),
      entry
    );
    const absolutePath = path.join(REPO_ROOT, relativePath);
    if (statSync(absolutePath).isDirectory()) {
      return listSourceFiles(relativePath);
    }
    return /\.(?:ts|tsx|js)$/.test(entry) ? [relativePath] : [];
  });
}

function findLocalBalanceMutationSymbols(): readonly string[] {
  const mutationSymbols = new Set<string>();
  const assignmentOperators = new Set([
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
  ]);

  listSourceFiles("apps/mobile/services").forEach((relativePath) => {
    const source = readText(relativePath);
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const visit = (node: ts.Node, owner = "<module>"): void => {
      const nextOwner =
        ts.isFunctionDeclaration(node) && node.name ? node.name.text : owner;
      if (
        ts.isBinaryExpression(node) &&
        assignmentOperators.has(node.operatorToken.kind) &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === "balance"
      ) {
        mutationSymbols.add(`${relativePath}#${nextOwner}`);
      }
      node.forEachChild((child) => visit(child, nextOwner));
    };
    visit(sourceFile);
  });

  return [...mutationSymbols].sort();
}

function extractRegisteredIds(source: string): ReadonlySet<string> {
  return new Set(
    [...source.matchAll(/writerId:\s*["']([^"']+)["']/g)].map(
      (match) => match[1] ?? ""
    )
  );
}

function extractRegistryStatuses(source: string): readonly string[] {
  return [...source.matchAll(/status:\s*["']([^"']+)["']/g)].map(
    (match) => match[1] ?? ""
  );
}

describe("issue #242 account-balance writer completeness guard", () => {
  it("keeps the current writer inventory exhaustive and categorized", () => {
    const inventory = readText(
      "specs/035-metals-module-redesign/dependencies/issue-242-writer-inventory.md"
    );

    expect(LOCAL_WRITER_IDS).toHaveLength(16);
    expect(INDIRECT_PATH_IDS).toHaveLength(10);
    expect(REMOTE_WRITER_IDS).toHaveLength(6);

    REQUIRED_REGISTRY_IDS.forEach((writerId) => {
      expect(inventory).toContain(`${writerId}`);
    });
    expect(inventory).toContain("16 active local mutation primitives");
    expect(inventory).toContain("10 distinct indirect domain/runtime paths");
    expect(inventory).toContain("6 remote/fixture/repair/sync bypasses");
    expect(inventory).toContain("zero active transaction triggers");
  });

  it("maps every current local balance assignment to one inventoried writer", () => {
    const discovered = findLocalBalanceMutationSymbols();
    const unknown = discovered.filter(
      (symbol) => LEGACY_MUTATION_OWNER_BY_SYMBOL[symbol] === undefined
    );

    expect(unknown).toEqual([]);
    expect(new Set(Object.values(LEGACY_MUTATION_OWNER_BY_SYMBOL))).toEqual(
      new Set([
        ...LOCAL_WRITER_IDS,
        "recurring.pay-now",
        "sync.accounts.pull-full-row",
      ])
    );
  });

  it("requires the T032 guard-or-block registry before any current writer may ship", () => {
    expect(existsSync(REGISTRY_PATH)).toBe(true);

    const registrySource = readText(
      "apps/mobile/services/account-balance-writer-registry.ts"
    );
    const registeredIds = extractRegisteredIds(registrySource);
    const statuses = extractRegistryStatuses(registrySource);

    REQUIRED_REGISTRY_IDS.forEach((writerId) => {
      expect(registeredIds).toContain(writerId);
    });
    expect(statuses).toHaveLength(REQUIRED_REGISTRY_IDS.length);
    expect(
      statuses.every((status) => status === "guarded" || status === "blocked")
    ).toBe(true);
  });

  it("keeps effect-free Cash account creation at the revision-zero boundary", () => {
    const accountService = readText("apps/mobile/services/account-service.ts");
    const registry = readText(
      "apps/mobile/services/account-balance-writer-registry.ts"
    );

    expect(accountService).toMatch(
      /createCashAccountWithinWriter[\s\S]*?acc\.balance = 0;[\s\S]*?acc\.financialRevision = "0";/
    );
    expect(registry).toContain(
      '{ writerId: "account.cash.create-within-writer", status: "guarded" }'
    );
  });

  it("keeps the no-active-debt path guarded by the assignment completeness scan", () => {
    const registry = readText(
      "apps/mobile/services/account-balance-writer-registry.ts"
    );

    expect(registry).toContain(
      '{ writerId: "debt.no-active-writer", status: "guarded" }'
    );
  });
});
