import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const SECRET_KEY = "monyvi.qaSmsEvidence.secret.v1";
const MARKER_KEY = "monyvi.qaSmsEvidence.initialized.v1";
const DOMAIN_STATUS_KEY = "monyvi.qaSmsEvidence.domainStatus.v1";
const DIGEST_DOMAIN = "monyvi:qa-sms-evidence:v1";

interface KeyValueStore {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
}

interface MarkerStore extends KeyValueStore {
  readonly removeItem: (key: string) => Promise<void>;
}

interface QaSmsEvidenceDependencies {
  readonly secureStore: KeyValueStore & {
    readonly deleteItem: (key: string) => Promise<void>;
  };
  readonly markerStore: MarkerStore;
  readonly createSecret: () => Promise<string>;
  readonly digest: (value: string) => Promise<string>;
}

interface QaSmsEvidenceError extends Error {
  readonly code:
    | "evidence_secret_unavailable"
    | "new_domain_acknowledgement_required";
}

type QaSmsEvidenceRecoveryState =
  | { readonly status: "ready" }
  | {
      readonly status: "blocked";
      readonly reason: "evidence_secret_unavailable";
    };

interface QaSmsEvidenceService {
  readonly createEvidenceDigest: (fingerprint: string) => Promise<string>;
  readonly getRecoveryState: () => QaSmsEvidenceRecoveryState;
  readonly getEvidenceDomainStatus: () => Promise<
    "stable" | "reset_requires_manual_duplicate_review"
  >;
  readonly startNewEvidenceDomain: (
    acknowledged: boolean
  ) => Promise<{ readonly requiresManualDuplicateReview: true }>;
}

function evidenceError(code: QaSmsEvidenceError["code"]): QaSmsEvidenceError {
  return Object.assign(new Error(code), { code });
}

export function createQaSmsEvidenceService(
  dependencies: QaSmsEvidenceDependencies
): QaSmsEvidenceService {
  let recoveryState: QaSmsEvidenceRecoveryState = { status: "ready" };

  function blockEvidenceDomain(): QaSmsEvidenceError {
    recoveryState = {
      status: "blocked",
      reason: "evidence_secret_unavailable",
    };
    return evidenceError("evidence_secret_unavailable");
  }

  async function getOrCreateSecret(): Promise<string> {
    if (recoveryState.status === "blocked") {
      throw evidenceError("evidence_secret_unavailable");
    }
    let secret: string | null;
    let markerValue: string | null;
    let domainStatus: string | null;
    try {
      [secret, markerValue, domainStatus] = await Promise.all([
        dependencies.secureStore.getItem(SECRET_KEY),
        dependencies.markerStore.getItem(MARKER_KEY),
        dependencies.markerStore.getItem(DOMAIN_STATUS_KEY),
      ]);
    } catch {
      throw blockEvidenceDomain();
    }
    if (secret) {
      if (markerValue !== "initialized") {
        try {
          await dependencies.markerStore.setItem(MARKER_KEY, "initialized");
        } catch {
          throw blockEvidenceDomain();
        }
      }
      return secret;
    }
    if (markerValue === "initialized") {
      throw blockEvidenceDomain();
    }
    let created: string;
    try {
      created = await dependencies.createSecret();
      await dependencies.markerStore.setItem(MARKER_KEY, "initialized");
      await dependencies.secureStore.setItem(SECRET_KEY, created);
      if (domainStatus !== "reset_requires_manual_duplicate_review") {
        await dependencies.markerStore.setItem(DOMAIN_STATUS_KEY, "stable");
      }
    } catch {
      throw blockEvidenceDomain();
    }
    return created;
  }

  return {
    async createEvidenceDigest(fingerprint: string): Promise<string> {
      const secret = await getOrCreateSecret();
      return dependencies.digest(`${DIGEST_DOMAIN}:${secret}:${fingerprint}`);
    },
    getRecoveryState(): QaSmsEvidenceRecoveryState {
      return recoveryState;
    },
    async getEvidenceDomainStatus(): Promise<
      "stable" | "reset_requires_manual_duplicate_review"
    > {
      await getOrCreateSecret();
      let status: string | null;
      try {
        status = await dependencies.markerStore.getItem(DOMAIN_STATUS_KEY);
      } catch {
        throw blockEvidenceDomain();
      }
      return status === "reset_requires_manual_duplicate_review"
        ? status
        : "stable";
    },
    async startNewEvidenceDomain(
      acknowledged: boolean
    ): Promise<{ readonly requiresManualDuplicateReview: true }> {
      if (!acknowledged) {
        throw evidenceError("new_domain_acknowledgement_required");
      }
      try {
        await dependencies.markerStore.setItem(
          DOMAIN_STATUS_KEY,
          "reset_requires_manual_duplicate_review"
        );
        await dependencies.secureStore.deleteItem(SECRET_KEY);
        await dependencies.markerStore.removeItem(MARKER_KEY);
        recoveryState = { status: "ready" };
        await getOrCreateSecret();
      } catch {
        throw blockEvidenceDomain();
      }
      return { requiresManualDuplicateReview: true } as const;
    },
  };
}

export const qaSmsEvidenceService = createQaSmsEvidenceService({
  secureStore: {
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    deleteItem: SecureStore.deleteItemAsync,
  },
  markerStore: AsyncStorage,
  createSecret: async (): Promise<string> => {
    const bytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  },
  digest: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
});

export type { QaSmsEvidenceRecoveryState, QaSmsEvidenceService };
