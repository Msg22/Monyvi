import type {
  FinancialActionDefinition,
  FinancialActionValidationInput,
  RegisteredActionPayload,
} from "./action-registry";

export interface MetalsSellPayloadV1 extends RegisteredActionPayload {
  readonly feeMinorUnits: string;
  readonly grossProceedsDecimal: string;
  readonly holdingId: string;
  readonly includeAccountCredit: false;
  readonly netProceedsMinorUnits: string;
  readonly notes: string;
  readonly rateReferenceIds: readonly string[];
}

interface Dependencies {
  readonly invalidPayloadCode: string;
  readonly isCanonicalNonNegativeMinorUnits: (value: string) => boolean;
  readonly isCanonicalPositiveFinancialDecimal: (value: string) => boolean;
  readonly maxCanonicalFinancialDigits: number;
  readonly utf8ByteLength: (value: string) => number;
}

interface RawPayloadObject {
  readonly [key: string]: RawPayloadValue;
}
type RawPayloadValue = string & RawPayloadObject & readonly RawPayloadValue[];
type RawPayload = Record<string, RawPayloadValue>;

export interface MetalsActionPayloadRegistry {
  readonly definitions: readonly FinancialActionDefinition[];
  readonly maxNameUtf8Bytes: number;
  readonly maxNotesUtf8Bytes: number;
  readonly maxRateReferenceIds: number;
  readonly maxReasonUtf8Bytes: number;
  readonly validateLegacySellV1: (value: unknown) => MetalsSellPayloadV1;
}

