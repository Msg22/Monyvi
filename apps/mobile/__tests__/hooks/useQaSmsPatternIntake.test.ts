import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { QaInboxMessage, QaSanitizedCandidateDraft } from "@monyvi/logic";
import { AppState, type AppStateStatus } from "react-native";
import {
  useQaSmsPatternIntake,
  type QaSmsPermissionFacade,
} from "@/hooks/useQaSmsPatternIntake";
import type { QaSmsPatternExportService } from "@/services/dev/qa-sms-pattern-export-service";
import type { QaSmsPatternIntakeService } from "@/services/dev/qa-sms-pattern-intake-service";

const inboxMessage: QaInboxMessage = {
  localSelectionId: "local-1",
  nativeMessageId: "native-1",
  sender: "QNB",
  body: "raw body",
  receivedAtMs: 1_750_000_000_000,
  smsFingerprint: "fingerprint-1",
  isSelected: false,
};

const TEST_CANDIDATE_ID = "qa-candidate-123e4567-e89b-42d3-a456-426614174000";

const draft = {
  draftId: "draft-1",
  verifiedSenderAlias: "QNB",
  providerId: "qnb-egypt",
  messageFamily: null,
  currency: null,
  expectedOutcome: null,
  classificationStatus: "pending",
  segments: [
    { kind: "fixed", text: "Safe template " },
    {
      kind: "placeholder",
      token: "AMOUNT",
      semanticRole: "transaction_amount",
      wasOperatorCorrected: false,
    },
  ],
  evidenceDigest: "a".repeat(64),
  authorization: {
    version: 1,
    authorizationClass: "qa_operator_explicit",
    authorizedAt: "2026-07-13T00:00:00.000Z",
    providerScope: "qnb-egypt",
    currencyScope: ["EGP", "USD"],
    messageFamilyScope: ["card_purchase"],
  },
  validationFindings: [],
  status: "draft",
} satisfies QaSanitizedCandidateDraft;

function createService(): QaSmsPatternIntakeService {
  return {
    authorize: jest.fn(() => draft.authorization),
    listQnbMessages: jest.fn(() => Promise.resolve([inboxMessage])),
    selectMessages: jest.fn(),
    getSelectedMessages: jest.fn(() => [inboxMessage]),
    sanitizeSelectedMessages: jest.fn(() => Promise.resolve([draft])),
    classifyDraft: jest.fn((current, input) => ({
      ...current,
      messageFamily: input.messageFamily,
      currency: input.currency,
      expectedOutcome: {
        kind: "transaction" as const,
        direction: "expense" as const,
        requiredPlaceholderRoles: ["transaction_amount"],
        confidenceCeiling: 0.8,
        reviewStatus: "needs_review" as const,
        reviewReasons: ["candidate_pattern" as const],
      },
      classificationStatus: "confirmed" as const,
      status: "draft" as const,
    })),
    previewPlaceholderCorrections: jest.fn((current) => ({
      ...current,
      status: "draft" as const,
    })),
    applyPlaceholderCorrections: jest.fn((current) => ({
      ...current,
      status: "draft" as const,
    })),
    validateDraft: jest.fn((current) => ({
      ...current,
      validationFindings: [],
      status: "validated" as const,
    })),
    approveDraft: jest.fn((current) => ({
      ...current,
      status: "approved" as const,
    })),
    discardDraft: jest.fn(),
    buildCandidateArtifact: jest.fn((current) => ({
      schemaVersion: 1 as const,
      candidateId: TEST_CANDIDATE_ID,
      evidenceDigest: current.evidenceDigest,
      providerId: "qnb-egypt" as const,
      verifiedSenderAlias: "QNB",
      messageFamily: "card_purchase" as const,
      currency: "EGP" as const,
      expectedOutcome: {
        kind: "transaction" as const,
        direction: "expense" as const,
        requiredPlaceholderRoles: ["transaction_amount"],
        confidenceCeiling: 0.8,
        reviewStatus: "needs_review" as const,
        reviewReasons: ["candidate_pattern" as const],
      },
      segments: current.segments,
      sanitizedShape: "Safe template <AMOUNT>",
      sourceType: "qa-real-sms" as const,
      runtimeScope: "candidate" as const,
      autoSelectPolicy: "never" as const,
      authorization: {
        version: 1 as const,
        authorizationClass: "qa_operator_explicit" as const,
        authorizedAt: current.authorization.authorizedAt,
        providerScope: "qnb-egypt" as const,
      },
      createdAt: "2026-07-13T01:00:00.000Z",
    })),
    handlePermissionChange: jest.fn(() => Promise.resolve("granted")),
    startNewEvidenceDomain: jest.fn(() =>
      Promise.resolve({ requiresManualDuplicateReview: true as const })
    ),
    getEvidenceDomainStatus: jest.fn(() => Promise.resolve("stable")),
    getSnapshot: jest.fn(() => ({
      authorization: draft.authorization,
      messageCount: 1,
      selectedIds: [],
      drafts: [],
    })),
    clearRawState: jest.fn(),
    close: jest.fn(),
  };
}

