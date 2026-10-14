import {
  filterReportableMetalMetadataHistoryRecords,
  combineMetalDetailMetadataTimeline,
  detachCanonicalMetadataFromRejectedMaterialEvents,
} from "../../services/metal-metadata-history-read-model-service";
import type {
  MetalMetadataHistoryEvent,
  MetalMetadataHistoryRecord,
} from "../../services/metal-metadata-evidence";
import type { MetalDetailTimelineItem } from "../../services/metal-detail-read-model-service";

// These projection tests must not initialize the app's native SQLite adapter.
// The separate metadata canonical/restart suites exercise real SQLite writes.
jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn() },
}));

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000003";
const ACTION = "018f0c7a-1234-7abc-8def-000000000010";
const record: MetalMetadataHistoryRecord = {
  id: ACTION,
  userId: USER,
  holdingId: HOLDING,
  linkedActionId: ACTION,
  occurredAt: "2026-10-10T13:00:00.000Z",
  status: "pending",
  localAppliedChangesJson: "{}",
  canonicalAppliedChangesJson: null,
};

describe("#363 material-linked metadata history visibility", () => {
  it("shows only locally complete optimistic mixed edits while offline", () => {
    expect(
      filterReportableMetalMetadataHistoryRecords(
        [record],
        [{ actionId: ACTION, state: "sync_pending" }]
      )
    ).toEqual([record]);
  });

  it("hides a stale/rejected mixed action instead of advertising its metadata as applied", () => {
    for (const state of [
      "rejected_compensating",
      "reconciliation_incomplete",
      "reconciled",
    ]) {
      expect(
        filterReportableMetalMetadataHistoryRecords(
          [record],
          [{ actionId: ACTION, state }]
        )
      ).toEqual([]);
    }
  });

  it("shows canonical independently applied metadata even when the material action was rejected", () => {
    expect(
      filterReportableMetalMetadataHistoryRecords(
        [{ ...record, status: "applied" }],
        [{ actionId: ACTION, state: "reconciled" }]
      )
    ).toHaveLength(1);
    expect(
      filterReportableMetalMetadataHistoryRecords(
        [{ ...record, status: "applied" }],
        []
      )
    ).toHaveLength(1);
    expect(
      detachCanonicalMetadataFromRejectedMaterialEvents(
        [{ ...record, status: "applied" }],
        [{ actionId: ACTION, state: "reconciled" }]
      )[0]?.linkedActionId
    ).toBeNull();
  });

  it("preserves standalone local edits without inventing financial History actions", () => {
    expect(
      filterReportableMetalMetadataHistoryRecords(
        [{ ...record, linkedActionId: null }],
        []
      )
    ).toHaveLength(1);
  });

  it("combines standalone exact deltas and material-linked deltas into sorted, deduplicated History", () => {
    const material: MetalDetailTimelineItem = {
      id: ACTION,
      kind: "correct",
      occurredAt: new Date("2026-10-10T13:00:00.000Z"),
      correctionChanges: [{ field: "weight", before: "1", after: "2" }],
    };
    const standalone: MetalMetadataHistoryEvent = {
      id: "standalone",
      linkedActionId: null,
      occurredAt: new Date("2026-10-10T14:00:00.000Z"),
      changes: [{ field: "notes", before: "Saved note", after: null }],
    };
    const metadata = [
      standalone,
      {
        id: ACTION,
        linkedActionId: ACTION,
        occurredAt: material.occurredAt,
        changes: [
          { field: "name" as const, before: "Old name", after: "New name" },
        ],
      },
    ];
    const result = combineMetalDetailMetadataTimeline(
      [material],
      [...metadata, standalone],
      [{ id: ACTION, actionId: ACTION }]
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "metadata",
      correctionChanges: [
        { field: "notes", before: "Saved note", after: null },
      ],
    });
    expect(result[1]?.correctionChanges).toEqual([
      { field: "weight", before: "1", after: "2" },
      { field: "name", before: "Old name", after: "New name" },
    ]);
  });

  it("renders proven canonical metadata separately when its rejected material event is missing", () => {
    expect(
      combineMetalDetailMetadataTimeline(
        [],
        [
          {
            id: ACTION,
            linkedActionId: null,
            occurredAt: new Date("2026-10-10T13:00:00.000Z"),
            changes: [{ field: "name", before: "Old", after: "New" }],
          },
        ],
        []
      )
    ).toMatchObject([
      {
        kind: "metadata",
        correctionChanges: [{ field: "name", before: "Old", after: "New" }],
      },
    ]);
  });

  it("preserves existing material chronology for equal timestamps", () => {
    const occurredAt = new Date("2026-10-10T13:00:00.000Z");
    const timeline: MetalDetailTimelineItem[] = [
      { id: "undo", kind: "undo", occurredAt },
      { id: "sold", kind: "sell", occurredAt },
    ];
    expect(
      combineMetalDetailMetadataTimeline(timeline, [], []).map(
        (item) => item.id
      )
    ).toEqual(["undo", "sold"]);
  });
});