const MAX_NAME_UTF8_BYTES = 256;
const MAX_REASON_UTF8_BYTES = 1024;
const MAX_NOTES_UTF8_BYTES = 4096;
const MAX_RATE_REFERENCE_IDS = 16;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const APPROVED_CURRENCIES = new Set([
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
]);
const PURITY_CATALOG = {
  GOLD: {
    "gold-9999": "0.9999",
    "gold-999": "0.999",
    "gold-995": "0.995",
    "gold-97916": "0.97916",
    "gold-9167": "0.9167",
    "gold-875": "0.875",
    "gold-750": "0.75",
    "gold-58333": "0.58333",
    "gold-500": "0.5",
    "gold-375": "0.375",
  },
  SILVER: {
    "silver-9999": "0.9999",
    "silver-999": "0.999",
    "silver-925": "0.925",
    "silver-900": "0.9",
    "silver-800": "0.8",
    "silver-600": "0.6",
  },
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isUtcMillisecond(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value))
    return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function createMetalsActionPayloadRegistry(
  dependencies: Dependencies
): MetalsActionPayloadRegistry {
  const fail = (): never => {
    throw new Error(dependencies.invalidPayloadCode);
  };
  const boundedText = (
    value: unknown,
    maximum: number,
    nullable = false
  ): boolean =>
    (nullable && value === null) ||
    (typeof value === "string" &&
      dependencies.utf8ByteLength(value) <= maximum);
  const validDate = (
    value: unknown,
    input?: FinancialActionValidationInput
  ): boolean =>
    isDate(value) &&
    isDate(input?.cairoTodayDate) &&
    value <= input.cairoTodayDate;
  const validRevision = (value: unknown): value is string =>
    typeof value === "string" &&
    /^(?:0|[1-9][0-9]*)$/.test(value) &&
    (value.length < 19 ||
      (value.length === 19 && value <= "9223372036854775807"));
  const hasExpectedFreshness = (
    providerObservedAt: unknown,
    capturedAt: unknown,
    capturedFreshness: unknown
  ): boolean => {
    if (
      !isUtcMillisecond(capturedAt) ||
      (providerObservedAt !== null && !isUtcMillisecond(providerObservedAt))
    ) {
      return false;
    }
    const capturedTime = Date.parse(capturedAt);
    const providerTime =
      providerObservedAt === null ? null : Date.parse(providerObservedAt);
    const expectedFreshness =
      providerTime === null || providerTime > capturedTime
        ? "unknown"
        : capturedTime - providerTime > 86_400_000
          ? "stale"
          : "fresh";
    return capturedFreshness === expectedFreshness;
  };
  const requireObject = (value: unknown): RawPayload => {
    if (!isPlainObject(value)) fail();
    return value as RawPayload;
  };

  const validateMetadata = (raw: unknown): RegisteredActionPayload => {
    const value = requireObject(raw);
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["name", "notes"]) ||
      typeof value.name !== "string" ||
      value.name.trim().length === 0 ||
      !boundedText(value.name, MAX_NAME_UTF8_BYTES) ||
      !boundedText(value.notes, MAX_NOTES_UTF8_BYTES, true)
    )
      fail();
    return { name: value.name, notes: value.notes };
  };

  const validateFacts = (
    raw: unknown,
    input?: FinancialActionValidationInput,
    metalType?: "GOLD" | "SILVER"
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "physicalForm",
      "purchaseCurrency",
      "purchaseDate",
      "purchasePriceDecimal",
      "purityCatalogVersion",
      "purityCode",
      "purityFactorDecimal",
      "weightGramsDecimal",
    ];
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, keys) ||
      (value.physicalForm !== "COIN" &&
        value.physicalForm !== "BAR" &&
        value.physicalForm !== "JEWELRY" &&
        value.physicalForm !== null) ||
      typeof value.weightGramsDecimal !== "string" ||
      !dependencies.isCanonicalPositiveFinancialDecimal(
        value.weightGramsDecimal
      ) ||
      (value.weightGramsDecimal.split(".")[1]?.length ?? 0) > 3 ||
      typeof value.purityCode !== "string" ||
      typeof value.purityFactorDecimal !== "string" ||
      value.purityCatalogVersion !== "1" ||
      typeof value.purchasePriceDecimal !== "string" ||
      !dependencies.isCanonicalPositiveFinancialDecimal(
        value.purchasePriceDecimal
      ) ||
      typeof value.purchaseCurrency !== "string" ||
      !APPROVED_CURRENCIES.has(value.purchaseCurrency) ||
      !validDate(value.purchaseDate, input)
    )
      fail();
    const catalogMetal = value.purityCode.startsWith("gold-")
      ? "GOLD"
      : value.purityCode.startsWith("silver-")
        ? "SILVER"
        : null;
    if (
      catalogMetal === null ||
      (metalType !== undefined && catalogMetal !== metalType) ||
      PURITY_CATALOG[catalogMetal][value.purityCode as never] !==
        value.purityFactorDecimal
    )
      fail();
    return {
      physicalForm: value.physicalForm,
      weightGramsDecimal: value.weightGramsDecimal,
      purityCode: value.purityCode,
      purityFactorDecimal: value.purityFactorDecimal,
      purityCatalogVersion: value.purityCatalogVersion,
      purchasePriceDecimal: value.purchasePriceDecimal,
      purchaseCurrency: value.purchaseCurrency,
      purchaseDate: value.purchaseDate,
    };
  };

  const validateSnapshots = (
    rawValue: unknown,
    roles: readonly string[],
    metalType: "GOLD" | "SILVER",
    currency: string
  ): readonly RegisteredActionPayload[] => {
    if (!Array.isArray(rawValue)) fail();
    const value = rawValue as RawPayloadValue[];
    if (value.length === 0) return Object.freeze([]);
    if (value.length !== roles.length) fail();
    const ids = new Set<string>();
    const seenRoles = new Set<string>();
    const snapshots = value.map((raw): RegisteredActionPayload => {
      const keys = [
        "capturedAt",
        "capturedFreshness",
        "instrumentCode",
        "kind",
        "orientation",
        "providerObservedAt",
        "quality",
        "referenceId",
        "role",
        "source",
        "unit",
        "valueDecimal",
      ];
      if (
        !isPlainObject(raw) ||
        !hasExactKeys(raw, keys) ||
        typeof raw.referenceId !== "string" ||
        !UUID_PATTERN.test(raw.referenceId) ||
        (raw.role !== "acquisition_metal" &&
          raw.role !== "acquisition_purchase_currency" &&
          raw.role !== "terminal_metal" &&
          raw.role !== "terminal_purchase_currency" &&
          raw.role !== "terminal_proceeds_currency") ||
        (raw.kind !== "metal" && raw.kind !== "currency") ||
        typeof raw.instrumentCode !== "string" ||
        typeof raw.valueDecimal !== "string" ||
        !dependencies.isCanonicalPositiveFinancialDecimal(raw.valueDecimal) ||
        (raw.unit !== "usd_per_pure_gram" &&
          raw.unit !== "usd_per_currency_unit" &&
          raw.unit !== "currency_units_per_usd") ||
        (raw.orientation !== "quote_per_base" &&
          raw.orientation !== "base_per_quote") ||
        (raw.providerObservedAt !== null &&
          !isUtcMillisecond(raw.providerObservedAt)) ||
        (raw.source !== null &&
          (typeof raw.source !== "string" || raw.source.trim().length === 0)) ||
        raw.quality !== "valid" ||
        !isUtcMillisecond(raw.capturedAt) ||
        !hasExpectedFreshness(
          raw.providerObservedAt,
          raw.capturedAt,
          raw.capturedFreshness
        )
      )
        fail();
      const metalRole =
        raw.role === "acquisition_metal" || raw.role === "terminal_metal";
      const currencyCode = raw.instrumentCode.slice("currency:".length);
      if (
        (raw.kind === "metal") !== metalRole ||
        (raw.kind === "metal" &&
          (raw.instrumentCode !== `metal:${metalType}` ||
            raw.unit !== "usd_per_pure_gram" ||
            raw.orientation !== "quote_per_base")) ||
        (raw.kind === "currency" &&
          (raw.instrumentCode !== `currency:${currency}` ||
            !APPROVED_CURRENCIES.has(currencyCode) ||
            !(
              (raw.unit === "usd_per_currency_unit" &&
                raw.orientation === "quote_per_base") ||
              (raw.unit === "currency_units_per_usd" &&
                raw.orientation === "base_per_quote")
            ))) ||
        (raw.instrumentCode === "currency:USD" && raw.valueDecimal !== "1")
      )
        fail();
      ids.add(raw.referenceId);
      seenRoles.add(raw.role);
      return raw;
    });
    if (
      ids.size !== snapshots.length ||
      seenRoles.size !== snapshots.length ||
      roles.some((role) => !seenRoles.has(role))
    )
      fail();
    return Object.freeze(snapshots);
  };

  const validateLinks = (
    value: Readonly<Record<string, unknown>>,
    add: boolean,
    undo: boolean
  ): void => {
    const predecessor =
      typeof value.predecessorEventId === "string" &&
      UUID_PATTERN.test(value.predecessorEventId);
    const reversal =
      typeof value.reversesEventId === "string" &&
      UUID_PATTERN.test(value.reversesEventId);
    if (
      typeof value.holdingId !== "string" ||
      !UUID_PATTERN.test(value.holdingId) ||
      (add
        ? value.expectedHoldingRevision !== null
        : !validRevision(value.expectedHoldingRevision)) ||
      (add
        ? value.predecessorEventId !== null || value.reversesEventId !== null
        : !predecessor || (undo ? !reversal : value.reversesEventId !== null))
    )
      fail();
  };

  const validateLegacySellV1 = (raw: unknown): MetalsSellPayloadV1 => {
    const value = requireObject(raw);
    const keys = [
      "feeMinorUnits",
      "grossProceedsDecimal",
      "holdingId",
      "includeAccountCredit",
      "netProceedsMinorUnits",
      "notes",
      "rateReferenceIds",
    ];
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, keys) ||
      !Array.isArray(value.rateReferenceIds) ||
      value.rateReferenceIds.length > MAX_RATE_REFERENCE_IDS ||
      typeof value.feeMinorUnits !== "string" ||
      !dependencies.isCanonicalNonNegativeMinorUnits(value.feeMinorUnits) ||
      typeof value.grossProceedsDecimal !== "string" ||
      !dependencies.isCanonicalPositiveFinancialDecimal(
        value.grossProceedsDecimal
      ) ||
      typeof value.holdingId !== "string" ||
      !UUID_PATTERN.test(value.holdingId) ||
      (value.includeAccountCredit as unknown) !== false ||
      typeof value.netProceedsMinorUnits !== "string" ||
      !dependencies.isCanonicalNonNegativeMinorUnits(
        value.netProceedsMinorUnits
      ) ||
      typeof value.notes !== "string" ||
      !boundedText(value.notes, MAX_NOTES_UTF8_BYTES) ||
      !value.rateReferenceIds.every(
        (id: unknown) => typeof id === "string" && UUID_PATTERN.test(id)
      )
    )
      fail();
    return {
      feeMinorUnits: value.feeMinorUnits,
      grossProceedsDecimal: value.grossProceedsDecimal,
      holdingId: value.holdingId,
      includeAccountCredit: false,
      netProceedsMinorUnits: value.netProceedsMinorUnits,
      notes: value.notes,
      rateReferenceIds: Object.freeze([...value.rateReferenceIds] as string[]),
    };
  };

  const validateAdd = (
    raw: unknown,
    input?: FinancialActionValidationInput
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "expectedHoldingRevision",
      "holdingId",
      "materialFacts",
      "metalType",
      "metadata",
      "predecessorEventId",
      "rateSnapshots",
      "reversesEventId",
    ];
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, keys) ||
      (value.metalType !== "GOLD" && value.metalType !== "SILVER")
    )
      fail();
    validateLinks(value, true, false);
    const materialFacts = validateFacts(
      value.materialFacts,
      input,
      value.metalType as "GOLD" | "SILVER"
    );
    return {
      holdingId: value.holdingId,
      expectedHoldingRevision: null,
      predecessorEventId: null,
      reversesEventId: null,
      metalType: value.metalType,
      metadata: validateMetadata(value.metadata),
      materialFacts,
      rateSnapshots: validateSnapshots(
        value.rateSnapshots,
        ["acquisition_metal", "acquisition_purchase_currency"],
        value.metalType as "GOLD" | "SILVER",
        materialFacts.purchaseCurrency as string
      ),
    };
  };

  const validateCorrect = (
    raw: unknown,
    input?: FinancialActionValidationInput
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "expectedHoldingRevision",
      "holdingId",
      "materialCorrection",
      "metadataChange",
      "predecessorEventId",
      "reversesEventId",
    ];
    if (!isPlainObject(value) || !hasExactKeys(value, keys)) fail();
    validateLinks(value, false, false);
    const metadataChange =
      value.metadataChange === null
        ? null
        : (() => {
            if (
              !isPlainObject(value.metadataChange) ||
              !hasExactKeys(value.metadataChange, ["before", "after"])
            )
              fail();
            const before = validateMetadata(value.metadataChange.before);
            const after = validateMetadata(value.metadataChange.after);
            if (JSON.stringify(before) === JSON.stringify(after)) fail();
            return { before, after };
          })();
    const materialCorrection =
      value.materialCorrection === null
        ? null
        : (() => {
            if (
              !isPlainObject(value.materialCorrection) ||
              !hasExactKeys(value.materialCorrection, [
                "after",
                "before",
                "rateSnapshots",
                "reason",
              ])
            )
              fail();
            const before = validateFacts(
              value.materialCorrection.before,
              input
            );
            const after = validateFacts(value.materialCorrection.after, input);
            if (
              JSON.stringify(before) === JSON.stringify(after) ||
              (before.purityCode as string).startsWith("gold-") !==
                (after.purityCode as string).startsWith("gold-") ||
              !boundedText(
                value.materialCorrection.reason,
                MAX_REASON_UTF8_BYTES
              ) ||
              (value.materialCorrection.reason as string).trim().length === 0
            )
              fail();
            const metalType = (after.purityCode as string).startsWith("gold-")
              ? "GOLD"
              : "SILVER";
            return {
              before,
              after,
              reason: value.materialCorrection.reason as string,
              rateSnapshots: validateSnapshots(
                value.materialCorrection.rateSnapshots,
                ["acquisition_metal", "acquisition_purchase_currency"],
                metalType,
                after.purchaseCurrency as string
              ),
            };
          })();
    if (metadataChange === null && materialCorrection === null) fail();
    return {
      holdingId: value.holdingId,
      expectedHoldingRevision: value.expectedHoldingRevision,
      predecessorEventId: value.predecessorEventId,
      reversesEventId: null,
      metadataChange,
      materialCorrection,
    };
  };

  const validateSell = (
    raw: unknown,
    input?: FinancialActionValidationInput
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "expectedHoldingRevision",
      "feeMinorUnits",
      "grossProceedsMinorUnits",
      "holdingId",
      "metalType",
      "netProceedsMinorUnits",
      "notes",
      "predecessorEventId",
      "rateSnapshots",
      "reversesEventId",
      "saleCurrency",
      "saleDate",
    ];
    if (!isPlainObject(value) || !hasExactKeys(value, keys)) fail();
    validateLinks(value, false, false);
    if (
      !validDate(value.saleDate, input) ||
      (value.metalType !== "GOLD" && value.metalType !== "SILVER") ||
      typeof value.saleCurrency !== "string" ||
      !APPROVED_CURRENCIES.has(value.saleCurrency) ||
      !boundedText(value.notes, MAX_NOTES_UTF8_BYTES, true) ||
      typeof value.grossProceedsMinorUnits !== "string" ||
      typeof value.feeMinorUnits !== "string" ||
      typeof value.netProceedsMinorUnits !== "string" ||
      !dependencies.isCanonicalNonNegativeMinorUnits(
        value.grossProceedsMinorUnits
      ) ||
      !dependencies.isCanonicalNonNegativeMinorUnits(value.feeMinorUnits) ||
      !dependencies.isCanonicalNonNegativeMinorUnits(
        value.netProceedsMinorUnits
      )
    )
      fail();
    const gross = BigInt(value.grossProceedsMinorUnits);
    const fee = BigInt(value.feeMinorUnits);
    const net = BigInt(value.netProceedsMinorUnits);
    if (fee > gross || net !== gross - fee) fail();
    return {
      holdingId: value.holdingId,
      expectedHoldingRevision: value.expectedHoldingRevision,
      predecessorEventId: value.predecessorEventId,
      reversesEventId: null,
      metalType: value.metalType,
      saleDate: value.saleDate,
      saleCurrency: value.saleCurrency,
      grossProceedsMinorUnits: value.grossProceedsMinorUnits,
      feeMinorUnits: value.feeMinorUnits,
      netProceedsMinorUnits: value.netProceedsMinorUnits,
      notes: value.notes,
      rateSnapshots: validateSnapshots(
        value.rateSnapshots,
        [
          "terminal_metal",
          "terminal_purchase_currency",
          "terminal_proceeds_currency",
        ],
        value.metalType as "GOLD" | "SILVER",
        value.saleCurrency
      ),
    };
  };

  const validateDispose = (
    raw: unknown,
    input?: FinancialActionValidationInput
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "disposalDate",
      "expectedHoldingRevision",
      "holdingId",
      "notes",
      "predecessorEventId",
      "reason",
      "reversesEventId",
    ];
    if (!isPlainObject(value) || !hasExactKeys(value, keys)) fail();
    validateLinks(value, false, false);
    if (
      !validDate(value.disposalDate, input) ||
      !boundedText(value.reason, MAX_REASON_UTF8_BYTES) ||
      (value.reason as string).trim().length === 0 ||
      !boundedText(value.notes, MAX_NOTES_UTF8_BYTES, true)
    )
      fail();
    return {
      holdingId: value.holdingId,
      expectedHoldingRevision: value.expectedHoldingRevision,
      predecessorEventId: value.predecessorEventId,
      reversesEventId: null,
      disposalDate: value.disposalDate,
      reason: value.reason,
      notes: value.notes,
    };
  };

  const validateEventOnly = (
    raw: unknown,
    undo: boolean
  ): RegisteredActionPayload => {
    const value = requireObject(raw);
    const keys = [
      "expectedHoldingRevision",
      "holdingId",
      "predecessorEventId",
      "reversesEventId",
    ];
    if (!isPlainObject(value) || !hasExactKeys(value, keys)) fail();
    validateLinks(value, false, undo);
    return {
      holdingId: value.holdingId,
      expectedHoldingRevision: value.expectedHoldingRevision,
      predecessorEventId: value.predecessorEventId,
      reversesEventId: value.reversesEventId,
    };
  };

  return Object.freeze({
    definitions: Object.freeze([
      {
        domain: "metals",
        kind: "add",
        payloadVersion: "metals.add/v1",
        validatePayload: validateAdd,
      },
      {
        domain: "metals",
        kind: "correct",
        payloadVersion: "metals.correct/v1",
        validatePayload: validateCorrect,
      },
      {
        domain: "metals",
        kind: "sell",
        payloadVersion: "metals.sell/v2",
        validatePayload: validateSell,
      },
      {
        domain: "metals",
        kind: "dispose",
        payloadVersion: "metals.dispose/v1",
        validatePayload: validateDispose,
      },
      {
        domain: "metals",
        kind: "delete",
        payloadVersion: "metals.delete/v1",
        validatePayload: (value) => validateEventOnly(value, false),
      },
      {
        domain: "metals",
        kind: "undo",
        payloadVersion: "metals.undo/v1",
        validatePayload: (value) => validateEventOnly(value, true),
      },
    ]),
    maxNameUtf8Bytes: MAX_NAME_UTF8_BYTES,
    maxNotesUtf8Bytes: MAX_NOTES_UTF8_BYTES,
    maxRateReferenceIds: MAX_RATE_REFERENCE_IDS,
    maxReasonUtf8Bytes: MAX_REASON_UTF8_BYTES,
    validateLegacySellV1,
  });
}
