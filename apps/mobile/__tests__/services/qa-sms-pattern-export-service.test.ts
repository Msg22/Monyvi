import type { QaCandidateBundle } from "@monyvi/logic";
import {
  createQaSmsExportFileWriter,
  createQaSmsPatternExportService,
  serializeQaCandidateBundle,
  type QaSmsPatternExportService,
} from "@/services/dev/qa-sms-pattern-export-service";

const bundle = {
  schemaVersion: 1,
  exportId: "123e4567-e89b-42d3-a456-426614174000",
  candidates: [{}],
} as unknown as QaCandidateBundle;

type DirectoryResult =
  | { readonly status: "granted"; readonly uri: string }
  | { readonly status: "cancelled" };

interface ExportHarness {
  readonly service: QaSmsPatternExportService;
  readonly pickDirectory: jest.MockedFunction<() => Promise<DirectoryResult>>;
  readonly writeFile: jest.MockedFunction<
    (
      directoryUri: string,
      fileName: string,
      contents: string
    ) => Promise<string>
  >;
  readonly deleteFile: jest.MockedFunction<(uri: string) => Promise<void>>;
}

function createHarness(): ExportHarness {
  const pickDirectory = jest.fn(() =>
    Promise.resolve({ status: "granted", uri: "local://qa" } as const)
  );
  const writeFile = jest.fn(
    (_directoryUri: string, _fileName: string, _contents: string) =>
      Promise.resolve("local://qa/file.json")
  );
  const deleteFile = jest.fn((_uri: string) => Promise.resolve());
  const service = createQaSmsPatternExportService({
    getAvailability: jest.fn(() => ({ isAvailable: true }) as const),
    validateBundle: jest.fn(() => ({ success: true, data: bundle }) as const),
    validatePrivacy: jest.fn(() => ({ isValid: true, findings: [] }) as const),
    validateIntegrity: jest.fn(() => Promise.resolve(true)),
    pickDirectory,
    writeFile,
    deleteFile,
    serialize: jest.fn(() => '{"safe":true}'),
  });
  return { service, pickDirectory, writeFile, deleteFile };
}

describe("QaSmsPatternExportService", () => {
  it("fails closed before validation when the runtime gate is unavailable", async () => {
    const harness = createHarness();
    const service = createQaSmsPatternExportService({
      getAvailability: jest.fn(
        () => ({ isAvailable: false, reason: "release_build" }) as const
      ),
      validateBundle: jest.fn(() => ({ success: true, data: bundle }) as const),
      validatePrivacy: jest.fn(
        () => ({ isValid: true, findings: [] }) as const
      ),
      validateIntegrity: jest.fn(() => Promise.resolve(true)),
      pickDirectory: harness.pickDirectory,
      writeFile: harness.writeFile,
      deleteFile: harness.deleteFile,
      serialize: JSON.stringify,
    });

    await expect(service.exportBundle(bundle)).resolves.toEqual({
      status: "failed",
      errorCode: "feature_unavailable",
    });
    expect(harness.pickDirectory).not.toHaveBeenCalled();
    expect(harness.writeFile).not.toHaveBeenCalled();
  });

  it("revalidates before opening the Android directory picker", async () => {
    const { service, pickDirectory, writeFile } = createHarness();
    await expect(service.exportBundle(bundle)).resolves.toEqual({
      status: "exported",
      candidateCount: 1,
    });
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      "local://qa",
      expect.stringMatching(/^qa-sms-candidates-/),
      '{"safe":true}'
    );
  });

  it("treats directory cancellation as a safe non-error", async () => {
    const { service, pickDirectory, writeFile } = createHarness();
    pickDirectory.mockResolvedValueOnce({ status: "cancelled" });
    await expect(service.exportBundle(bundle)).resolves.toEqual({
      status: "cancelled",
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("refuses writes when final schema or privacy validation fails", async () => {
    const harness = createHarness();
    const invalid = createQaSmsPatternExportService({
      getAvailability: jest.fn(() => ({ isAvailable: true }) as const),
      validateBundle: jest.fn(() => ({ success: false }) as const),
      validatePrivacy: jest.fn(
        () => ({ isValid: false, findings: [] }) as const
      ),
      validateIntegrity: jest.fn(() => Promise.resolve(true)),
      pickDirectory: harness.pickDirectory,
      writeFile: harness.writeFile,
      deleteFile: harness.deleteFile,
      serialize: JSON.stringify,
    });
    await expect(invalid.exportBundle(bundle)).resolves.toEqual({
      status: "failed",
      errorCode: "bundle_validation_failed",
    });
    expect(harness.pickDirectory).not.toHaveBeenCalled();
  });

  it("refuses a bundle whose canonical content digest no longer matches", async () => {
    const harness = createHarness();
    const validateIntegrity = jest.fn(() => Promise.resolve(false));
    const service = createQaSmsPatternExportService({
      getAvailability: jest.fn(() => ({ isAvailable: true }) as const),
      validateBundle: jest.fn(() => ({ success: true, data: bundle }) as const),
      validatePrivacy: jest.fn(
        () => ({ isValid: true, findings: [] }) as const
      ),
      validateIntegrity,
      pickDirectory: harness.pickDirectory,
      writeFile: harness.writeFile,
      deleteFile: harness.deleteFile,
      serialize: JSON.stringify,
    });

    await expect(service.exportBundle(bundle)).resolves.toEqual({
      status: "failed",
      errorCode: "bundle_validation_failed",
    });
    expect(validateIntegrity).toHaveBeenCalledWith(bundle);
    expect(harness.pickDirectory).not.toHaveBeenCalled();
  });

  it("attempts partial-write cleanup without returning a local URI", async () => {
    const { service, writeFile, deleteFile } = createHarness();
    writeFile.mockRejectedValueOnce(
      Object.assign(new Error("write failed"), {
        partialUri: "local://qa/partial.json",
      })
    );
    const result = await service.exportBundle(bundle);
    expect(result).toEqual({
      status: "failed",
      errorCode: "file_write_failed",
    });
    expect(JSON.stringify(result)).not.toContain("local://");
    expect(deleteFile).toHaveBeenCalledWith("local://qa/partial.json");
  });

  it("attaches the created SAF URI when writing file contents fails", async () => {
    const createFile = jest.fn(() =>
      Promise.resolve("local://qa/partial.json")
    );
    const writeContents = jest.fn(() => Promise.reject(new Error("full")));
    const writeFile = createQaSmsExportFileWriter({
      createFile,
      writeContents,
    });

    await expect(
      writeFile("local://qa", "bundle.json", '{"safe":true}')
    ).rejects.toMatchObject({ partialUri: "local://qa/partial.json" });
  });

  it("serializes candidates and coverage deterministically", () => {
    const unordered = {
      schemaVersion: 1,
      exportId: "123e4567-e89b-42d3-a456-426614174001",
      exportedAt: "2026-07-13T00:00:00.000Z",
      candidates: [
        { candidateId: "candidate-b" },
        { candidateId: "candidate-a" },
      ],
      coverageDeclarations: [
        { messageFamily: "otp", currency: null },
        { messageFamily: "card_purchase", currency: "USD" },
      ],
      integrity: {
        candidateCount: 2,
        candidateIds: ["candidate-b", "candidate-a"],
      },
    } as unknown as QaCandidateBundle;

    const first = serializeQaCandidateBundle(unordered);
    const second = serializeQaCandidateBundle(unordered);
    expect(first).toBe(second);
    expect(first.indexOf("candidate-a")).toBeLessThan(
      first.indexOf("candidate-b")
    );
    expect(first).not.toContain("local://");
  });
});
