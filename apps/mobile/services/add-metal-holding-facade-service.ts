import * as Crypto from "expo-crypto";
import { Q } from "@nozbe/watermelondb";
import { database, type MarketRateObservation } from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
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
import { createMetalFinancialActionEnvelope } from "./metal-financial-action-adapter";
import { buildLiveRatesTrustReadModel } from "./live-rates-trust-read-model-service";
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
}

const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

export async function addMetalHoldingFromForm(
  submission: AddMetalHoldingFormSubmission
): Promise<void> {
  const existingAction = await getFinancialActionGroup(submission.ids.actionId);
  if (existingAction) {
    if (
      existingAction.kind !== "add" ||
      existingAction.domainReferenceId !== submission.ids.holdingId
    ) {
      throw new Error("action_id_payload_mismatch");
    }
    return;
  }
  const scope = await getCurrentUserDataScope();
  const occurredAt = new Date().toISOString();
  const rateSnapshots = await loadAcquisitionRateSnapshots(
    submission,
    occurredAt
  );
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
    validationInput: { cairoTodayDate: command.cairoTodayDate },
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

async function loadAcquisitionRateSnapshots(
  submission: AddMetalHoldingFormSubmission,
  capturedAt: string
): Promise<AddMetalHoldingCommandInput["rateSnapshots"]> {
  const metalInstrumentCode = `metal:${submission.holding.metal}`;
  if (!isSupportedMetalsIsoCurrencyCode(submission.holding.purchaseCurrency)) {
    throw new Error("metal_add_invalid_purchase_currency");
  }
  const purchaseCurrency = submission.holding.purchaseCurrency;
  const currencyInstrumentCode = `currency:${purchaseCurrency}`;
  const [metal, currency] = await Promise.all([
    loadLatestObservation(metalInstrumentCode),
    loadLatestObservation(currencyInstrumentCode),
  ]);
  if (!metal || !currency) return [];

  const trust = buildLiveRatesTrustReadModel([metal, currency], Date.now());
  const metalTrust =
    submission.holding.metal === "GOLD" ? trust.gold : trust.silver;
  const currencyTrust = trust.currencies.get(purchaseCurrency);
  if (
    !isSnapshotTrustState(metalTrust.state) ||
    !currencyTrust ||
    !isSnapshotTrustState(currencyTrust.state)
  ) {
    return [];
  }

  return [
    toRateSnapshot(
      metal,
      submission.ids.metalRateReferenceId,
      "acquisition_metal",
      "metal",
      metalTrust.state,
      capturedAt
    ),
    toRateSnapshot(
      currency,
      submission.ids.currencyRateReferenceId,
      "acquisition_purchase_currency",
      "currency",
      currencyTrust.state,
      capturedAt
    ),
  ];
}

async function loadLatestObservation(
  instrumentCode: string
): Promise<MarketRateObservation | null> {
  const rows = await database
    .get<MarketRateObservation>("market_rate_observations")
    .query(
      Q.where("instrument_code", instrumentCode),
      Q.sortBy("created_at", Q.desc),
      Q.take(1)
    )
    .fetch();
  return rows.at(0) ?? null;
}

function isSnapshotTrustState(
  value: string
): value is "fresh" | "stale" | "unknown" {
  return value === "fresh" || value === "stale" || value === "unknown";
}

function toRateSnapshot(
  observation: MarketRateObservation,
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
    instrumentCode: observation.instrumentCode,
    valueDecimal: observation.valueDecimal,
    unit: asRateUnit(observation.unit),
    orientation: asRateOrientation(observation.orientation),
    providerObservedAt: observation.providerObservedAt?.toISOString() ?? null,
    source: observation.source,
    quality: "valid",
    capturedFreshness,
    capturedAt,
  };
}

function asRateUnit(
  value: string
): "usd_per_pure_gram" | "usd_per_currency_unit" | "currency_units_per_usd" {
  if (
    value !== "usd_per_pure_gram" &&
    value !== "usd_per_currency_unit" &&
    value !== "currency_units_per_usd"
  ) {
    throw new Error("metal_add_invalid_rate_unit");
  }
  return value;
}

function asRateOrientation(value: string): "quote_per_base" | "base_per_quote" {
  if (value !== "quote_per_base" && value !== "base_per_quote") {
    throw new Error("metal_add_invalid_rate_orientation");
  }
  return value;
}
