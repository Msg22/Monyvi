import fs from "fs";
import path from "path";

import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import { schema } from "../../../../packages/db/src/schema";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { MetalRateReference } from "../../../../packages/db/src/models/MetalRateReference";
import {
  canonicalMetalJson,
  prepareCanonicalActionGroupInstall,
  type CanonicalMetalActionGroup,
} from "../../services/metal-canonical-action-group-service";
import {
  restoreCachedModelSnapshot,
  type CachedModelSnapshot,
} from "../../services/watermelon-cache-snapshot";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000030";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000031";
const ROOT_ID = "018f0c7a-1234-7abc-8def-000000000032";
const RATE_ID = "018f0c7a-1234-7abc-8def-000000000033";
const TIMESTAMP = "2026-08-31T10:15:30.123Z";
const HASH = "b".repeat(64);

const MODEL_CLASSES: Array<typeof Model> = [
  FinancialActionGroup,
  MetalActionEvidence,
  MetalLifecycleEvent,
  MetalRateReference,
];

interface CanonicalInstallPlan {
  readonly operations: readonly Model[];
  readonly snapshots: readonly CachedModelSnapshot[];
}

function isCanonicalInstallPlan(value: unknown): value is CanonicalInstallPlan {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  return Array.isArray(candidate.operations) && Array.isArray(candidate.snapshots);
}

async function createDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return new Database({ adapter, modelClasses: MODEL_CLASSES });
}

function createGroup(): CanonicalMetalActionGroup {
  const snapshot = {
    capturedAt: TIMESTAMP,
    capturedFreshness: "fresh",
    instrumentCode: "metal:GOLD",
    kind: "metal",
    orientation: "quote_per_base",
    providerObservedAt: TIMESTAMP,
    quality: "valid",
    referenceId: RATE_ID,
    role: "acquisition_metal",
    source: "fixture",
    unit: "usd_per_pure_gram",
    valueDecimal: "70",
  };
  const payload = {
    predecessorEventId: null,
    rateSnapshots: [snapshot],
    reversesEventId: null,
  };
  const payloadJson = canonicalMetalJson(payload);
  const envelope = {
    accountGuards: [],
    actionId: ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "correct",
    occurredAt: TIMESTAMP,
    payload,
    payloadVersion: "metals.correct/v1",
    userId: USER_ID,
  };
  return {
    root: {
      id: ROOT_ID,
      accountGuardsJson: "[]",
      actionId: ACTION_ID,
      createdAt: TIMESTAMP,
      deleted: false,
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      kind: "correct",
      outcomeJson: canonicalMetalJson({ actionId: ACTION_ID, status: "accepted" }),
      payloadHash: HASH,
      payloadJson: canonicalMetalJson(envelope),
      rejectionCode: null,
      serverOutcome: "accepted",
      state: "accepted",
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    evidence: {
      id: ACTION_ID,
      actionId: ACTION_ID,
      canonicalHoldingRevision: "1",
      createdAt: TIMESTAMP,
      deleted: false,
      domainPayloadJson: payloadJson,
      expectedHoldingRevision: "0",
      holdingId: HOLDING_ID,
      kind: "correct",
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    event: {
      id: ACTION_ID,
      actionId: ACTION_ID,
      createdAt: TIMESTAMP,
      deleted: false,
      holdingId: HOLDING_ID,
      isEffective: true,
      isHistoryVisible: true,
      kind: "correct",
      occurredAt: TIMESTAMP,
      payloadJson,
      predecessorEventId: null,
      reversesEventId: null,
      updatedAt: TIMESTAMP,
      userId: USER_ID,
    },
    rates: [
      {
        id: RATE_ID,
        actionId: ACTION_ID,
        capturedAt: TIMESTAMP,
        capturedFreshness: "fresh",
        createdAt: TIMESTAMP,
        deleted: false,
        holdingId: HOLDING_ID,
        instrumentCode: "metal:GOLD",
        kind: "metal",
        orientation: "quote_per_base",
        providerObservedAt: TIMESTAMP,
        quality: "valid",
        role: "acquisition_metal",
        source: "fixture",
        unit: "usd_per_pure_gram",
        updatedAt: TIMESTAMP,
        userId: USER_ID,
        valueDecimal: "70",
      },
    ],
  };
}

async function seedExistingWinner(database: Database): Promise<{
  readonly root: FinancialActionGroup;
  readonly evidence: MetalActionEvidence;
  readonly event: MetalLifecycleEvent;
}> {
  const group = createGroup();
  let seededRoot: FinancialActionGroup | null = null;
  let seededEvidence: MetalActionEvidence | null = null;
  let seededEvent: MetalLifecycleEvent | null = null;
  await database.write(async (): Promise<void> => {
    const root = database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row) => {
        row._raw.id = ROOT_ID;
        row.accountGuardsJson = group.root.accountGuardsJson;
        row.actionId = ACTION_ID;
        row.deleted = false;
        row.domain = "metals";
        row.domainReferenceId = HOLDING_ID;
        row.kind = "correct";
        row.outcomeJson = null;
        row.payloadHash = HASH;
        row.payloadJson = group.root.payloadJson;
        row.rejectionCode = null;
        row.serverOutcome = null;
        row.state = "sync_pending";
        row.updatedAt = new Date(TIMESTAMP);
        row.userId = USER_ID;
      });
    const evidence = database
      .get<MetalActionEvidence>("metal_action_evidence")
      .prepareCreate((row) => {
        row._raw.id = ACTION_ID;
        row.actionId = ACTION_ID;
        row.canonicalHoldingRevision = null;
        row.deleted = false;
        row.domainPayloadJson = group.evidence.domainPayloadJson;
        row.expectedHoldingRevision = "0";
        row.holdingId = HOLDING_ID;
        row.kind = "correct";
        row.updatedAt = new Date(TIMESTAMP);
        row.userId = USER_ID;
      });
    const event = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = ACTION_ID;
        row.actionId = ACTION_ID;
        row.deleted = false;
        row.holdingId = HOLDING_ID;
        row.isEffective = false;
        row.isHistoryVisible = true;
        row.kind = "correct";
        row.occurredAt = new Date(TIMESTAMP);
        row.payloadJson = group.event.payloadJson;
        row.predecessorEventId = null;
        row.reversesEventId = null;
        row.updatedAt = new Date(TIMESTAMP);
        row.userId = USER_ID;
      });
    const rate = database
      .get<MetalRateReference>("metal_rate_references")
      .prepareCreate((row) => {
        row._raw.id = RATE_ID;
        row.actionId = ACTION_ID;
        row.capturedAt = new Date(TIMESTAMP);
        row.capturedFreshness = "fresh";
        row.deleted = false;
        row.holdingId = HOLDING_ID;
        row.instrumentCode = "metal:GOLD";
        row.kind = "metal";
        row.orientation = "quote_per_base";
        row.providerObservedAt = new Date(TIMESTAMP);
        row.quality = "valid";
        row.role = "acquisition_metal";
        row.source = "fixture";
        row.unit = "usd_per_pure_gram";
        row.updatedAt = new Date(TIMESTAMP);
        row.userId = USER_ID;
        row.valueDecimal = "70";
      });
    await database.batch(root, evidence, event, rate);
    seededRoot = root;
    seededEvidence = evidence;
    seededEvent = event;
  });
  if (!seededRoot || !seededEvidence || !seededEvent) {
    throw new Error("missing_winner_fixture");
  }
  return {
    root: seededRoot,
    evidence: seededEvidence,
    event: seededEvent,
  };
}

