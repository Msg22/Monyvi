/**
 * Service-layer decoder/shaper for trustworthy realized metal sale results.
 *
 * V1 supports whole-holding sales only. This module decodes immutable
 * `metals.sell/v2` evidence (the production-registered sell payload; issue
 * #282's "metals.sell/v1" wording predates the canonical v1→v2 rename
 * recorded in
 * `specs/035-metals-module-redesign/evidence/action-payload-registry-contract.md`)
 * and shapes the authoritative combined profit/loss plus net proceeds for
 * portfolio, recent-History, and terminal-detail consumers.
 *
 * It never substitutes current market rates for historical evidence, never
 * reports unavailable data as zero, and fails closed on foreign, ineffective,
 * hidden, rejected, or reconciliation-incomplete evidence by making only the
 * dependent results unavailable.
 */
import {
  calculatePureGrams,
  calculateRealizedAttribution,
  parseFinancialActionEnvelopeJson,
  assertFinancialActionStateEvidence,
  fromMinorUnits,
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
  validateAndNormalizeRateReference,
  type AttributionUnavailableReason,
  type CurrencyInstrumentCode,
  type ExactRateReference,
  type MetalInstrumentCode,
  type MetalsIsoCurrencyCode,
  type RateReferenceExpectation,
  type FinancialActionServerOutcome,
  type FinancialActionEnvelopeV1,
  type FinancialActionState,
  type RealizedAttribution,
} from "@monyvi/logic";

