import * as Crypto from "expo-crypto";
import { Q } from "@nozbe/watermelondb";
import {
  database,
  type Asset,
  type AssetMetal,
  type MetalHoldingState,
} from "@monyvi/db";
import type {
  FinancialActionEnvelopeV1,
  RegisteredActionPayload,
  Sha256Provider,
} from "@monyvi/logic";

import type {
  EditableMetalHoldingFacts,
  MetalHoldingStatus,
} from "./edit-metal-holding-preview-service";
import {
  createEditMetalHoldingCommandService,
  type EditMetalHoldingCommandInput,
} from "./edit-metal-holding-command-service";
import {
  commitFinancialActionGroupLocally,
  getFinancialActionGroup,
} from "./financial-action-foundation-repository";
import { createMetalFinancialActionEnvelope } from "./metal-financial-action-adapter";
import { getCurrentUserDataScope } from "./user-data-access";

export interface EditMetalHoldingReadModel {
  readonly holdingId: string;
  readonly financialRevision: string;
  readonly predecessorEventId: string;
  readonly status: MetalHoldingStatus;
  readonly hasCompleteMaterialFacts: boolean;
  readonly facts: EditableMetalHoldingFacts;
}
export interface EditMetalHoldingRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}
export interface EditMetalHoldingSubmission {
  readonly ids: EditMetalHoldingRequestIds;
  readonly original: EditMetalHoldingReadModel;
  readonly current: EditableMetalHoldingFacts;
  readonly correctionReason: string | null;
  readonly cairoTodayDate: string;
}

const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

export async function loadEditableMetalHolding(
  holdingId: string
): Promise<EditMetalHoldingReadModel> {
  const scope = await getCurrentUserDataScope();
  const asset = await scope.findOwned(database.get<Asset>("assets"), holdingId);
  const [metals, states] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<AssetMetal>("asset_metals"),
        asset,
        "asset_id",
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
  ]);
  const metal = metals[0];
  const state = states[0];
  if (!metal || !state || !state.effectiveEventId)
    throw new Error("metal_holding_not_found");
  const metalType = metal.metalType === "SILVER" ? "SILVER" : "GOLD";
  const purityCode = metal.purityCode;
  const purityFactorDecimal = metal.purityFactorDecimal;
  const purchasePriceDecimal = asset.purchasePriceDecimal;
  const purchaseCurrency = asset.purchaseCurrency;
  const weightGramsDecimal = metal.weightGramsDecimal;
  const hasCompleteMaterialFacts = Boolean(
    purityCode &&
    purityFactorDecimal &&
    purchasePriceDecimal &&
    purchaseCurrency &&
    weightGramsDecimal
  );
  return {
    holdingId,
    financialRevision: state.financialRevision,
    predecessorEventId: state.effectiveEventId,
    status:
      state.status === "sold"
        ? "sold"
        : state.status === "disposed"
          ? "disposed"
          : "active",
    hasCompleteMaterialFacts,
    facts: {
      name: asset.name,
      notes: asset.notes ?? null,
      metal: metalType,
      weightGramsDecimal: weightGramsDecimal ?? "",
      purityCode: purityCode ?? "",
      purityCatalogVersion: "1",
      purityFactorDecimal: purityFactorDecimal ?? "",
      purchasePriceDecimal: purchasePriceDecimal ?? "",
      purchaseCurrency: purchaseCurrency ?? asset.currency,
      purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
      physicalForm:
        metal.itemForm === "COIN" ||
        metal.itemForm === "BAR" ||
        metal.itemForm === "JEWELRY"
          ? metal.itemForm
          : null,
    },
  };
}

export async function saveEditedMetalHolding(
  submission: EditMetalHoldingSubmission
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const existing = await getFinancialActionGroup(submission.ids.actionId);
  if (existing) {
    if (
      existing.kind !== "correct" ||
      existing.domainReferenceId !== submission.original.holdingId
    )
      throw new Error("action_id_payload_mismatch");
    return;
  }
  const occurredAt = new Date().toISOString();
  const hasMaterialChanges =
    materialJson(submission.original.facts) !==
    materialJson(submission.current);
  const input: EditMetalHoldingCommandInput = {
    actionId: submission.ids.actionId,
    actionEvidenceId: submission.ids.actionEvidenceId,
    lifecycleEventId: submission.ids.lifecycleEventId,
    predecessorEventId: submission.original.predecessorEventId,
    holdingId: submission.original.holdingId,
    userId: scope.userId,
    occurredAt,
    cairoTodayDate: submission.cairoTodayDate,
    expectedFinancialRevision: submission.original.financialRevision,
    correctionReason: submission.correctionReason,
    originalMetadata: {
      name: submission.original.facts.name,
      notes: submission.original.facts.notes,
    },
    metadata: {
      name: submission.current.name,
      notes: submission.current.notes,
    },
    originalMaterialFacts: toMaterial(submission.original.facts),
    materialFacts: hasMaterialChanges ? toMaterial(submission.current) : null,
    rateSnapshots: [],
  };
  const service = createEditMetalHoldingCommandService({
    database,
    commitFinancialActionGroupLocally,
    createEnvelope,
    hashProvider: sha256Provider,
  });
  await service.save(input);
}

function createEnvelope(
  input: EditMetalHoldingCommandInput,
  payload: RegisteredActionPayload
): FinancialActionEnvelopeV1 {
  return createMetalFinancialActionEnvelope({
    actionId: input.actionId,
    userId: input.userId,
    holdingId: input.holdingId,
    kind: "correct",
    expectedHoldingRevision: input.expectedFinancialRevision,
    occurredAt: input.occurredAt,
    validationInput: { cairoTodayDate: input.cairoTodayDate },
    domainPayload: payload,
  });
}
function toMaterial(
  facts: EditableMetalHoldingFacts
): EditMetalHoldingCommandInput["originalMaterialFacts"] {
  return {
    weightGramsDecimal: facts.weightGramsDecimal,
    purityCode: facts.purityCode,
    purityCatalogVersion: facts.purityCatalogVersion,
    purityFactorDecimal: facts.purityFactorDecimal,
    purchasePriceDecimal: facts.purchasePriceDecimal,
    purchaseCurrency: facts.purchaseCurrency,
    purchaseDate: facts.purchaseDate,
    physicalForm: facts.physicalForm,
  };
}
function materialJson(facts: EditableMetalHoldingFacts): string {
  return JSON.stringify(toMaterial(facts));
}
