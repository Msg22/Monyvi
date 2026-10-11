import { createHash } from "node:crypto";
import type { Database } from "@nozbe/watermelondb";
import type {
  Asset,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  serializeCanonicalJsonValue,
  serializeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
} from "@monyvi/logic";

interface FixtureIds {
  readonly user: string;
  readonly holding: string;
  readonly state: string;
  readonly createdAction: string;
  readonly createdEvent: string;
}

export function acquisitionEnvelope(
  ids: FixtureIds
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: ids.createdAction,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: ids.holding,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "add",
      occurredAt: "2024-03-14T00:00:00.000Z",
      payloadVersion: "metals.add/v1",
      userId: ids.user,
      payload: {
        holdingId: ids.holding,
        expectedHoldingRevision: null,
        predecessorEventId: null,
        reversesEventId: null,
        metalType: "GOLD",
        metadata: { name: "Wedding coin", notes: "Gift" },
        materialFacts: {
          physicalForm: "COIN",
          weightGramsDecimal: "31.125",
          purityCode: "gold-999",
          purityFactorDecimal: "0.999",
          purityCatalogVersion: "1",
          purchasePriceDecimal: "151278.2",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
        },
        rateSnapshots: [],
      },
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { latestAllowedCalendarDate: "2026-09-01" }
  );
}

export function envelopeJson(envelope: FinancialActionEnvelopeV1): string {
  return serializeFinancialActionEnvelope(
    envelope,
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { latestAllowedCalendarDate: "2026-09-01" }
  );
}

export function envelopeHash(envelope: FinancialActionEnvelopeV1): string {
  return createHash("sha256")
    .update(envelopeJson(envelope), "utf8")
    .digest("hex");
}

async function persistLifecycle(
  database: Database,
  envelope: FinancialActionEnvelopeV1,
  revision: string,
  predecessor: string | null,
  reverses: string | null
): Promise<void> {
  const at = new Date(envelope.occurredAt);
  const payloadJson = serializeCanonicalJsonValue(envelope.payload);
  await database
    .get<FinancialActionGroup>("financial_action_groups")
    .create((record): void => {
      record._raw.id = envelope.actionId;
      record.actionId = envelope.actionId;
      record.accountGuardsJson = "[]";
      record.deleted = false;
      record.domain = "metals";
      record.domainReferenceId = envelope.domainReferenceId;
      record.kind = envelope.kind;
      record.payloadJson = envelopeJson(envelope);
      record.payloadHash = envelopeHash(envelope);
      record.state = "local_complete";
      record.outcomeJson = null;
      record.serverOutcome = null;
      record.rejectionCode = null;
      record.updatedAt = at;
      record.userId = envelope.userId;
    });
  await database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .create((record): void => {
      record._raw.id = envelope.actionId;
      record.actionId = envelope.actionId;
      record.deleted = false;
      record.holdingId = envelope.domainReferenceId;
      record.kind = envelope.kind;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.occurredAt = at;
      record.payloadJson = payloadJson;
      record.predecessorEventId = predecessor;
      record.reversesEventId = reverses;
      record.updatedAt = at;
      record.userId = envelope.userId;
    });
  await database
    .get<MetalActionEvidence>("metal_action_evidence")
    .create((record): void => {
      record._raw.id = envelope.actionId;
      record.actionId = envelope.actionId;
      record.deleted = false;
      record.holdingId = envelope.domainReferenceId;
      record.kind = envelope.kind;
      record.expectedHoldingRevision = String(BigInt(revision) - 1n);
      record.canonicalHoldingRevision = revision;
      record.domainPayloadJson = payloadJson;
      record.updatedAt = at;
      record.userId = envelope.userId;
    });
}

export async function seedRestoredLegacyChain(
  database: Database,
  ids: FixtureIds,
  pairs: number
): Promise<{
  readonly predecessorEventId: string;
  readonly expectedFinancialRevision: string;
}> {
  let predecessor: string | null = null;
  let revision = 0;
  await database.write(async (): Promise<void> => {
    await (
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .find(ids.createdAction)
    ).destroyPermanently();
    await (
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .find(ids.createdEvent)
    ).destroyPermanently();
    await (
      await database.get<Asset>("assets").find(ids.holding)
    ).update((record): void => {
      record.acquisitionActionId = null;
    });
    for (let pair = 0; pair < pairs; pair += 1) {
      for (const kind of ["dispose", "undo"] as const) {
        const actionId = `018f0c7a-1234-7abc-8def-${String(200 + revision).padStart(12, "0")}`;
        const occurredAt = `2026-08-${String(20 + revision).padStart(2, "0")}T10:00:00.000Z`;
        const reverses = kind === "undo" ? predecessor : null;
        const envelope = canonicalizeFinancialActionEnvelope(
          {
            accountGuards: [],
            actionId,
            domain: "metals",
            domainReferenceId: ids.holding,
            envelopeVersion: "monyvi.financial-action/v1",
            kind,
            occurredAt,
            payloadVersion: `metals.${kind}/v1`,
            userId: ids.user,
            payload: {
              expectedHoldingRevision: String(revision),
              holdingId: ids.holding,
              predecessorEventId: predecessor,
              reversesEventId: reverses,
              ...(kind === "dispose"
                ? {
                    disposalDate: occurredAt.slice(0, 10),
                    notes: null,
                    reason: "given_away",
                  }
                : {}),
            },
          },
          DEFAULT_FINANCIAL_ACTION_REGISTRY,
          { latestAllowedCalendarDate: "2026-09-01" }
        );
        revision += 1;
        await persistLifecycle(
          database,
          envelope,
          String(revision),
          predecessor,
          reverses
        );
        predecessor = actionId;
      }
    }
    await (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .find(ids.state)
    ).update((record): void => {
      record.effectiveActionId = predecessor;
      record.effectiveEventId = predecessor;
      record.financialRevision = String(revision);
      record.status = "active";
    });
  });
  if (predecessor === null) throw new Error("fixture_requires_restored_chain");
  return {
    predecessorEventId: predecessor,
    expectedFinancialRevision: String(revision),
  };
}
