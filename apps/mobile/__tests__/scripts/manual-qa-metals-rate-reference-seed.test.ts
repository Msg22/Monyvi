const {
  buildManualQaMetalRateReferenceRows,
  buildMetalRateReferenceRowsFromEvidence,
} = jest.requireActual<{
  readonly buildManualQaMetalRateReferenceRows: (
    userId: string,
    seedScope?: string,
    currentTimestamp?: string
  ) => readonly Record<string, any>[];
  readonly buildMetalRateReferenceRowsFromEvidence: (
    evidenceRows: readonly Record<string, any>[],
    currentTimestamp?: string
  ) => readonly Record<string, any>[];
}>("../../scripts/seed-fixtures/manual-qa-metal-rate-reference-seed");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-09T04:30:00.000Z";

describe("manual QA acquisition rate-reference seed", () => {
  it("materializes one metal and one purchase-currency reference per QA holding", () => {
    const references = buildManualQaMetalRateReferenceRows(
      USER_ID,
      "manual-qa",
      NOW
    );
    const holdingIds = new Set(references.map((reference) => reference.holding_id));

    expect(holdingIds.size).toBe(5);
    expect(references).toHaveLength(10);

    for (const holdingId of holdingIds) {
      const acquisitionReferences = references.filter(
        (reference) => reference.holding_id === holdingId
      );
      expect(acquisitionReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "acquisition_metal",
            quality: "valid",
            deleted: false,
          }),
          expect.objectContaining({
            role: "acquisition_purchase_currency",
            quality: "valid",
            deleted: false,
          }),
        ])
      );
      expect(acquisitionReferences).toHaveLength(2);
      expect(
        acquisitionReferences.every(
          (reference) => reference.action_id === acquisitionReferences[0]?.action_id
        )
      ).toBe(true);
    }
  });

  it("keeps seeded reference identity deterministic", () => {
    expect(
      buildManualQaMetalRateReferenceRows(USER_ID, "manual-qa", NOW)
    ).toEqual(buildManualQaMetalRateReferenceRows(USER_ID, "manual-qa", NOW));
  });

  it("does not invent references when acquisition snapshots are absent", () => {
    expect(
      buildMetalRateReferenceRowsFromEvidence(
        [
          {
            action_id: "action-without-rates",
            created_at: NOW,
            deleted: false,
            domain_payload_json: { rateSnapshots: [] },
            holding_id: "holding-without-rates",
            kind: "add",
            user_id: USER_ID,
          },
        ],
        NOW
      )
    ).toEqual([]);
  });
});