const SUPPORTED_ENVELOPE_VERSION = "monyvi.financial-action/v1";
const SUPPORTED_SELL_PAYLOAD_VERSION = "metals.sell/v2";
const SELL_PAYLOAD_FIELDS: readonly string[] = Object.freeze([
  "expectedHoldingRevision",
  "feeMinorUnits",
  "grossProceedsMinorUnits",
  "holdingId",
  "metalType",
  "netProceedsMinorUnits",
  "notes",
  "predecessorEventId",
  "purchaseCurrency",
  "rateSnapshots",
  "reversesEventId",
  "saleCurrency",
  "saleDate",
]);
const RATE_SNAPSHOT_FIELDS: readonly string[] = Object.freeze([
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
]);
const TERMINAL_SNAPSHOT_ROLES: readonly string[] = Object.freeze([
  "terminal_metal",
  "terminal_purchase_currency",
  "terminal_proceeds_currency",
]);
const REPORTABLE_RECONCILIATION_STATES: readonly string[] = Object.freeze([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);
const CANONICAL_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_CANONICAL_MINOR_UNIT_DIGITS = 50;
const CANONICAL_REVISION_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_CANONICAL_REVISION = "9223372036854775807";
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type MetalRealizedSaleUnavailableReason =
  | "excluded_sale"
  | "foreign_sale_evidence"
  | "inconsistent_sale_proceeds"
  | "invalid_sale_evidence"
  | "malformed_sale_amounts"
  | "unsupported_sale_currency"
  | "unsupported_sale_evidence"
  | AttributionUnavailableReason;

export interface MetalRealizedSaleEvidence {
  readonly actionId: string;
  readonly attribution: RealizedAttribution;
  readonly breakdownAvailable: boolean;
  readonly breakdownReasons: readonly AttributionUnavailableReason[];
  readonly combinedDecimal: string;
  readonly feeDecimal: string;
  readonly grossProceedsDecimal: string;
  readonly holdingId: string;
  readonly netProceedsDecimal: string;
  readonly proceedsCurrency: MetalsIsoCurrencyCode;
  readonly purchaseCurrency: MetalsIsoCurrencyCode;
}

export type MetalRealizedSaleOutcome =
  | { readonly available: true; readonly value: MetalRealizedSaleEvidence }
  | {
      readonly available: false;
      readonly reason: MetalRealizedSaleUnavailableReason;
    };

export interface MetalSellHoldingSnapshot {
  readonly acquisitionActionId: string | null;
  readonly effectiveEventId: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly metalType: "GOLD" | "SILVER";
  readonly purityFactorDecimal: string | null;
  readonly purchaseCurrency: MetalsIsoCurrencyCode | null;
  readonly purchasePriceDecimal: string | null;
  readonly reconciliationState: string;
  readonly status: string;
  readonly userId: string;
  readonly weightGramsDecimal: string | null;
}

export interface MetalSellEventSnapshot {
  readonly actionId: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly kind: string;
  readonly payloadJson: string;
  readonly userId: string;
}

export interface MetalSellEventCandidate {
  readonly actionId?: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly kind?: string;
  readonly payloadJson?: string;
  readonly userId: string;
}

export function toMetalSellEventSnapshot(
  event: MetalSellEventCandidate | undefined
): MetalSellEventSnapshot | null {
  if (
    event === undefined ||
    event.actionId === undefined ||
    event.kind === undefined ||
    event.payloadJson === undefined
  ) {
    return null;
  }
  return {
    actionId: event.actionId,
    deleted: event.deleted,
    holdingId: event.holdingId,
    id: event.id,
    isEffective: event.isEffective,
    kind: event.kind,
    payloadJson: event.payloadJson,
    userId: event.userId,
  };
}

export interface MetalSellGroupSnapshot {
  readonly actionId: string;
  readonly deleted: boolean;
  readonly domain: string;
  readonly domainReferenceId: string;
  readonly kind: string;
  readonly payloadJson: string;
  readonly outcomeJson: string | null;
  readonly rejectionCode: string | null;
  readonly serverOutcome: string | null;
  readonly state: string;
  readonly userId: string;
}

export interface MetalSellRateReferenceSnapshot {
  readonly actionId: string;
  readonly capturedAt: Date;
  readonly capturedFreshness: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly instrumentCode: string;
  readonly kind: string;
  readonly orientation: string;
  readonly providerObservedAt: Date | null;
  readonly quality: string;
  readonly role: string;
  readonly source: string | null;
  readonly unit: string;
  readonly userId: string;
  readonly valueDecimal: string;
}

export interface MetalRealizedSaleEvidenceInput {
  readonly acquisitionReferences: readonly MetalSellRateReferenceSnapshot[];
  readonly event: MetalSellEventSnapshot | null;
  readonly group: MetalSellGroupSnapshot | null;
  readonly holding: MetalSellHoldingSnapshot;
  readonly userId: string;
}

type ParsedRecord = Readonly<Record<string, unknown>>;

export function shapeMetalRealizedSaleEvidence(
  input: MetalRealizedSaleEvidenceInput
): MetalRealizedSaleOutcome {
  const exclusion = classifySaleExclusion(input);
  if (exclusion !== null) {
    return { available: false, reason: exclusion };
  }
  const { event, group, holding, userId } = input;
  if (event === null || group === null) {
    return { available: false, reason: "excluded_sale" };
  }

  const envelope = parseRecord(group.payloadJson);
  if (envelope === null) {
    return { available: false, reason: "unsupported_sale_evidence" };
  }
  if (envelope.userId !== userId) {
    return { available: false, reason: "foreign_sale_evidence" };
  }
  if (
    envelope.envelopeVersion !== SUPPORTED_ENVELOPE_VERSION ||
    envelope.payloadVersion !== SUPPORTED_SELL_PAYLOAD_VERSION
  ) {
    return { available: false, reason: "unsupported_sale_evidence" };
  }
  if (
    envelope.actionId !== group.actionId ||
    envelope.actionId !== event.actionId ||
    envelope.domain !== "metals" ||
    envelope.domain !== group.domain ||
    envelope.kind !== "sell" ||
    envelope.kind !== group.kind ||
    envelope.domainReferenceId !== holding.holdingId ||
    envelope.domainReferenceId !== group.domainReferenceId ||
    !Array.isArray(envelope.accountGuards) ||
    envelope.accountGuards.length !== 0 ||
    !isUtcMillisecond(envelope.occurredAt)
  ) {
    return { available: false, reason: "invalid_sale_evidence" };
  }

  const payload = asRecord(envelope.payload);
  const eventPayload = parseRecord(event.payloadJson);
  if (
    payload === null ||
    !hasExactFields(payload, SELL_PAYLOAD_FIELDS) ||
    eventPayload === null ||
    canonicalRecordKey(payload) !== canonicalRecordKey(eventPayload)
  ) {
    return { available: false, reason: "unsupported_sale_evidence" };
  }
  const amounts = readSaleAmounts(payload);
  if (amounts.kind === "malformed") {
    return { available: false, reason: "malformed_sale_amounts" };
  }
  if (amounts.kind === "inconsistent") {
    return { available: false, reason: "inconsistent_sale_proceeds" };
  }
  if (parseSaleEnvelope(group.payloadJson) === null) {
    return { available: false, reason: "unsupported_sale_evidence" };
  }
  if (
    payload.holdingId !== holding.holdingId ||
    payload.metalType !== holding.metalType ||
    payload.purchaseCurrency !== holding.purchaseCurrency ||
    !isCalendarDate(payload.saleDate) ||
    !isRevision(payload.expectedHoldingRevision) ||
    payload.reversesEventId !== null ||
    !isNullableString(payload.predecessorEventId) ||
    !isNullableString(payload.notes)
  ) {
    return { available: false, reason: "invalid_sale_evidence" };
  }
  const purchaseCurrency = payload.purchaseCurrency;
  const proceedsCurrency = payload.saleCurrency;
  if (
    typeof purchaseCurrency !== "string" ||
    typeof proceedsCurrency !== "string" ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency) ||
    !isSupportedMetalsIsoCurrencyCode(proceedsCurrency)
  ) {
    return { available: false, reason: "unsupported_sale_currency" };
  }
  const snapshots = readTerminalSnapshots(
    payload.rateSnapshots,
    holding.metalType,
    purchaseCurrency,
    proceedsCurrency
  );
  if (!snapshots.valid) {
    return { available: false, reason: "invalid_sale_evidence" };
  }

  const purchaseCurrencyInstrumentCode: CurrencyInstrumentCode = `currency:${purchaseCurrency}`;
  const proceedsCurrencyInstrumentCode: CurrencyInstrumentCode = `currency:${proceedsCurrency}`;
  const purchaseCurrencyMinorUnits = resolveMetalsCurrencyMinorUnits(
    purchaseCurrencyInstrumentCode
  );
  const proceedsCurrencyMinorUnits = resolveMetalsCurrencyMinorUnits(
    proceedsCurrencyInstrumentCode
  );
  if (
    purchaseCurrencyMinorUnits === null ||
    proceedsCurrencyMinorUnits === null
  ) {
    return { available: false, reason: "unsupported_sale_currency" };
  }
  const grossProceedsDecimal = fromMinorUnits(
    amounts.grossMinorUnits,
    proceedsCurrencyMinorUnits
  );
  const feesDecimal = fromMinorUnits(
    amounts.feeMinorUnits,
    proceedsCurrencyMinorUnits
  );
  const netProceedsDecimal = fromMinorUnits(
    amounts.netMinorUnits,
    proceedsCurrencyMinorUnits
  );
  const metalInstrumentCode: MetalInstrumentCode = `metal:${holding.metalType}`;
  const result = calculateRealizedAttribution({
    acquisitionCurrencyRate: findAcquisitionReference(input, {
      expectation: {
        instrumentCode: purchaseCurrencyInstrumentCode,
        role: "acquisition_purchase_currency",
      },
    }),
    acquisitionMetalRate: findAcquisitionReference(input, {
      expectation: {
        instrumentCode: metalInstrumentCode,
        role: "acquisition_metal",
      },
    }),
    feesDecimal,
    grossProceedsDecimal,
    metalInstrumentCode,
    proceedsCurrencyAtSaleRate: snapshots.terminal_proceeds_currency,
    proceedsCurrencyDecimalPlaces: proceedsCurrencyMinorUnits,
    proceedsCurrencyInstrumentCode,
    purchaseCostDecimal: holding.purchasePriceDecimal,
    purchaseCurrencyAtSaleRate: snapshots.terminal_purchase_currency,
    purchaseCurrencyDecimalPlaces: purchaseCurrencyMinorUnits,
    purchaseCurrencyInstrumentCode,
    pureGramsDecimal: toPureGramsDecimal(holding),
    saleMetalRate: snapshots.terminal_metal,
  });
  if (!result.available) {
    return { available: false, reason: result.reason };
  }

  return {
    available: true,
    value: {
      actionId: event.actionId,
      attribution: result.value,
      breakdownAvailable: result.value.breakdown.available,
      breakdownReasons: result.value.breakdown.available
        ? []
        : result.value.breakdown.reasons,
      combinedDecimal: result.value.combinedDecimal,
      feeDecimal: feesDecimal,
      grossProceedsDecimal,
      holdingId: holding.holdingId,
      netProceedsDecimal,
      proceedsCurrency,
      purchaseCurrency,
    },
  };
}

