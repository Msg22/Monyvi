import * as Crypto from "expo-crypto";
import { database, type CurrencyType } from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  type CurrentMarketInstrument,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type { NormalizedMetalHoldingFormData } from "@/validation/metal-holding-form-validation";

import {
  createAddMetalHoldingCommandService,
  type AddMetalHoldingCommandInput,
} from "./add-metal-holding-command-service";
import {
  commitFinancialActionGroupLocally,
  getFinancialActionGroup,
} from "./financial-action-foundation-repository";
import { readStoredMetalActionReplay } from "./metal-action-replay-service";
import { createMetalFinancialActionEnvelope } from "./metal-financial-action-adapter";
import {
  readSelectedMarketRateSnapshot,
  type SelectedCurrentMarketRate,
} from "./market-rate-snapshot-read-model-service";
import { getCurrentUserDataScope } from "./user-data-access";

export interface AddMetalHoldingRequestIds {
  readonly actionId: string;
  readonly holdingId: string;
  readonly holdingStateId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly metalRateReferenceId: string;
  readonly currencyRateReferenceId: string;
}

export interface AddMetalHoldingFormSubmission {
  readonly ids: AddMetalHoldingRequestIds;
  readonly holding: NormalizedMetalHoldingFormData;
  readonly cairoTodayDate: string;
  readonly staleRateAcknowledged: boolean;
}

const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

export async function addMetalHoldingFromForm(
  submission: AddMetalHoldingFormSubmission
): Promise<void> {
  const existingAction = await getFinancialActionGroup(submission.ids.actionId);
  const replay = existingAction
    ? readStoredMetalActionReplay(
        existingAction,
        "add",
        submission.ids.holdingId,
        submission.cairoTodayDate
      )
    : null;
  const scope = await getCurrentUserDataScope();
  const occurredAt = replay?.occurredAt ?? new Date().toISOString();
  const rateSnapshots = replay
    ? (replay.rateSnapshots as unknown as AddMetalHoldingCommandInput["rateSnapshots"])
    : await loadAcquisitionRateSnapshots({
        holding: submission.holding,
        ids: submission.ids,
      });
  if (
    !submission.staleRateAcknowledged &&
    rateSnapshots.some((snapshot) => snapshot.capturedFreshness === "stale")
  ) {
    throw new Error("stale_rate_acknowledgment_required");
  }
  const commandInput: AddMetalHoldingCommandInput = {
    actionId: submission.ids.actionId,
    holdingId: submission.ids.holdingId,
    holdingStateId: submission.ids.holdingStateId,
    actionEvidenceId: submission.ids.actionEvidenceId,
    lifecycleEventId: submission.ids.lifecycleEventId,
    userId: scope.userId,
    occurredAt,
    cairoTodayDate: submission.cairoTodayDate,
    holding: submission.holding,
    rateSnapshots,
  };
  const service = createAddMetalHoldingCommandService({
    database,
    commitFinancialActionGroupLocally,
    createEnvelope: createAddEnvelope,
    hashProvider: sha256Provider,
  });
  await service.add(commandInput);
}

function createAddEnvelope(
  command: AddMetalHoldingCommandInput
): FinancialActionEnvelopeV1 {
  return createMetalFinancialActionEnvelope({
    actionId: command.actionId,
    userId: command.userId,
    holdingId: command.holdingId,
    kind: "add",
    expectedHoldingRevision: null,
    occurredAt: command.occurredAt,
    validationInput: {
      latestAllowedCalendarDate: command.cairoTodayDate,
    },
    domainPayload: {
      holdingId: command.holdingId,
      expectedHoldingRevision: null,
      predecessorEventId: null,
      reversesEventId: null,
      metalType: command.holding.metal,
      metadata: {
        name: command.holding.name,
        notes: command.holding.notes,
      },
      materialFacts: {
        physicalForm: command.holding.physicalForm,
        weightGramsDecimal: command.holding.weightGramsDecimal,
        purityCode: command.holding.purity.code,
        purityFactorDecimal: command.holding.purity.factorDecimal,
        purityCatalogVersion: command.holding.purity.catalogVersion,
        purchasePriceDecimal: command.holding.purchasePriceDecimal,
        purchaseCurrency: command.holding.purchaseCurrency,
        purchaseDate: command.holding.purchaseDate,
      },
      rateSnapshots: command.rateSnapshots,
    },
  });
}

export async function loadAcquisitionRateSnapshots(submission: {
  readonly holding: Pick<
    NormalizedMetalHoldingFormData,
    "metal" | "purchaseCurrency"
  >;
  readonly ids: Pick<
    AddMetalHoldingRequestIds,
    "metalRateReferenceId" | "currencyRateReferenceId"
  >;
}): Promise<AddMetalHoldingCommandInput["rateSnapshots"]> {
  const metalInstrumentCode: CurrentMarketInstrument =
    submission.holding.metal === "GOLD" ? "metal:GOLD" : "metal:SILVER";
  if (!isSupportedMetalsIsoCurrencyCode(submission.holding.purchaseCurrency)) {
    throw new Error("metal_add_invalid_purchase_currency");
  }
  const purchaseCurrency = submission.holding.purchaseCurrency;
  const currencyInstrumentCode: CurrentMarketInstrument =
    `currency:${purchaseCurrency}` as CurrentMarketInstrument;

  const snapshot = await readSelectedMarketRateSnapshot(database);
  if (!snapshot) return [];

  const metalRate = snapshot.ratesByInstrument.get(metalInstrumentCode);
  const currencyRate = snapshot.ratesByInstrument.get(currencyInstrumentCode);
  if (!metalRate || !currencyRate) return [];

  const trust = snapshot.trust;
  const metalTrust =
    submission.holding.metal === "GOLD" ? trust.gold : trust.silver;
  const currencyTrust = trust.currencies.get(purchaseCurrency as CurrencyType);
  if (
    !isSnapshotTrustState(metalTrust.state) ||
    !currencyTrust ||
    !isSnapshotTrustState(currencyTrust.state)
  ) {
    return [];
  }

  const capturedAtIso = snapshot.capturedAt.toISOString();

  return [
    toRateSnapshot(
      metalRate,
      submission.ids.metalRateReferenceId,
      "acquisition_metal",
      "metal",
      metalTrust.state,
      capturedAtIso
    ),
    toRateSnapshot(
      currencyRate,
      submission.ids.currencyRateReferenceId,
      "acquisition_purchase_currency",
      "currency",
      currencyTrust.state,
      capturedAtIso
    ),
  ];
}

function isSnapshotTrustState(
  value: string
): value is "fresh" | "stale" | "unknown" {
  return value === "fresh" || value === "stale" || value === "unknown";
}

function toRateSnapshot(
  rate: SelectedCurrentMarketRate,
  referenceId: string,
  role: "acquisition_metal" | "acquisition_purchase_currency",
  kind: "metal" | "currency",
  capturedFreshness: "fresh" | "stale" | "unknown",
  capturedAt: string
): AddMetalHoldingCommandInput["rateSnapshots"][number] {
  return {
    referenceId,
    role,
    kind,
    instrumentCode: rate.instrumentCode,
    valueDecimal: rate.valueDecimal,
    unit: rate.unit,
    orientation: rate.orientation,
    providerObservedAt: rate.providerObservedAt?.toISOString() ?? null,
    source: rate.source,
    quality: "valid",
    capturedFreshness,
    capturedAt,
  };
}
