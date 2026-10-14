import { Database } from "@nozbe/watermelondb";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalMetadataEdit } from "../../../../packages/db/src/models/MetalMetadataEdit";
import { createMetalMetadataFixtureDatabase } from "./metal-metadata-test-database";
import { prepareMixedMetalMetadataEvidence } from "../../services/metal-metadata-evidence-repository";
import { commitCanonicalMetalMetadataEditOutcomeLocally } from "../../services/metal-metadata-evidence-reconciliation";
import { readAppliedMetalMetadataHistory } from "../../services/metal-metadata-history-read-model-service";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000003";
const ACTION = "018f0c7a-1234-7abc-8def-000000000010";
const ACQUISITION_ACTION = "018f0c7a-1234-7abc-8def-000000000009";
let mockCurrentUser = USER;

jest.mock("@monyvi/db", () =>
  jest.requireActual<typeof import("../../../../packages/db/src/schema")>(
    "../../../../packages/db/src/schema"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUser),
  supabase: {},
}));
interface SqliteDispatcherModule {
  readonly getDispatcherType: (options: {
    readonly jsi?: boolean;
  }) => "asynchronous" | "jsi";
  readonly makeDispatcher: (
    type: "asynchronous" | "jsi",
    tag: number
  ) => {
    readonly call: (
      methodName: string,
      args: readonly unknown[],
      callback: (result: unknown) => void
    ) => void;
  };
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<SqliteDispatcherModule>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

describe("independent canonical metadata after stale financial reconciliation", () => {
  beforeEach(() => {
    mockCurrentUser = USER;
  });

  it.each(["reconciled", "reconciliation_incomplete"] as const)(
    "installs proven metadata independently of %s material reconciliation and retains History after restart",
    async (materialState) => {
      const { database, adapter } = await createMetalMetadataFixtureDatabase({
        userId: USER,
        holdingId: HOLDING,
        acquisitionActionId: ACQUISITION_ACTION,
      });
      const occurredAt = "2026-10-10T12:00:00.000Z";
      const requestJson = JSON.stringify({
        actionId: ACTION,
        domainReferenceId: HOLDING,
        kind: "correct",
        occurredAt,
        payload: {
          holdingId: HOLDING,
          predecessorEventId: ACQUISITION_ACTION,
          metadataChange: {
            before: { name: "Baseline", notes: "Baseline note" },
            after: { name: "Baseline", notes: null },
          },
        },
        userId: USER,
      });
      // Keep the accepted acquisition root intact. The stale correction is a
      // distinct financial action; only its metadata evidence is adjudicated.
      const root = database
        .get<FinancialActionGroup>("financial_action_groups")
        .prepareCreate((row): void => {
          row._raw.id = ACTION;
          row.actionId = ACTION;
          row.domain = "metals";
          row.domainReferenceId = HOLDING;
          row.kind = "correct";
          row.userId = USER;
          row.state = materialState;
          row.serverOutcome = "stale";
          row.rejectionCode = "HOLDING_REVISION_STALE";
          row.payloadJson = requestJson;
          row.payloadHash = "a".repeat(64);
          row.outcomeJson = JSON.stringify({
            actionId: ACTION,
            status: "stale",
            code: "HOLDING_REVISION_STALE",
          });
          row.deleted = false;
          row.updatedAt = new Date(occurredAt);
        });
      await database.write(async (): Promise<void> => {
        await database.batch(
          root,
          prepareMixedMetalMetadataEvidence(database, {
            actionId: ACTION,
            userId: USER,
            holdingId: HOLDING,
            requestJson,
            payloadHash: "a".repeat(64),
            occurredAt,
            locallyApplied: {
              notes: {
                before: "Baseline note",
                after: null,
                clock: { writtenAt: 1791633600000, writerId: ACTION },
              },
            },
          })
        );
      });
      const outcome = {
        editId: ACTION,
        holdingId: HOLDING,
        status: "applied",
        appliedChanges: {
          notes: {
            before: "Baseline note",
            after: null,
            clock: { writtenAt: 1791633600000, writerId: ACTION },
          },
        },
        canonicalMetadata: {
          name: null,
          notes: { value: null, writtenAt: 1791633600000, writerId: ACTION },
        },
      };
      await commitCanonicalMetalMetadataEditOutcomeLocally(
        database,
        outcome,
        ACTION,
        HOLDING,
        USER
      );
      await commitCanonicalMetalMetadataEditOutcomeLocally(
        database,
        outcome,
        ACTION,
        HOLDING,
        USER
      );
      expect(
        (await database.get<Asset>("assets").find(HOLDING)).notes
      ).toBeNull();
      expect(
        (
          await database
            .get<MetalHoldingState>("metal_holding_states")
            .find(HOLDING)
        ).financialRevision
      ).toBe("4");
      expect(root.state).toBe(materialState);
      expect(root.serverOutcome).toBe("stale");
      expect(
        (
          await database
            .get<FinancialActionGroup>("financial_action_groups")
            .find(ACQUISITION_ACTION)
        ).state
      ).toBe("accepted");
      expect(
        await readAppliedMetalMetadataHistory(database, HOLDING, USER)
      ).toMatchObject([
        {
          id: ACTION,
          linkedActionId: null,
          changes: [{ field: "notes", before: "Baseline note", after: null }],
        },
      ]);
      const reopened = new Database({
        adapter: await adapter.testClone(),
        modelClasses: [
          Asset,
          FinancialActionGroup,
          MetalHoldingState,
          MetalMetadataEdit,
        ],
      });
      expect(
        await readAppliedMetalMetadataHistory(reopened, HOLDING, USER)
      ).toMatchObject([
        {
          id: ACTION,
          linkedActionId: null,
          changes: [{ field: "notes", before: "Baseline note", after: null }],
        },
      ]);
      mockCurrentUser = "018f0c7a-1234-7abc-8def-000000000002";
      await expect(
        readAppliedMetalMetadataHistory(database, HOLDING, USER)
      ).rejects.toThrow();
    }
  );
});