function classifySaleExclusion(
  input: MetalRealizedSaleEvidenceInput
): MetalRealizedSaleUnavailableReason | null {
  const { event, group, holding, userId } = input;
  if (
    holding.userId !== userId ||
    (event !== null && event.userId !== userId) ||
    (group !== null && group.userId !== userId)
  ) {
    return "foreign_sale_evidence";
  }
  if (
    holding.status !== "sold" ||
    !holding.isVisible ||
    !REPORTABLE_RECONCILIATION_STATES.includes(holding.reconciliationState) ||
    event === null ||
    group === null ||
    event.deleted ||
    group.deleted ||
    !event.isEffective ||
    event.kind !== "sell" ||
    group.kind !== "sell" ||
    event.holdingId !== holding.holdingId ||
    group.domainReferenceId !== holding.holdingId ||
    event.id !== holding.effectiveEventId ||
    event.actionId !== group.actionId ||
    !isReportableGroup(group)
  ) {
    return "excluded_sale";
  }
  return null;
}

function isReportableGroup(group: MetalSellGroupSnapshot): boolean {
  if (
    !isFinancialActionState(group.state) ||
    (group.serverOutcome !== null &&
      !isFinancialActionServerOutcome(group.serverOutcome))
  ) {
    return false;
  }

  try {
    assertFinancialActionStateEvidence(group.state, {
      outcomeJson: group.outcomeJson,
      rejectionCode: group.rejectionCode,
      serverOutcome: group.serverOutcome,
    });
  } catch {
    return false;
  }

  return (
    group.state === "local_complete" ||
    group.state === "sync_pending" ||
    group.state === "sync_failed" ||
    group.state === "accepted"
  );
}

