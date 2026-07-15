import {
  qaCandidateBundleSchema,
  serializeQaCandidateBundleIntegrityPayload,
  validateQaSmsCandidatePrivacy,
  type QaCandidateBundle,
} from "@monyvi/logic";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { getQaSmsPatternIntakeAvailability } from "@/config/qa-sms-pattern-intake-config";

type ExportResult =
  | { readonly status: "exported"; readonly candidateCount: number }
  | { readonly status: "cancelled" }
  | {
      readonly status: "failed";
      readonly errorCode:
        | "bundle_validation_failed"
        | "feature_unavailable"
        | "file_write_failed";
    };

interface ExportDependencies {
  readonly getAvailability: typeof getQaSmsPatternIntakeAvailability;
  readonly validateBundle: (
    bundle: QaCandidateBundle
  ) =>
    | { readonly success: true; readonly data: QaCandidateBundle }
    | { readonly success: false };
  readonly validatePrivacy: (bundle: QaCandidateBundle) => {
    readonly isValid: boolean;
    readonly findings: readonly unknown[];
  };
  readonly validateIntegrity: (bundle: QaCandidateBundle) => Promise<boolean>;
  readonly pickDirectory: () => Promise<
    | { readonly status: "granted"; readonly uri: string }
    | { readonly status: "cancelled" }
  >;
  readonly writeFile: (
    directoryUri: string,
    fileName: string,
    contents: string
  ) => Promise<string>;
  readonly deleteFile: (uri: string) => Promise<void>;
  readonly serialize: (bundle: QaCandidateBundle) => string;
}

interface PartialWriteError extends Error {
  readonly partialUri?: string;
}

interface QaSmsExportFileWriterDependencies {
  readonly createFile: (
    directoryUri: string,
    fileName: string,
    mimeType: string
  ) => Promise<string>;
  readonly writeContents: (uri: string, contents: string) => Promise<void>;
}

interface QaSmsPatternExportService {
  readonly exportBundle: (bundle: QaCandidateBundle) => Promise<ExportResult>;
}

export function createQaSmsExportFileWriter(
  dependencies: QaSmsExportFileWriterDependencies
): ExportDependencies["writeFile"] {
  return async (directoryUri, fileName, contents): Promise<string> => {
    const uri = await dependencies.createFile(
      directoryUri,
      fileName,
      "application/json"
    );
    try {
      await dependencies.writeContents(uri, contents);
      return uri;
    } catch (error: unknown) {
      throw Object.assign(new Error("file_write_failed", { cause: error }), {
        partialUri: uri,
      });
    }
  };
}

export function serializeQaCandidateBundle(bundle: QaCandidateBundle): string {
  const candidates = [...bundle.candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  );
  const coverageDeclarations = [...bundle.coverageDeclarations].sort(
    (left, right) => {
      const leftKey = `${left.messageFamily}:${left.currency ?? "N/A"}`;
      const rightKey = `${right.messageFamily}:${right.currency ?? "N/A"}`;
      return leftKey.localeCompare(rightKey);
    }
  );
  return JSON.stringify(
    {
      ...bundle,
      candidates,
      coverageDeclarations,
      integrity: {
        ...bundle.integrity,
        candidateIds: candidates.map(({ candidateId }) => candidateId),
      },
    },
    null,
    2
  );
}

export function createQaSmsPatternExportService(
  dependencies: ExportDependencies
): QaSmsPatternExportService {
  return {
    async exportBundle(bundle: QaCandidateBundle): Promise<ExportResult> {
      if (!dependencies.getAvailability().isAvailable) {
        return { status: "failed", errorCode: "feature_unavailable" };
      }
      const validation = dependencies.validateBundle(bundle);
      if (
        !validation.success ||
        !dependencies.validatePrivacy(bundle).isValid
      ) {
        return { status: "failed", errorCode: "bundle_validation_failed" };
      }
      if (!(await dependencies.validateIntegrity(validation.data))) {
        return { status: "failed", errorCode: "bundle_validation_failed" };
      }
      const directory = await dependencies.pickDirectory();
      if (directory.status === "cancelled") return { status: "cancelled" };
      const safeExportId = bundle.exportId.replace(/[^a-zA-Z0-9_-]/g, "-");
      const fileName = `qa-sms-candidates-${safeExportId}.json`;
      try {
        await dependencies.writeFile(
          directory.uri,
          fileName,
          dependencies.serialize(validation.data)
        );
        return { status: "exported", candidateCount: bundle.candidates.length };
      } catch (error: unknown) {
        const partialUri = (error as PartialWriteError).partialUri;
        if (partialUri) {
          try {
            await dependencies.deleteFile(partialUri);
          } catch {
            // The safe result never exposes the local URI; cleanup is best effort.
          }
        }
        return { status: "failed", errorCode: "file_write_failed" };
      }
    },
  };
}

export const qaSmsPatternExportService = createQaSmsPatternExportService({
  getAvailability: getQaSmsPatternIntakeAvailability,
  validateBundle: (bundle) => qaCandidateBundleSchema.safeParse(bundle),
  validatePrivacy: (bundle) => {
    const findings = bundle.candidates.flatMap(
      (candidate) => validateQaSmsCandidatePrivacy(candidate).findings
    );
    return { isValid: findings.length === 0, findings };
  },
  validateIntegrity: async (bundle): Promise<boolean> => {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      serializeQaCandidateBundleIntegrityPayload(bundle)
    );
    return digest === bundle.integrity.contentDigest;
  },
  pickDirectory: async () => {
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    return permission.granted
      ? { status: "granted" as const, uri: permission.directoryUri }
      : { status: "cancelled" as const };
  },
  writeFile: createQaSmsExportFileWriter({
    createFile: (directoryUri, fileName, mimeType) =>
      FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        fileName,
        mimeType
      ),
    writeContents: (uri, contents) =>
      FileSystem.StorageAccessFramework.writeAsStringAsync(uri, contents),
  }),
  deleteFile: (uri): Promise<void> =>
    FileSystem.deleteAsync(uri, { idempotent: true }),
  serialize: serializeQaCandidateBundle,
});

export type { ExportResult, QaSmsPatternExportService };
