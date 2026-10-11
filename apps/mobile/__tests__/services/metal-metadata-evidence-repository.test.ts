import {
  createCanonicalMetalMetadataEditRequest,
  parseMetalMetadataEditRequest,
  type MetalMetadataEditRequestInput,
} from "../../services/metal-metadata-evidence-repository";

const userId = "018f0c7a-1234-7abc-8def-000000000001";
const holdingId = "018f0c7a-1234-7abc-8def-000000000003";
const editId = "018f0c7a-1234-7abc-8def-000000000010";
const hashProvider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(value.length.toString(16).padStart(64, "0")),
};

describe("#363 durable metadata edit request identity", () => {
  const input: MetalMetadataEditRequestInput = {
    editId,
    holdingId,
    userId,
    linkedActionId: null,
    occurredAt: "2026-10-10T12:00:00.000Z",
    fields: {
      name: {
        value: "Family Gold",
        writtenAt: 1791633600000,
        writerId: editId,
      },
      notes: { value: null, writtenAt: 1791633600000, writerId: editId },
    },
  };

  it("records every edit as stable canonical numeric-free JSON and hashes exact bytes", async () => {
    const request = await createCanonicalMetalMetadataEditRequest(
      input,
      hashProvider
    );
    expect(request.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(request.requestJson)).toEqual({
      editId,
      fields: {
        name: {
          value: "Family Gold",
          writtenAt: "1791633600000",
          writerId: editId,
        },
        notes: { value: null, writtenAt: "1791633600000", writerId: editId },
      },
      holdingId,
      linkedActionId: null,
      occurredAt: input.occurredAt,
      userId,
    });
    expect(
      await createCanonicalMetalMetadataEditRequest(input, hashProvider)
    ).toEqual(request);
    expect(parseMetalMetadataEditRequest(request.requestJson)).toEqual(input);
  });

  it("does not reuse another edit identity for the same clock", async () => {
    const another = "018f0c7a-1234-7abc-8def-000000000011";
    await expect(
      createCanonicalMetalMetadataEditRequest(
        { ...input, editId: another },
        hashProvider
      )
    ).rejects.toThrow("metal_metadata_invalid_edit_identity");
  });

  it("rejects invalid, empty, oversized or foreign-origin request fields", async () => {
    const bad = {
      ...input,
      fields: {
        name: { value: " ", writtenAt: 1791633600000, writerId: editId },
      },
    };
    await expect(
      createCanonicalMetalMetadataEditRequest(bad, hashProvider)
    ).rejects.toThrow("invalid_metal_metadata_patch");

    await expect(
      createCanonicalMetalMetadataEditRequest(
        { ...input, fields: {} },
        hashProvider
      )
    ).rejects.toThrow("invalid_metal_metadata_patch");
  });

  it("rejects malformed persisted JSON on restart rather than guessing history", () => {
    expect(() => parseMetalMetadataEditRequest("{bad")).toThrow(
      "invalid_metal_metadata_edit_request"
    );
    expect(() =>
      parseMetalMetadataEditRequest(
        '{"editId":"x","fields":{},"holdingId":"x","linkedActionId":null,"occurredAt":"wrong","userId":"x"}'
      )
    ).toThrow("invalid_metal_metadata_edit_request");
  });
});
