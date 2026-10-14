import {
  applyMetalMetadataEvidencePatch,
  projectAppliedMetalMetadataHistory,
  type MetalMetadataHistoryRecord,
} from "../../services/metal-metadata-evidence";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const OTHER = "018f0c7a-1234-7abc-8def-000000000002";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000003";
const WRITER = "018f0c7a-1234-7abc-8def-000000000004";

describe("issue #363: exact applied Metals metadata evidence", () => {
  const before = {
    name: "Gold Bar",
    notes: null,
    nameClock: { writtenAt: 200, writerId: WRITER },
    notesClock: { writtenAt: 210, writerId: WRITER },
  } as const;

  it("records only winning, value-changing fields; not submitted stale intent", () => {
    const result = applyMetalMetadataEvidencePatch(before, {
      name: { value: "Family Gold", writtenAt: 220, writerId: WRITER },
      notes: { value: "Gift", writtenAt: 190, writerId: WRITER },
    });
    expect(result.decisions).toEqual({ name: "apply", notes: "ignore" });
    expect(result.after.name).toBe("Family Gold");
    expect(result.after.notes).toBeNull();
    expect(result.appliedChanges).toEqual({
      name: {
        before: "Gold Bar",
        after: "Family Gold",
        clock: { writtenAt: 220, writerId: WRITER },
      },
    });
  });

  it("does not claim a value change for a newer clock with the same value", () => {
    const result = applyMetalMetadataEvidencePatch(before, {
      name: { value: "Gold Bar", writtenAt: 220, writerId: WRITER },
    });
    expect(result.decisions.name).toBe("apply");
    expect(result.appliedChanges).toEqual({});
    expect(result.after.nameClock).toEqual({
      writtenAt: 220,
      writerId: WRITER,
    });
  });

  it("preserves a note clear as an exact null after-value", () => {
    const result = applyMetalMetadataEvidencePatch(
      { ...before, notes: "Old note" },
      { notes: { value: null, writtenAt: 220, writerId: WRITER } }
    );
    expect(result.appliedChanges.notes).toEqual({
      before: "Old note",
      after: null,
      clock: { writtenAt: 220, writerId: WRITER },
    });
  });

  it("rejects an equal-clock conflicting value without partially accepting another field", () => {
    expect(() =>
      applyMetalMetadataEvidencePatch(before, {
        name: { value: "Conflict", writtenAt: 200, writerId: WRITER },
        notes: { value: "Would win", writtenAt: 250, writerId: WRITER },
      })
    ).toThrow("metal_metadata_tuple_conflict");
  });

  function row(
    status: MetalMetadataHistoryRecord["status"],
    overrides: Partial<MetalMetadataHistoryRecord> = {}
  ): MetalMetadataHistoryRecord {
    return {
      id: "018f0c7a-1234-7abc-8def-000000000010",
      userId: USER,
      holdingId: HOLDING,
      linkedActionId: null,
      occurredAt: "2026-10-10T10:00:00.000Z",
      status,
      localAppliedChangesJson: JSON.stringify({
        name: {
          before: "Gold Bar",
          after: "Family Gold",
          clock: { writtenAt: 220, writerId: WRITER },
        },
      }),
      canonicalAppliedChangesJson:
        status === "applied"
          ? JSON.stringify({
              name: {
                before: "Gold Bar",
                after: "Canonical Gold",
                clock: { writtenAt: 250, writerId: WRITER },
              },
            })
          : null,
      ...overrides,
    };
  }

  it("shows locally applied exact deltas offline without a new status label", () => {
    expect(
      projectAppliedMetalMetadataHistory([row("pending")], USER, HOLDING)
    ).toEqual([
      expect.objectContaining({
        changes: [
          {
            field: "name",
            before: "Gold Bar",
            after: "Family Gold",
          },
        ],
      }),
    ]);
  });

  it("uses server evidence after adjudication, not old local intent", () => {
    const history = projectAppliedMetalMetadataHistory(
      [row("applied")],
      USER,
      HOLDING
    );
    expect(history[0]?.changes).toEqual([
      { field: "name", before: "Gold Bar", after: "Canonical Gold" },
    ]);
  });

  it("excludes ignored/rejected, empty, malformed and foreign-user evidence", () => {
    const malformed = row("applied", {
      canonicalAppliedChangesJson: "{invalid",
    });
    expect(
      projectAppliedMetalMetadataHistory(
        [
          row("ignored"),
          row("rejected"),
          row("applied", {
            id: "018f0c7a-1234-7abc-8def-000000000011",
            canonicalAppliedChangesJson: "{}",
          }),
          malformed,
          row("pending", {
            id: "018f0c7a-1234-7abc-8def-000000000012",
            userId: OTHER,
          }),
        ],
        USER,
        HOLDING
      )
    ).toEqual([]);
  });

  it("groups accepted mixed metadata by the linked material action identity", () => {
    const actionId = "018f0c7a-1234-7abc-8def-000000000020";
    expect(
      projectAppliedMetalMetadataHistory(
        [row("applied", { linkedActionId: actionId })],
        USER,
        HOLDING
      )[0]?.linkedActionId
    ).toBe(actionId);
  });

  it("preserves distinct offline edits through restart-shaped serialized records", () => {
    const first = row("pending");
    const second = row("pending", {
      id: "018f0c7a-1234-7abc-8def-000000000013",
      occurredAt: "2026-10-10T10:01:00.000Z",
      localAppliedChangesJson: JSON.stringify({
        notes: {
          before: null,
          after: "Family gift",
          clock: { writtenAt: 240, writerId: WRITER },
        },
      }),
    });
    const restarted = JSON.parse(
      JSON.stringify([first, second])
    ) as MetalMetadataHistoryRecord[];
    const history = projectAppliedMetalMetadataHistory(
      restarted,
      USER,
      HOLDING
    );
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.id)).toEqual([second.id, first.id]);
  });
});
