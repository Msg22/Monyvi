import type { ParseSmsMessage } from "./sms-ai-provider.ts";

const CARD_LAST_FOUR_PATTERN = /^\d{4}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExplicitCardLastFourEvidence(
  body: string,
  lastFour: string
): boolean {
  const cardMarker = "(?:\\bcard\\b|بطاقة|البطاقة|كارت|الكارت)";
  const maskedDigits = "(?:\\s*[*xX•#]){1,12}\\s*" + lastFour + "(?!\\d)";
  const endingDigits = "(?:(?:\\s*[*xX•#]){1,12}\\s*)?" + lastFour + "(?!\\d)";
  const englishEnding = "(?:ending|ends)\\s*(?:in|with)?\\s*" + endingDigits;
  const arabicEnding = "تنتهي\\s*(?:ب|بـ)?\\s*" + endingDigits;

  return (
    new RegExp(
      cardMarker + "\\s*(?:no\\.?\\s*|number\\s*)?" + maskedDigits,
      "iu"
    ).test(body) ||
    new RegExp(
      cardMarker + "\\s*(?:" + englishEnding + "|" + arabicEnding + ")",
      "iu"
    ).test(body)
  );
}

function readProhibitedOtherParents(
  categoryTree: string
): ReadonlyMap<string, string | null> {
  const parents = new Map<string, string | null>();
  let currentParent: string | null = null;

  for (const rawLine of categoryTree.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^(EXPENSE|INCOME)\b/i.test(line)) {
      currentParent = null;
      continue;
    }

    const l1Match = line.match(/^L1:\s*(.+)$/);
    if (l1Match) {
      currentParent = l1Match[1].trim() || null;
      continue;
    }

    const l2Match = line.match(/^L2:\s*(.+)$/);
    if (!l2Match) {
      continue;
    }

    for (const child of l2Match[1].split(",")) {
      const category = child.trim();
      if (category.endsWith("_other")) {
        parents.set(category, currentParent);
      }
    }
  }

  return parents;
}

export function groundSmsAiProviderResponse(
  value: unknown,
  messages: readonly ParseSmsMessage[],
  categoryTree: string
): unknown {
  if (!isRecord(value) || !Array.isArray(value.transactions)) {
    return value;
  }

  const messagesById = new Map(
    messages.map((message) => [message.id, message])
  );
  const prohibitedOtherParents = readProhibitedOtherParents(categoryTree);
  let hasChanges = false;

  const transactions = value.transactions.map((transaction) => {
    if (!isRecord(transaction)) {
      return transaction;
    }

    let normalized: Record<string, unknown> = transaction;

    if (
      typeof transaction.cardLast4 === "string" &&
      CARD_LAST_FOUR_PATTERN.test(transaction.cardLast4)
    ) {
      const sourceMessage =
        typeof transaction.messageId === "string"
          ? messagesById.get(transaction.messageId)
          : undefined;
      if (
        sourceMessage === undefined ||
        !hasExplicitCardLastFourEvidence(
          sourceMessage.body,
          transaction.cardLast4
        )
      ) {
        normalized = { ...normalized };
        delete normalized.cardLast4;
        hasChanges = true;
      }
    }

    if (
      typeof transaction.categorySystemName === "string" &&
      prohibitedOtherParents.has(transaction.categorySystemName)
    ) {
      const parent = prohibitedOtherParents.get(transaction.categorySystemName);
      if (normalized === transaction) {
        normalized = { ...normalized };
      }
      if (parent === null) {
        delete normalized.categorySystemName;
      } else {
        normalized.categorySystemName = parent;
      }
      hasChanges = true;
    }

    return normalized;
  });

  return hasChanges ? { ...value, transactions } : value;
}
