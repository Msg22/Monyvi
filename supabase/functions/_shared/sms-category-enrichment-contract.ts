const MAX_MERCHANTS = 20;
const MAX_MERCHANT_LENGTH = 160;
const MERCHANT_ID_PATTERN = /^merchant-[1-9]\d*$/;
import {
  SMS_ENRICHMENT_CATEGORY_SYSTEM_NAMES,
  isSmsEnrichmentCategorySystemName,
} from "./sms-category-taxonomy.ts";

export interface SmsCategoryMerchant {
  readonly id: string;
  readonly merchant: string;
  readonly transactionType: "EXPENSE";
  readonly messageFamily: "card_purchase";
}

export interface SmsCategoryRequest {
  readonly merchants: readonly SmsCategoryMerchant[];
}

export interface SmsCategoryResult {
  readonly merchantId: string;
  readonly categorySystemName: string;
  readonly confidence: number;
}

export interface SmsCategoryResponse {
  readonly categories: readonly SmsCategoryResult[];
}

export function buildSmsCategoryResponseSchema(
  maximumResultCount: number
): Readonly<Record<string, unknown>> {
  if (
    !Number.isInteger(maximumResultCount) ||
    maximumResultCount < 1 ||
    maximumResultCount > MAX_MERCHANTS
  ) {
    throw new Error("Invalid category response size");
  }
  return {
    type: "object",
    properties: {
      categories: {
        type: "array",
        maxItems: maximumResultCount,
        items: {
          type: "object",
          properties: {
            merchantId: {
              type: "string",
              pattern: "^merchant-[1-9]\\d*$",
            },
            categorySystemName: {
              type: "string",
              minLength: 1,
              maxLength: 64,
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["merchantId", "categorySystemName", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["categories"],
    additionalProperties: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}

function parseMerchant(value: unknown): SmsCategoryMerchant | null {
  if (!isRecord(value)) return null;
  if (
    !hasExactKeys(value, ["id", "merchant", "messageFamily", "transactionType"])
  ) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    !MERCHANT_ID_PATTERN.test(value.id) ||
    typeof value.merchant !== "string" ||
    value.merchant.trim().length === 0 ||
    value.merchant.length > MAX_MERCHANT_LENGTH ||
    value.transactionType !== "EXPENSE" ||
    value.messageFamily !== "card_purchase"
  ) {
    return null;
  }
  return {
    id: value.id,
    merchant: value.merchant.trim(),
    transactionType: "EXPENSE",
    messageFamily: "card_purchase",
  };
}

export function parseSmsCategoryRequest(
  value: unknown
): SmsCategoryRequest | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["merchants"]) ||
    !Array.isArray(value.merchants) ||
    value.merchants.length === 0 ||
    value.merchants.length > MAX_MERCHANTS
  ) {
    return null;
  }
  const merchants = value.merchants.map(parseMerchant);
  if (merchants.some((merchant) => merchant === null)) return null;
  const parsedMerchants = merchants as SmsCategoryMerchant[];
  const merchantIds = new Set(parsedMerchants.map(({ id }) => id));
  if (merchantIds.size !== parsedMerchants.length) return null;
  return { merchants: parsedMerchants };
}

function parseCategoryResult(value: unknown): SmsCategoryResult | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["categorySystemName", "confidence", "merchantId"]) ||
    typeof value.merchantId !== "string" ||
    typeof value.categorySystemName !== "string" ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    return null;
  }
  return {
    merchantId: value.merchantId,
    categorySystemName: value.categorySystemName,
    confidence: value.confidence,
  };
}

export function parseSmsCategoryResponse(
  value: unknown,
  request: SmsCategoryRequest
): SmsCategoryResponse | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["categories"]) ||
    !Array.isArray(value.categories)
  ) {
    return null;
  }
  const merchantIds = new Set(request.merchants.map(({ id }) => id));
  const identityCounts = new Map<string, number>();
  const parsedByMerchantId = new Map<string, SmsCategoryResult>();
  const poisonedMerchantIds = new Set<string>();

  for (const rawCategory of value.categories) {
    const rawMerchantId =
      isRecord(rawCategory) && typeof rawCategory.merchantId === "string"
        ? rawCategory.merchantId
        : null;
    if (rawMerchantId === null || !merchantIds.has(rawMerchantId)) continue;

    identityCounts.set(
      rawMerchantId,
      (identityCounts.get(rawMerchantId) ?? 0) + 1
    );
    const category = parseCategoryResult(rawCategory);
    if (
      category === null ||
      !isSmsEnrichmentCategorySystemName(category.categorySystemName)
    ) {
      poisonedMerchantIds.add(rawMerchantId);
      continue;
    }
    parsedByMerchantId.set(rawMerchantId, category);
  }

  const categories = [...parsedByMerchantId.entries()]
    .filter(
      ([merchantId]) =>
        identityCounts.get(merchantId) === 1 &&
        !poisonedMerchantIds.has(merchantId)
    )
    .map(([, category]) => category);
  return { categories };
}

export function buildSmsCategoryPrompt(request: SmsCategoryRequest): string {
  return [
    "Choose the best allowed system category for each merchant.",
    "Return each opaque merchant ID exactly once when classification is possible.",
    "Use only a category from the allowed list and provide confidence from 0 to 1.",
    `Allowed categories: ${JSON.stringify(SMS_ENRICHMENT_CATEGORY_SYSTEM_NAMES)}`,
    `Merchants: ${JSON.stringify(request.merchants)}`,
  ].join("\n");
}
