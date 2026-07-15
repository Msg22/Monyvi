import { buildQaSmsEvidenceIdentity, type SmsMessage } from "@monyvi/logic";
import {
  createQaSmsPatternIntakeService,
  type QaSmsPatternIntakeService,
} from "@/services/dev/qa-sms-pattern-intake-service";

const message = (index: number, address = "QNB"): SmsMessage => ({
  id: `native-${index}`,
  address,
  body: `QA PURCHASE EGP ${100 + index}.25 CARD 4321 AT QA SHOP`,
  date: 1_750_000_000_000 + index,
  read: true,
});

interface IntakeHarness {
  readonly service: QaSmsPatternIntakeService;
  readonly readInbox: jest.MockedFunction<
    (options: {
      readonly address: string;
      readonly maxCount: number;
    }) => Promise<readonly SmsMessage[]>
  >;
  readonly createEvidenceDigest: jest.MockedFunction<
    (fingerprint: string) => Promise<string>
  >;
  readonly getPermissionStatus: jest.MockedFunction<
    () => Promise<"granted" | "denied" | "blocked" | "undetermined">
  >;
}

function createHarness(
  permission: "granted" | "denied" | "blocked" = "granted",
  sender = "QNB",
  isAvailable = true
): IntakeHarness {
  let createdIdCount = 0;
  const readInbox = jest.fn(
    (_options: { readonly address: string; readonly maxCount: number }) =>
      Promise.resolve(
        Array.from({ length: 600 }, (_, index) => message(index, sender))
      )
  );
  const createEvidenceDigest = jest.fn((_fingerprint: string) =>
    Promise.resolve("a".repeat(64))
  );
  const getPermissionStatus = jest.fn(() => Promise.resolve(permission));
  const service = createQaSmsPatternIntakeService({
    getAvailability: () =>
      isAvailable
        ? { isAvailable: true }
        : { isAvailable: false, reason: "release_build" },
    getPermissionStatus,
    readInbox,
    computeFingerprint: jest.fn(({ receivedAtMs }) =>
      Promise.resolve(`fp-${receivedAtMs}`)
    ),
    buildEvidenceIdentity: buildQaSmsEvidenceIdentity,
    createEvidenceDigest,
    startNewEvidenceDomain: jest.fn(() =>
      Promise.resolve({ requiresManualDuplicateReview: true as const })
    ),
    getEvidenceDomainStatus: jest.fn(() => Promise.resolve("stable" as const)),
    createId: jest.fn(
      () =>
        `00000000-0000-4000-8000-${String(createdIdCount++).padStart(12, "0")}`
    ),
    now: jest.fn(() => new Date("2026-07-13T00:00:00.000Z")),
  });
  return { service, readInbox, createEvidenceDigest, getPermissionStatus };
}

