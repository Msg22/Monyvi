import { normalizeCanonicalMetalMetadataEditOutcome } from "../../services/metal-metadata-evidence-reconciliation";

describe("#363 mixed financial action canonical metadata outcome", () => {
  const editId = "018f0c7a-1234-7abc-8def-000000000010";
  const holdingId = "018f0c7a-1234-7abc-8def-000000000003";

  it("binds an ignored mixed outcome to the correct edit without fabricating deltas", () => {
    const outcome = normalizeCanonicalMetalMetadataEditOutcome(
      {
        editId,
        holdingId,
        status: "ignored",
        appliedChanges: {},
        canonicalMetadata: {
          name: {
            value: "Server Name",
            writtenAt: 250,
            writerId: "018f0c7a-1234-7abc-8def-000000000011",
          },
          notes: { value: null, writtenAt: null, writerId: null },
        },
      },
      editId,
      holdingId
    );
    expect(outcome.status).toBe("ignored");
    expect(outcome.appliedChanges).toEqual({});
    expect(outcome.canonicalMetadata.name?.value).toBe("Server Name");
    expect(outcome.canonicalMetadata.notes).toEqual({
      value: null,
      writtenAt: null,
      writerId: null,
    });
  });
});
