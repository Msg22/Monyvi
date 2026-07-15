import {
  createQaSmsEvidenceService,
  type QaSmsEvidenceService,
} from "@/services/dev/qa-sms-evidence-service";

interface EvidenceHarness {
  readonly service: QaSmsEvidenceService;
  readonly secureValues: Map<string, string>;
  readonly markerValues: Map<string, string>;
  readonly secureStore: {
    readonly getItem: jest.MockedFunction<
      (key: string) => Promise<string | null>
    >;
    readonly setItem: jest.MockedFunction<
      (key: string, value: string) => Promise<void>
    >;
    readonly deleteItem: jest.MockedFunction<(key: string) => Promise<void>>;
  };
  readonly markerStore: {
    readonly getItem: jest.MockedFunction<
      (key: string) => Promise<string | null>
    >;
    readonly setItem: jest.MockedFunction<
      (key: string, value: string) => Promise<void>
    >;
    readonly removeItem: jest.MockedFunction<(key: string) => Promise<void>>;
  };
  readonly digest: jest.MockedFunction<(value: string) => Promise<string>>;
}

function createHarness(): EvidenceHarness {
  const secureValues = new Map<string, string>();
  const markerValues = new Map<string, string>();
  const secureStore = {
    getItem: jest.fn((key: string) =>
      Promise.resolve(secureValues.get(key) ?? null)
    ),
    setItem: jest.fn((key: string, value: string) => {
      secureValues.set(key, value);
      return Promise.resolve();
    }),
    deleteItem: jest.fn((key: string) => {
      secureValues.delete(key);
      return Promise.resolve();
    }),
  };
  const markerStore = {
    getItem: jest.fn((key: string) =>
      Promise.resolve(markerValues.get(key) ?? null)
    ),
    setItem: jest.fn((key: string, value: string) => {
      markerValues.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      markerValues.delete(key);
      return Promise.resolve();
    }),
  };
  const digest = jest.fn((value: string) =>
    Promise.resolve(`sha256:${value.length}`)
  );
  const service = createQaSmsEvidenceService({
    secureStore,
    markerStore,
    createSecret: jest.fn(() => Promise.resolve("secret-value")),
    digest,
  });
  return {
    service,
    secureValues,
    markerValues,
    secureStore,
    markerStore,
    digest,
  };
}