function isFinancialActionState(value: string): value is FinancialActionState {
  return (
    value === "pending_local" ||
    value === "local_complete" ||
    value === "sync_pending" ||
    value === "sync_failed" ||
    value === "accepted" ||
    value === "rejected_compensating" ||
    value === "reconciled" ||
    value === "reconciliation_incomplete"
  );
}

function isFinancialActionServerOutcome(
  value: string
): value is FinancialActionServerOutcome {
  return (
    value === "accepted" ||
    value === "idempotent" ||
    value === "stale" ||
    value === "rejected"
  );
}

function parseSaleEnvelope(value: string): FinancialActionEnvelopeV1 | null {
  const rawEnvelope = parseRecord(value);
  const rawPayload =
    rawEnvelope === null ? null : asRecord(rawEnvelope.payload);
  const saleDate = rawPayload?.saleDate;
  if (typeof saleDate !== "string" || !isCalendarDate(saleDate)) {
    return null;
  }

  try {
    return parseFinancialActionEnvelopeJson(value, undefined, {
      cairoTodayDate: saleDate,
    });
  } catch {
    return null;
  }
}

function parseRecord(value: string): ParsedRecord | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): ParsedRecord | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  return value as Readonly<Record<string, unknown>>;
}

function canonicalRecordKey(value: ParsedRecord): string {
  const entries = Object.keys(value)
    .sort()
    .map((key) => [key, canonicalValue(value[key])]);
  return JSON.stringify(entries);
}

function canonicalValue(value: unknown): unknown {
  const record = asRecord(value);
  if (record !== null) {
    return Object.keys(record)
      .sort()
      .map((key) => [key, canonicalValue(record[key])]);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalValue(entry));
  }
  return value;
}