function createPermissionFacade(
  status: QaSmsPermissionFacade["status"],
  isLoading = false
): QaSmsPermissionFacade {
  return {
    status,
    isLoading,
    requestPermission: jest.fn(() => Promise.resolve("granted")),
    openSettings: jest.fn(() => Promise.resolve()),
    recheckPermission: jest.fn(() => Promise.resolve()),
  };
}

describe("useQaSmsPatternIntake", () => {
  it("does not authorize while the initial permission state is loading", async () => {
    const service = createService();
    const permission = createPermissionFacade("undetermined", true);
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );

    act(() => result.current.setAcknowledged(true));

    expect(result.current.canAuthorize).toBe(false);
    await act(async () => result.current.authorize());
    expect(service.authorize).not.toHaveBeenCalled();
    expect(result.current.step).toBe("authorization");
  });

  it("enters selection immediately so inbox Skeleton rows render while loading", async () => {
    const service = createService();
    let resolveMessages: (messages: readonly QaInboxMessage[]) => void = () =>
      undefined;
    jest.mocked(service.listQnbMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMessages = resolve;
        })
    );
    const permission = createPermissionFacade("granted");
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );

    act(() => result.current.setAcknowledged(true));
    act(() => {
      void result.current.authorize();
    });
    await waitFor(() => expect(result.current.step).toBe("selection"));
    expect(result.current.isLoading).toBe(true);

    act(() => resolveMessages([inboxMessage]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("moves through authorization, permission recovery, selection, and review", async () => {
    const service = createService();
    const permission = createPermissionFacade("denied");
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );

    expect(result.current.step).toBe("authorization");
    expect(result.current.canAuthorize).toBe(false);
    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    expect(result.current.step).toBe("permission_recovery");

    await act(async () => result.current.requestPermission());
    await waitFor(() => expect(result.current.step).toBe("selection"));
    expect(result.current.messages).toHaveLength(1);

    act(() => result.current.toggleMessage("local-1"));
    expect(result.current.selectedIds).toEqual(["local-1"]);
    await act(async () => result.current.sanitizeSelected());
    expect(result.current.step).toBe("sanitized_review");
    expect(result.current.currentDraft?.draftId).toBe("draft-1");
  });

  it("retries an empty verified-provider result without reauthorizing", async () => {
    const service = createService();
    jest
      .mocked(service.listQnbMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([inboxMessage]);
    const permission = createPermissionFacade("granted");
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    expect(result.current.messages).toEqual([]);

    await act(async () => result.current.retryMessages());

    expect(service.authorize).toHaveBeenCalledTimes(1);
    expect(service.listQnbMessages).toHaveBeenCalledTimes(2);
    expect(result.current.messages).toEqual([inboxMessage]);
  });

  it("clears raw hook state when an inbox reload fails after permission revocation", async () => {
    const service = createService();
    jest
      .mocked(service.listQnbMessages)
      .mockResolvedValueOnce([inboxMessage])
      .mockRejectedValueOnce(new Error("sms_permission_denied"));
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.selectedIds).toEqual(["local-1"]);

    await act(async () => result.current.retryMessages());

    expect(result.current.step).toBe("permission_recovery");
    expect(result.current.messages).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.drafts).toEqual([]);
  });

  it("clears raw hook state when permission is revoked during sanitization", async () => {
    const service = createService();
    jest
      .mocked(service.sanitizeSelectedMessages)
      .mockRejectedValueOnce(new Error("sms_permission_denied"));
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));

    await act(async () => result.current.sanitizeSelected());

    expect(result.current.step).toBe("permission_recovery");
    expect(result.current.messages).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.drafts).toEqual([]);
  });

  it("clears raw hook state when sanitization fails unexpectedly", async () => {
    const service = createService();
    jest
      .mocked(service.sanitizeSelectedMessages)
      .mockRejectedValueOnce(new Error("evidence_digest_failed"));
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));

    await act(async () => result.current.sanitizeSelected());

    expect(result.current.step).toBe("selection");
    expect(result.current.errorCode).toBe("evidence_digest_failed");
    expect(result.current.messages).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.drafts).toEqual([]);
  });

  it("fills remaining selection capacity from newest visible messages", async () => {
    const service = createService();
    const messages = Array.from({ length: 55 }, (_, index) => ({
      ...inboxMessage,
      localSelectionId: `local-${index}`,
      nativeMessageId: `native-${index}`,
    }));
    jest.mocked(service.listQnbMessages).mockResolvedValue(messages);
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-54"));
    act(() =>
      result.current.selectNewestMessages(
        messages.map(({ localSelectionId }) => localSelectionId)
      )
    );

    expect(result.current.selectedIds).toHaveLength(50);
    expect(result.current.selectedIds).toContain("local-54");
    expect(service.selectMessages).toHaveBeenLastCalledWith(
      expect.arrayContaining(["local-54", "local-0"])
    );
  });

  it("discards a blocked candidate and returns to selection when none remain", async () => {
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() => result.current.discardCurrentDraft());

    expect(service.discardDraft).toHaveBeenCalledWith("draft-1");
    expect(result.current.step).toBe("selection");
    expect(result.current.drafts).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
  });

  it("moves to the nearest unresolved candidate after discarding the last one", async () => {
    const service = createService();
    const messages = Array.from({ length: 12 }, (_, index) => ({
      ...inboxMessage,
      localSelectionId: `local-${index + 1}`,
      nativeMessageId: `native-${index + 1}`,
    }));
    const drafts = Array.from({ length: 12 }, (_, index) => ({
      ...draft,
      draftId: `draft-${index + 1}`,
      status:
        index === 5 || index === 11
          ? ("draft" as const)
          : ("approved" as const),
    }));
    jest.mocked(service.listQnbMessages).mockResolvedValue(messages);
    jest.mocked(service.sanitizeSelectedMessages).mockResolvedValue(drafts);
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() =>
      result.current.selectNewestMessages(
        messages.map(({ localSelectionId }) => localSelectionId)
      )
    );
    await act(async () => result.current.sanitizeSelected());
    for (let index = 0; index < 11; index += 1) {
      act(() => result.current.showNextDraft());
    }
    expect(result.current.currentDraft?.draftId).toBe("draft-12");

    act(() => result.current.discardCurrentDraft());

    expect(result.current.step).toBe("sanitized_review");
    expect(result.current.currentDraft?.draftId).toBe("draft-6");
  });

  it("handles previous-step navigation inside the wizard before exiting", async () => {
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    expect(result.current.navigateBack()).toBe(false);
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() => expect(result.current.navigateBack()).toBe(true));
    expect(result.current.step).toBe("selection");
  });

  it("clears sensitive state and closes the service on unmount", async () => {
    const service = createService();
    const permission = createPermissionFacade("granted");
    const { result, unmount } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );
    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    unmount();
    expect(service.close).toHaveBeenCalled();
  });

  it("clears raw state and requires recovery when the evidence secret is unavailable", async () => {
    const service = createService();
    const evidenceError = Object.assign(
      new Error("evidence_secret_unavailable"),
      { code: "evidence_secret_unavailable" }
    );
    jest
      .spyOn(service, "sanitizeSelectedMessages")
      .mockRejectedValue(evidenceError);
    const permission = createPermissionFacade("granted");
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({ service, permission })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());

    expect(result.current.step).toBe("evidence_recovery");
    expect(result.current.messages).toEqual([]);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.drafts).toEqual([]);
    expect(service.close).toHaveBeenCalled();
  });

  it("builds coverage after approval and blocks export until pending scopes resolve", async () => {
    const service = createService();
    const exportBundle = jest.fn<
      ReturnType<QaSmsPatternExportService["exportBundle"]>,
      Parameters<QaSmsPatternExportService["exportBundle"]>
    >(() =>
      Promise.resolve({
        status: "exported" as const,
        candidateCount: 1,
      })
    );
    const exportService: QaSmsPatternExportService = { exportBundle };
    const permission = createPermissionFacade("granted");
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        exportService,
        now: () => new Date("2026-07-13T02:00:00.000Z"),
        createId: () => "123e4567-e89b-42d3-a456-426614174000",
        createContentDigest: () => Promise.resolve("c".repeat(64)),
        permission,
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() =>
      result.current.classifyCurrentDraft({
        messageFamily: "card_purchase",
        currency: "EGP",
      })
    );
    act(() => result.current.approveCurrentDraft());

    expect(result.current.step).toBe("coverage_review");
    expect(service.buildCandidateArtifact).toHaveBeenCalledTimes(1);
    expect(service.clearRawState).toHaveBeenCalledTimes(1);
    expect(result.current.coverageDeclarations).toHaveLength(16);
    expect(result.current.pendingCoverageCount).toBe(15);
    act(() => result.current.goToExport());
    expect(result.current.step).toBe("coverage_review");
    expect(result.current.errorCode).toBe("coverage_pending");

    act(() => result.current.markPendingCoverageUnavailable());
    expect(result.current.pendingCoverageCount).toBe(0);
    act(() => result.current.goToExport());
    expect(result.current.step).toBe("local_export");
    await act(async () => result.current.exportBundle());
    expect(result.current.errorCode).toBeNull();
    expect(exportBundle).toHaveBeenCalledTimes(1);
    const exported = exportBundle.mock.calls[0]?.[0];
    expect(exported?.evidenceDomainStatus).toBe("stable");
    expect(exported?.candidates).toHaveLength(1);
    expect(exported?.coverageDeclarations).toHaveLength(16);

    const evidenceError = Object.assign(
      new Error("evidence_secret_unavailable"),
      { code: "evidence_secret_unavailable" }
    );
    jest
      .mocked(service.getEvidenceDomainStatus)
      .mockRejectedValueOnce(evidenceError);
    await act(async () => result.current.exportBundle());
    expect(result.current.step).toBe("evidence_recovery");
    expect(result.current.candidateArtifacts).toEqual([]);
    expect(result.current.coverageDeclarations).toEqual([]);
    expect(service.close).toHaveBeenCalled();
  });

  it("returns to selection after backing out of post-approval review", async () => {
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() =>
      result.current.classifyCurrentDraft({
        messageFamily: "card_purchase",
        currency: "EGP",
      })
    );
    act(() => result.current.approveCurrentDraft());

    expect(result.current.step).toBe("coverage_review");
    act(() => expect(result.current.navigateBack()).toBe(true));
    expect(result.current.step).toBe("sanitized_review");
    let didReturnToSelection = false;
    await act(async () => {
      didReturnToSelection = result.current.navigateBack();
      await Promise.resolve();
    });
    expect(didReturnToSelection).toBe(true);
    await waitFor(() => expect(result.current.step).toBe("selection"));
    expect(service.listQnbMessages).toHaveBeenCalledTimes(2);
  });

  it("invalidates stale artifacts when an approved draft is reclassified", async () => {
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() =>
      result.current.classifyCurrentDraft({
        messageFamily: "card_purchase",
        currency: "EGP",
      })
    );
    act(() => result.current.approveCurrentDraft());
    expect(result.current.step).toBe("coverage_review");
    expect(result.current.candidateArtifacts).toHaveLength(1);

    act(() => expect(result.current.navigateBack()).toBe(true));
    act(() =>
      result.current.classifyCurrentDraft({
        messageFamily: "atm_withdrawal",
        currency: "EGP",
      })
    );

    expect(result.current.candidateArtifacts).toEqual([]);
    expect(result.current.coverageDeclarations).toEqual([]);
    let didReturnToSelection = false;
    await act(async () => {
      didReturnToSelection = result.current.navigateBack();
      await Promise.resolve();
    });
    expect(didReturnToSelection).toBe(true);
    expect(result.current.step).toBe("selection");
    expect(result.current.errorCode).toBeNull();
  });

  it("surfaces overlapping placeholder correction failures without throwing", async () => {
    const service = createService();
    jest.mocked(service.applyPlaceholderCorrections).mockImplementation(() => {
      throw Object.assign(new Error("invalid_placeholder_boundary"), {
        code: "invalid_placeholder_boundary",
      });
    });
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());

    expect(() =>
      act(() =>
        result.current.applyCurrentDraftCorrections([
          {
            startOffset: 0,
            endOffset: 3,
            token: "MERCHANT",
            semanticRole: "merchant_name",
          },
        ])
      )
    ).not.toThrow();
    expect(result.current.errorCode).toBe("invalid_placeholder_boundary");
    expect(result.current.drafts).toEqual([draft]);
  });

  it("previews a correction batch without mutating the current draft", async () => {
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        permission: createPermissionFacade("granted"),
      })
    );
    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    const corrections = [
      {
        startOffset: 0,
        endOffset: 3,
        token: "MERCHANT" as const,
        semanticRole: "merchant_name" as const,
      },
    ];

    let preview: QaSanitizedCandidateDraft | null = null;
    act(() => {
      preview = result.current.previewCurrentDraftCorrections(corrections);
    });

    expect(preview).toMatchObject({ draftId: draft.draftId });
    expect(service.previewPlaceholderCorrections).toHaveBeenCalledWith(draft, {
      rawBody: inboxMessage.body,
      corrections,
    });
    expect(result.current.drafts).toEqual([draft]);
  });

  it("preserves sanitized export state while the Android folder picker is active", async () => {
    let appStateListener: (state: AppStateStatus) => void = () => undefined;
    const addEventListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    let resolveExport: (
      result: Awaited<ReturnType<QaSmsPatternExportService["exportBundle"]>>
    ) => void = () => undefined;
    const exportService: QaSmsPatternExportService = {
      exportBundle: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveExport = resolve;
          })
      ),
    };
    const service = createService();
    const { result } = renderHook(() =>
      useQaSmsPatternIntake({
        service,
        exportService,
        now: () => new Date("2026-07-13T02:00:00.000Z"),
        createId: () => "123e4567-e89b-42d3-a456-426614174000",
        createContentDigest: () => Promise.resolve("c".repeat(64)),
        permission: createPermissionFacade("granted"),
      })
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    act(() => result.current.toggleMessage("local-1"));
    await act(async () => result.current.sanitizeSelected());
    act(() =>
      result.current.classifyCurrentDraft({
        messageFamily: "card_purchase",
        currency: "EGP",
      })
    );
    act(() => result.current.approveCurrentDraft());
    act(() => result.current.markPendingCoverageUnavailable());
    act(() => result.current.goToExport());
    act(() => {
      void result.current.exportBundle();
    });
    await waitFor(() => expect(exportService.exportBundle).toHaveBeenCalled());

    act(() => appStateListener("background"));
    expect(result.current.step).toBe("local_export");
    expect(result.current.candidateArtifacts).toHaveLength(1);

    act(() => resolveExport({ status: "exported", candidateCount: 1 }));
    await waitFor(() =>
      expect(result.current.exportResult?.status).toBe("exported")
    );

    act(() => appStateListener("background"));
    expect(result.current.step).toBe("authorization");
    expect(result.current.candidateArtifacts).toEqual([]);
    addEventListenerSpy.mockRestore();
  });

  it("preserves settings recovery while Android backgrounds and resumes", async () => {
    let appStateListener: (state: AppStateStatus) => void = () => undefined;
    const addEventListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const service = createService();
    const denied = createPermissionFacade("blocked");
    const granted = createPermissionFacade("granted");
    const { result, rerender } = renderHook(
      ({ permission }: { readonly permission: QaSmsPermissionFacade }) =>
        useQaSmsPatternIntake({ service, permission }),
      { initialProps: { permission: denied } }
    );

    act(() => result.current.setAcknowledged(true));
    await act(async () => result.current.authorize());
    expect(result.current.step).toBe("permission_recovery");

    await act(async () => result.current.openSettings());
    act(() => appStateListener("background"));
    expect(result.current.step).toBe("permission_recovery");
    expect(service.close).not.toHaveBeenCalled();

    rerender({ permission: granted });
    await waitFor(() =>
      expect(result.current.messages).toEqual([inboxMessage])
    );
    expect(result.current.step).toBe("selection");
    addEventListenerSpy.mockRestore();
  });
});