describe("QaSmsEvidenceService", () => {
  it("creates and reuses a secure secret without exporting it", async () => {
    const { service, secureValues } = createHarness();
    const first = await service.createEvidenceDigest("fingerprint-1");
    const second = await service.createEvidenceDigest("fingerprint-1");

    expect(first).toEqual(second);
    expect(secureValues.size).toBe(1);
    expect(first).not.toContain("secret-value");
  });

  it("uses domain separation so app fingerprints are not exported directly", async () => {
    const { service, digest } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    expect(digest).toHaveBeenCalledWith(
      expect.stringMatching(/^monyvi:qa-sms-evidence:v1:/)
    );
  });

  it("blocks when an initialized secret is missing or corrupt", async () => {
    const { service, secureValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    secureValues.clear();
    await expect(
      service.createEvidenceDigest("fingerprint-2")
    ).rejects.toMatchObject({ code: "evidence_secret_unavailable" });
    expect(service.getRecoveryState()).toEqual({
      status: "blocked",
      reason: "evidence_secret_unavailable",
    });
  });

  it("blocks export status lookup when the initialized secret has been lost", async () => {
    const { service, secureValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    secureValues.clear();

    await expect(service.getEvidenceDomainStatus()).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
    });
    expect(service.getRecoveryState()).toEqual({
      status: "blocked",
      reason: "evidence_secret_unavailable",
    });
  });

  it("repairs a missing initialization marker while the secure secret still exists", async () => {
    const { service, markerValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    markerValues.clear();

    await service.createEvidenceDigest("fingerprint-2");

    expect(markerValues.get("monyvi.qaSmsEvidence.initialized.v1")).toBe(
      "initialized"
    );
  });

  it("writes the initialization marker before the secure secret so partial setup fails closed", async () => {
    const { service, secureStore } = createHarness();
    secureStore.setItem.mockRejectedValueOnce(new Error("secure write failed"));

    await expect(
      service.createEvidenceDigest("fingerprint-1")
    ).rejects.toBeDefined();
    await expect(
      service.createEvidenceDigest("fingerprint-2")
    ).rejects.toMatchObject({ code: "evidence_secret_unavailable" });
  });

  it("fails closed with a safe code when evidence-domain status cannot be read", async () => {
    const { service, markerStore, markerValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    markerStore.getItem.mockImplementation((key: string) =>
      key === "monyvi.qaSmsEvidence.domainStatus.v1"
        ? Promise.reject(new Error("storage detail"))
        : Promise.resolve(markerValues.get(key) ?? null)
    );

    await expect(service.getEvidenceDomainStatus()).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
      message: "evidence_secret_unavailable",
    });
  });

  it("fails closed with a safe code when secure secret generation fails", async () => {
    const broken = createQaSmsEvidenceService({
      secureStore: {
        getItem: jest.fn(() => Promise.resolve(null)),
        setItem: jest.fn(() => Promise.resolve()),
        deleteItem: jest.fn(() => Promise.resolve()),
      },
      markerStore: {
        getItem: jest.fn(() => Promise.resolve(null)),
        setItem: jest.fn(() => Promise.resolve()),
        removeItem: jest.fn(() => Promise.resolve()),
      },
      createSecret: jest.fn(() =>
        Promise.reject(new Error("random provider detail"))
      ),
      digest: jest.fn(() => Promise.resolve("digest")),
    });

    await expect(
      broken.createEvidenceDigest("fingerprint-1")
    ).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
      message: "evidence_secret_unavailable",
    });
  });

  it("fails closed with a safe code when evidence-domain recovery storage fails", async () => {
    const { service, secureStore } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    secureStore.deleteItem.mockRejectedValueOnce(
      new Error("keystore delete detail")
    );

    await expect(service.startNewEvidenceDomain(true)).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
      message: "evidence_secret_unavailable",
    });
    expect(service.getRecoveryState()).toEqual({
      status: "blocked",
      reason: "evidence_secret_unavailable",
    });
  });

  it("starts a new evidence domain only after explicit acknowledgement", async () => {
    const { service, secureValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    secureValues.clear();
    await expect(service.startNewEvidenceDomain(false)).rejects.toMatchObject({
      code: "new_domain_acknowledgement_required",
    });
    await expect(service.startNewEvidenceDomain(true)).resolves.toEqual({
      requiresManualDuplicateReview: true,
    });
    await expect(
      service.createEvidenceDigest("fingerprint-2")
    ).resolves.toBeDefined();
    await expect(service.getEvidenceDomainStatus()).resolves.toBe(
      "reset_requires_manual_duplicate_review"
    );
  });

  it("persists reset status before destructive evidence-domain rotation", async () => {
    const { service, secureStore, markerValues } = createHarness();
    await service.createEvidenceDigest("fingerprint-1");
    secureStore.deleteItem.mockRejectedValueOnce(
      new Error("simulated interruption")
    );

    await expect(service.startNewEvidenceDomain(true)).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
    });

    expect(markerValues.get("monyvi.qaSmsEvidence.domainStatus.v1")).toBe(
      "reset_requires_manual_duplicate_review"
    );
  });

  it("fails closed with a safe code when secure storage cannot be read", async () => {
    const broken = createQaSmsEvidenceService({
      secureStore: {
        getItem: jest.fn(() =>
          Promise.reject(new Error("device keystore detail"))
        ),
        setItem: jest.fn(() => Promise.resolve()),
        deleteItem: jest.fn(() => Promise.resolve()),
      },
      markerStore: {
        getItem: jest.fn(() => Promise.resolve(null)),
        setItem: jest.fn(() => Promise.resolve()),
        removeItem: jest.fn(() => Promise.resolve()),
      },
      createSecret: jest.fn(() => Promise.resolve("secret-value")),
      digest: jest.fn(() => Promise.resolve("digest")),
    });
    await expect(
      broken.createEvidenceDigest("fingerprint-1")
    ).rejects.toMatchObject({
      code: "evidence_secret_unavailable",
      message: "evidence_secret_unavailable",
    });
  });
});