function hasExactFields(
  value: ParsedRecord,
  fields: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === fields.length &&
    fields.every((field) => actual.includes(field))
  );
}

type SaleAmounts =
  | {
      readonly kind: "valid";
      readonly feeMinorUnits: string;
      readonly grossMinorUnits: string;
      readonly netMinorUnits: string;
    }
  | { readonly kind: "malformed" }
  | { readonly kind: "inconsistent" };

function readSaleAmounts(payload: ParsedRecord): SaleAmounts {
  const gross = payload.grossProceedsMinorUnits;
  const fee = payload.feeMinorUnits;
  const net = payload.netProceedsMinorUnits;
  if (
    !isCanonicalMinorUnits(gross) ||
    !isCanonicalMinorUnits(fee) ||
    !isCanonicalMinorUnits(net)
  ) {
    return { kind: "malformed" };
  }
  const grossValue = BigInt(gross);
  const feeValue = BigInt(fee);
  const netValue = BigInt(net);
  if (grossValue === 0n) {
    return { kind: "malformed" };
  }
  if (feeValue > grossValue || netValue !== grossValue - feeValue) {
    return { kind: "inconsistent" };
  }
  return {
    kind: "valid",
    feeMinorUnits: fee,
    grossMinorUnits: gross,
    netMinorUnits: net,
  };
}

function isCanonicalMinorUnits(value: unknown): value is string {
  return (
    typeof value === "string" &&
    CANONICAL_MINOR_UNITS_PATTERN.test(value) &&
    value.length <= MAX_CANONICAL_MINOR_UNIT_DIGITS
  );
}

function isRevision(value: unknown): boolean {
  return (
    typeof value === "string" &&
    CANONICAL_REVISION_PATTERN.test(value) &&
    (value.length < MAX_CANONICAL_REVISION.length ||
      (value.length === MAX_CANONICAL_REVISION.length &&
        value <= MAX_CANONICAL_REVISION))
  );
}

function isNullableString(value: unknown): boolean {
  return typeof value === "string" || value === null;
}