describe("canonical winner cache atomicity", () => {
  it("validates every existing winner row before prepareUpdate mutates cached models", async () => {
    const database = await createDatabase();
    const winner = await seedExistingWinner(database);
    const group = createGroup();
    const invalidGroup: CanonicalMetalActionGroup = {
      ...group,
      rates: group.rates.map((rate) => ({ ...rate, valueDecimal: "71" })),
    };

    await expect(
      prepareCanonicalActionGroupInstall(database, invalidGroup, USER_ID)
    ).rejects.toThrow("incomplete_metal_action_group");
    expect(winner.root.state).toBe("sync_pending");
    expect(winner.root.serverOutcome).toBeNull();
    expect(winner.evidence.canonicalHoldingRevision).toBeNull();
    expect(winner.event.isEffective).toBe(false);
  });

  it("captures winner preimages before preparing updates so a failed batch can restore the cache", async () => {
    const database = await createDatabase();
    const winner = await seedExistingWinner(database);
    const prepared = await prepareCanonicalActionGroupInstall(
      database,
      createGroup(),
      USER_ID
    );

    expect(isCanonicalInstallPlan(prepared)).toBe(true);
    if (!isCanonicalInstallPlan(prepared)) return;
    expect(winner.root.state).toBe("accepted");
    prepared.snapshots.forEach(restoreCachedModelSnapshot);
    expect(winner.root.state).toBe("sync_pending");
    expect(winner.root.serverOutcome).toBeNull();
    expect(winner.evidence.canonicalHoldingRevision).toBeNull();
    expect(winner.event.isEffective).toBe(false);
  });

  it("wires canonical winner preimages into reconciliation batch-failure rollback", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../../services/metal-reconciliation-service.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf8");
    expect(source).toContain("...canonicalInstallPlan.snapshots");
  });
});