describe("QaSmsPatternIntakeService", () => {
  it("guards evidence status reads outside the QA runtime", async () => {
    const { service } = createHarness("granted", "QNB", false);

    await expect(service.getEvidenceDomainStatus()).rejects.toMatchObject({
      code: "release_build",
    });
  });

  it("requires authorization before reading and caps the QNB inbox at 3000", async () => {
    const { service, readInbox } = createHarness();
    const messagesByAlias: Record<string, readonly SmsMessage[]> = {
      QNB: Array.from({ length: 1200 }, (_, index) => message(index, "QNB")),
      "QNB EGYPT": Array.from({ length: 1200 }, (_, index) =>
        message(index + 1200, "QNB EGYPT")
      ),
      "QNB ALAHLI": Array.from({ length: 1200 }, (_, index) =>
        message(index + 2400, "QNB ALAHLI")
      ),
    };
    readInbox.mockImplementation(({ address, maxCount }) =>
      Promise.resolve((messagesByAlias[address] ?? []).slice(0, maxCount))
    );
    await expect(service.listQnbMessages()).rejects.toMatchObject({
      code: "not_authorized",
    });
    expect(readInbox).not.toHaveBeenCalled();

    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP", "USD"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    expect(messages).toHaveLength(3000);
    expect(readInbox.mock.calls.map(([options]) => options.address)).toEqual([
      "QNB",
      "QNB EGYPT",
      "QNB ALAHLI",
    ]);
    expect(readInbox).toHaveBeenCalledTimes(3);
    expect(readInbox.mock.calls.map(([options]) => options.maxCount)).toEqual([
      3000, 3000, 3000,
    ]);
    expect(readInbox).not.toHaveBeenCalledWith(
      expect.objectContaining({ address: "" })
    );
  });

  it("keeps the newest 3000 messages after considering every verified alias", async () => {
    const { service, readInbox } = createHarness();
    readInbox.mockImplementation(({ address }) => {
      if (address === "QNB") {
        return Promise.resolve(
          Array.from({ length: 3000 }, (_, index) => message(index, "QNB"))
        );
      }
      if (address === "QNB EGYPT") {
        return Promise.resolve([message(1900, "QNB EGYPT")]);
      }
      return Promise.resolve([]);
    });
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP", "USD"],
      messageFamilyScope: ["card_purchase"],
    });

    const messages = await service.listQnbMessages();

    expect(messages).toHaveLength(3000);
    expect(messages[0]?.nativeMessageId).toBe("native-2999");
    expect(readInbox).toHaveBeenCalledWith({
      address: "QNB ALAHLI",
      maxCount: 3000,
    });
  });

  it("merges verified QNB aliases, deduplicates native IDs, and sorts newest first", async () => {
    const readInbox = jest.fn(
      ({
        address,
      }: {
        readonly address: string;
        readonly maxCount: number;
      }) => {
        const messagesByAlias: Record<string, readonly SmsMessage[]> = {
          QNB: [message(1, "QNB"), message(2, "QNB"), message(5, "QNB FRAUD")],
          "QNB EGYPT": [message(2, "QNB"), message(4, "QNB EGYPT")],
          "QNB ALAHLI": [message(3, "QNB ALAHLI")],
        };
        return Promise.resolve(messagesByAlias[address] ?? []);
      }
    );
    const service = createQaSmsPatternIntakeService({
      getAvailability: () => ({ isAvailable: true }),
      getPermissionStatus: jest.fn(() => Promise.resolve("granted" as const)),
      readInbox,
      computeFingerprint: jest.fn(({ receivedAtMs }) =>
        Promise.resolve(`fp-${receivedAtMs}`)
      ),
      buildEvidenceIdentity: buildQaSmsEvidenceIdentity,
      createEvidenceDigest: jest.fn(() => Promise.resolve("a".repeat(64))),
      startNewEvidenceDomain: jest.fn(() =>
        Promise.resolve({ requiresManualDuplicateReview: true as const })
      ),
      getEvidenceDomainStatus: jest.fn(() =>
        Promise.resolve("stable" as const)
      ),
      createId: jest.fn(() => "session-id"),
      now: jest.fn(() => new Date("2026-07-13T00:00:00.000Z")),
    });
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP", "USD"],
      messageFamilyScope: ["card_purchase"],
    });

    const messages = await service.listQnbMessages();

    expect(messages.map(({ nativeMessageId }) => nativeMessageId)).toEqual([
      "native-4",
      "native-3",
      "native-2",
      "native-1",
    ]);
  });

  it("uses content identity for evidence duplicated at different timestamps", async () => {
    const { service, readInbox, createEvidenceDigest } = createHarness();
    const first = message(1);
    const repeated = {
      ...first,
      id: "native-repeated",
      date: first.date + 60_000,
    };
    readInbox.mockImplementation(({ address }) =>
      Promise.resolve(address === "QNB" ? [first, repeated] : [])
    );
    createEvidenceDigest.mockImplementation((identity) =>
      Promise.resolve(identity)
    );
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages(
      messages.map(({ localSelectionId }) => localSelectionId)
    );

    const drafts = await service.sanitizeSelectedMessages();

    expect(drafts).toHaveLength(2);
    expect(
      new Set(drafts.map(({ evidenceDigest }) => evidenceDigest)).size
    ).toBe(1);
  });

  it.each(["denied", "blocked"] as const)(
    "clears raw state and blocks inbox reads when permission is %s",
    async (permission) => {
      const { service, readInbox } = createHarness(permission);
      service.authorize({
        acknowledged: true,
        currencyScope: ["EGP"],
        messageFamilyScope: ["card_purchase"],
      });
      await expect(service.listQnbMessages()).rejects.toMatchObject({
        code: `sms_permission_${permission}`,
      });
      expect(readInbox).not.toHaveBeenCalled();
      expect(service.getSnapshot().messageCount).toBe(0);
    }
  );

  it("allows only explicit selected IDs and caps selection at 50", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    const selectedIds = messages
      .slice(0, 51)
      .map(({ localSelectionId }) => localSelectionId);
    expect(() => service.selectMessages(selectedIds)).toThrow(
      "selection_limit_exceeded"
    );
    service.selectMessages(selectedIds.slice(0, 2));
    expect(service.getSelectedMessages()).toHaveLength(2);
  });

  it("creates evidence and sanitized drafts only for explicitly selected messages", async () => {
    const { service, createEvidenceDigest } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP", "USD"],
      messageFamilyScope: ["card_purchase", "otp"],
    });
    const messages = await service.listQnbMessages();
    expect(createEvidenceDigest).not.toHaveBeenCalled();

    service.selectMessages(
      messages.slice(0, 2).map(({ localSelectionId }) => localSelectionId)
    );
    const drafts = await service.sanitizeSelectedMessages();

    expect(createEvidenceDigest).toHaveBeenCalledTimes(2);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      verifiedSenderAlias: "QNB",
      messageFamily: null,
      currency: "EGP",
      classificationStatus: "pending",
    });
    expect(JSON.stringify(drafts)).not.toContain("QA SHOP");
  });

  it("normalizes the verified QNB EGYPT sender alias", async () => {
    const { service } = createHarness("granted", "QNB EGYPT");
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);

    await expect(service.sanitizeSelectedMessages()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ verifiedSenderAlias: "QNB EGYPT" }),
      ])
    );
  });

  it("classifies, revalidates, approves, and builds an export-safe artifact", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    const [draft] = await service.sanitizeSelectedMessages();
    const classified = service.classifyDraft(draft, {
      messageFamily: "card_purchase",
      currency: "EGP",
    });
    const validated = service.validateDraft(classified);
    expect(validated).toMatchObject({
      status: "validated",
      validationFindings: [],
    });
    const approved = service.approveDraft(validated);
    const artifact = service.buildCandidateArtifact(approved);

    expect(approved.status).toBe("approved");
    expect(artifact).toMatchObject({
      providerId: "qnb-egypt",
      messageFamily: "card_purchase",
      currency: "EGP",
      runtimeScope: "candidate",
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /native-|smsFingerprint|currencyScope|messageFamilyScope/
    );
  });

  it("rejects classifications outside the authorized family or currency scope", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    const [draft] = await service.sanitizeSelectedMessages();

    expect(() =>
      service.classifyDraft(draft, {
        messageFamily: "atm_withdrawal",
        currency: "EGP",
      })
    ).toThrow("message_family_outside_authorized_scope");
    expect(() =>
      service.classifyDraft(draft, {
        messageFamily: "card_purchase",
        currency: "USD",
      })
    ).toThrow("currency_outside_authorized_scope");
  });

  it("preserves earlier operator corrections when another raw range is corrected", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    const [draft] = await service.sanitizeSelectedMessages();
    const rawBody = messages[0].body;
    const amountStart = rawBody.indexOf("699.25");
    const merchantStart = rawBody.indexOf("QA SHOP");

    const balanceCorrected = service.applyPlaceholderCorrections(draft, {
      rawBody,
      corrections: [
        {
          startOffset: amountStart,
          endOffset: amountStart + "699.25".length,
          token: "BALANCE",
          semanticRole: "available_balance",
        },
      ],
    });
    const merchantCorrected = service.applyPlaceholderCorrections(
      balanceCorrected,
      {
        rawBody,
        corrections: [
          {
            startOffset: merchantStart,
            endOffset: merchantStart + "QA SHOP".length,
            token: "MERCHANT",
            semanticRole: "merchant_name",
          },
        ],
      }
    );

    expect(merchantCorrected.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "placeholder",
          token: "BALANCE",
          semanticRole: "available_balance",
          wasOperatorCorrected: true,
        }),
        expect.objectContaining({
          kind: "placeholder",
          token: "MERCHANT",
          semanticRole: "merchant_name",
          wasOperatorCorrected: true,
        }),
      ])
    );
  });

  it("previews and atomically applies multiple placeholder corrections", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    const [draft] = await service.sanitizeSelectedMessages();
    const rawBody = messages[0].body;
    const amountStart = rawBody.indexOf("699.25");
    const merchantStart = rawBody.indexOf("QA SHOP");
    const corrections = [
      {
        startOffset: amountStart,
        endOffset: amountStart + "699.25".length,
        token: "BALANCE" as const,
        semanticRole: "available_balance" as const,
      },
      {
        startOffset: merchantStart,
        endOffset: merchantStart + "QA SHOP".length,
        token: "MERCHANT" as const,
        semanticRole: "merchant_name" as const,
      },
    ];

    const preview = service.previewPlaceholderCorrections(draft, {
      rawBody,
      corrections,
    });
    expect(service.getSnapshot().drafts[0]).toBe(draft);
    expect(preview.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ semanticRole: "available_balance" }),
        expect.objectContaining({ semanticRole: "merchant_name" }),
      ])
    );

    const applied = service.applyPlaceholderCorrections(draft, {
      rawBody,
      corrections,
    });
    expect(service.getSnapshot().drafts[0]).toBe(applied);
  });

  it("rechecks permission before sanitizing cached selected messages", async () => {
    const { service, getPermissionStatus, createEvidenceDigest } =
      createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    getPermissionStatus.mockResolvedValue("denied");

    await expect(service.sanitizeSelectedMessages()).rejects.toMatchObject({
      code: "sms_permission_denied",
    });
    expect(createEvidenceDigest).not.toHaveBeenCalled();
    expect(service.getSnapshot().messageCount).toBe(0);
  });

  it("clears raw workflow state when evidence digest creation fails", async () => {
    const { service, createEvidenceDigest } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);
    createEvidenceDigest.mockRejectedValueOnce(
      new Error("evidence_secret_unavailable")
    );

    await expect(service.sanitizeSelectedMessages()).rejects.toThrow(
      "evidence_secret_unavailable"
    );
    expect(service.getSnapshot()).toMatchObject({
      messageCount: 0,
      selectedIds: [],
      drafts: [],
    });
  });

  it("does not retain sanitization results after the authorized session closes", async () => {
    const { service, createEvidenceDigest } = createHarness();
    let resolveDigest: (digest: string) => void = () => undefined;
    createEvidenceDigest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDigest = resolve;
        })
    );
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);

    const pendingDrafts = service.sanitizeSelectedMessages();
    await Promise.resolve();
    await Promise.resolve();
    expect(createEvidenceDigest).toHaveBeenCalledTimes(1);
    service.close();
    resolveDigest("a".repeat(64));

    await expect(pendingDrafts).rejects.toMatchObject({
      code: "not_authorized",
    });
    expect(service.getSnapshot()).toEqual({
      authorization: null,
      messageCount: 0,
      selectedIds: [],
      drafts: [],
    });
  });

  it("keeps the loaded inbox available when no message is selected", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    await service.listQnbMessages();

    await expect(service.sanitizeSelectedMessages()).rejects.toMatchObject({
      code: "selection_required",
    });
    const snapshot = service.getSnapshot();
    expect(snapshot.selectedIds).toEqual([]);
    expect(snapshot.drafts).toEqual([]);
    expect(snapshot.messageCount).toBe(600);
    expect(snapshot).not.toHaveProperty("messages");
  });

  it("clears retained raw state when a later inbox read fails", async () => {
    const { service, readInbox } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    await service.listQnbMessages();
    readInbox.mockRejectedValue(new Error("native_read_failed"));

    await expect(service.listQnbMessages()).rejects.toThrow(
      "native_read_failed"
    );
    expect(service.getSnapshot().messageCount).toBe(0);
  });

  it("requires fresh authorization after starting a new evidence domain", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    await service.listQnbMessages();

    await service.startNewEvidenceDomain();

    expect(service.getSnapshot().authorization).toBeNull();
    await expect(service.listQnbMessages()).rejects.toMatchObject({
      code: "not_authorized",
    });
  });

  it("clears raw state when permission is revoked after inbox loading", async () => {
    let permission: "granted" | "denied" = "granted";
    const readInbox = jest.fn(() => Promise.resolve([message(1)]));
    const service = createQaSmsPatternIntakeService({
      getAvailability: () => ({ isAvailable: true }),
      getPermissionStatus: jest.fn(() => Promise.resolve(permission)),
      readInbox,
      computeFingerprint: jest.fn(() => Promise.resolve("fp-1")),
      buildEvidenceIdentity: buildQaSmsEvidenceIdentity,
      createEvidenceDigest: jest.fn(() => Promise.resolve("evidence-1")),
      startNewEvidenceDomain: jest.fn(() =>
        Promise.resolve({ requiresManualDuplicateReview: true as const })
      ),
      getEvidenceDomainStatus: jest.fn(() =>
        Promise.resolve("stable" as const)
      ),
      createId: jest.fn(() => "session-id"),
      now: jest.fn(() => new Date("2026-07-13T00:00:00.000Z")),
    });
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    await service.listQnbMessages();
    permission = "denied";

    expect(await service.handlePermissionChange()).toBe("revoked");
    expect(service.getSnapshot().messageCount).toBe(0);
  });

  it("clears authorization, raw messages, and drafts on close", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    await service.listQnbMessages();
    service.close();
    expect(service.getSnapshot()).toEqual({
      authorization: null,
      messageCount: 0,
      selectedIds: [],
      drafts: [],
    });
  });

  it("does not retain an inbox result after the authorized session closes", async () => {
    const { service, readInbox } = createHarness();
    let resolveInbox: (messages: readonly SmsMessage[]) => void = () =>
      undefined;
    readInbox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInbox = resolve;
        })
    );
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });

    const pendingMessages = service.listQnbMessages();
    await Promise.resolve();
    service.close();
    resolveInbox([message(1)]);

    await expect(pendingMessages).rejects.toMatchObject({
      code: "not_authorized",
    });
    expect(service.getSnapshot()).toEqual({
      authorization: null,
      messageCount: 0,
      selectedIds: [],
      drafts: [],
    });
  });

  it("discards only the requested in-memory draft", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages(
      messages.slice(0, 2).map(({ localSelectionId }) => localSelectionId)
    );
    const drafts = await service.sanitizeSelectedMessages();

    service.discardDraft(drafts[0]?.draftId ?? "missing-draft");

    expect(service.getSnapshot().drafts).toEqual([drafts[1]]);
    expect(service.getSnapshot().messageCount).toBe(600);
  });

  it("clears raw workflow state after approval without revoking authorization", async () => {
    const { service } = createHarness();
    service.authorize({
      acknowledged: true,
      currencyScope: ["EGP"],
      messageFamilyScope: ["card_purchase"],
    });
    const messages = await service.listQnbMessages();
    service.selectMessages([messages[0].localSelectionId]);

    service.clearRawState();

    const snapshot = service.getSnapshot();
    expect(snapshot.authorization?.providerScope).toBe("qnb-egypt");
    expect(snapshot.messageCount).toBe(0);
    expect(snapshot.selectedIds).toEqual([]);
    expect(snapshot.drafts).toEqual([]);
  });

  it("blocks evidence-domain reset outside the guarded development runtime", async () => {
    const { service } = createHarness("granted", "QNB", false);

    await expect(service.startNewEvidenceDomain()).rejects.toMatchObject({
      code: "release_build",
    });
  });
});