function isCalendarDate(value: unknown): boolean {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isUtcMillisecond(value: unknown): boolean {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

type TerminalSnapshotKey =
  | "terminal_metal"
  | "terminal_proceeds_currency"
  | "terminal_purchase_currency";

type TerminalSnapshots =
  | { readonly valid: false }
  | {
      readonly valid: true;
      readonly terminal_metal: ExactRateReference | null;
      readonly terminal_proceeds_currency: ExactRateReference | null;
      readonly terminal_purchase_currency: ExactRateReference | null;
    };

function readTerminalSnapshots(
  value: unknown,
  metalType: "GOLD" | "SILVER",
  purchaseCurrency: MetalsIsoCurrencyCode,
  proceedsCurrency: MetalsIsoCurrencyCode
): TerminalSnapshots {
  if (!Array.isArray(value)) {
    return { valid: false };
  }
  if (value.length === 0) {
    return {
      valid: true,
      terminal_metal: null,
      terminal_proceeds_currency: null,
      terminal_purchase_currency: null,
    };
  }
  if (value.length !== TERMINAL_SNAPSHOT_ROLES.length) {
    return { valid: false };
  }

  const expectations: Record<TerminalSnapshotKey, RateReferenceExpectation> = {
    terminal_metal: {
      instrumentCode: `metal:${metalType}`,
      role: "terminal_metal",
    },
    terminal_purchase_currency: {
      instrumentCode: `currency:${purchaseCurrency}`,
      role: "terminal_purchase_currency",
    },
    terminal_proceeds_currency: {
      instrumentCode: `currency:${proceedsCurrency}`,
      role: "terminal_proceeds_currency",
    },
  };
  let terminalMetal: ExactRateReference | null = null;
  let terminalPurchaseCurrency: ExactRateReference | null = null;
  let terminalProceedsCurrency: ExactRateReference | null = null;
  const referenceIds = new Set<string>();
  const seenRoles = new Set<TerminalSnapshotKey>();

  for (const entry of value) {
    const snapshot = asRecord(entry);
    if (snapshot === null || !hasExactFields(snapshot, RATE_SNAPSHOT_FIELDS)) {
      return { valid: false };
    }
    const { referenceId, role } = snapshot;
    if (
      typeof referenceId !== "string" ||
      typeof role !== "string" ||
      !isTerminalSnapshotKey(role) ||
      referenceIds.has(referenceId) ||
      seenRoles.has(role)
    ) {
      return { valid: false };
    }
    referenceIds.add(referenceId);
    seenRoles.add(role);

    const expectation = expectations[role];
    if (snapshot.instrumentCode !== expectation.instrumentCode) {
      return { valid: false };
    }
    const normalized = validateAndNormalizeRateReference(
      {
        capturedAt: parseIsoTimestamp(snapshot.capturedAt),
        capturedFreshness: snapshot.capturedFreshness,
        instrumentCode: snapshot.instrumentCode,
        kind: snapshot.kind,
        orientation: snapshot.orientation,
        providerObservedAt: parseNullableIsoTimestamp(
          snapshot.providerObservedAt
        ),
        quality: snapshot.quality,
        role: snapshot.role,
        source: snapshot.source === null ? null : snapshot.source,
        unit: snapshot.unit,
        valueDecimal: snapshot.valueDecimal,
      },
      expectation
    );
    if (!normalized.available) {
      return { valid: false };
    }

    if (role === "terminal_metal") {
      terminalMetal = normalized.value;
    } else if (role === "terminal_purchase_currency") {
      terminalPurchaseCurrency = normalized.value;
    } else {
      terminalProceedsCurrency = normalized.value;
    }
  }

  return {
    valid: true,
    terminal_metal: terminalMetal,
    terminal_proceeds_currency: terminalProceedsCurrency,
    terminal_purchase_currency: terminalPurchaseCurrency,
  };
}

function isTerminalSnapshotKey(value: string): value is TerminalSnapshotKey {
  return (
    value === "terminal_metal" ||
    value === "terminal_purchase_currency" ||
    value === "terminal_proceeds_currency"
  );
}

function parseIsoTimestamp(value: unknown): number {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function parseNullableIsoTimestamp(value: unknown): number | null {
  return value === null ? null : parseIsoTimestamp(value);
}

function findAcquisitionReference(
  input: MetalRealizedSaleEvidenceInput,
  candidate: { readonly expectation: RateReferenceExpectation }
): ExactRateReference | null {
  const actionId = input.holding.acquisitionActionId;
  if (actionId === null) {
    return null;
  }
  const matches = input.acquisitionReferences.filter(
    (reference) =>
      !reference.deleted &&
      reference.userId === input.userId &&
      reference.holdingId === input.holding.holdingId &&
      reference.actionId === actionId &&
      reference.role === candidate.expectation.role &&
      reference.instrumentCode === candidate.expectation.instrumentCode
  );
  if (matches.length !== 1) {
    return null;
  }
  const [reference] = matches;
  if (reference === undefined) {
    return null;
  }
  const normalized = validateAndNormalizeRateReference(
    {
      capturedAt: reference.capturedAt.getTime(),
      capturedFreshness: reference.capturedFreshness,
      instrumentCode: reference.instrumentCode,
      kind: reference.kind,
      orientation: reference.orientation,
      providerObservedAt:
        reference.providerObservedAt === null
          ? null
          : reference.providerObservedAt.getTime(),
      quality: reference.quality,
      role: reference.role,
      source: reference.source,
      unit: reference.unit,
      valueDecimal: reference.valueDecimal,
    },
    candidate.expectation
  );
  return normalized.available ? normalized.value : null;
}

function toPureGramsDecimal(holding: MetalSellHoldingSnapshot): string | null {
  if (
    holding.weightGramsDecimal === null ||
    holding.purityFactorDecimal === null
  ) {
    return null;
  }
  const grams = calculatePureGrams({
    purityFactorDecimal: holding.purityFactorDecimal,
    weightGramsDecimal: holding.weightGramsDecimal,
  });
  return grams.available ? grams.valueDecimal : null;
}
