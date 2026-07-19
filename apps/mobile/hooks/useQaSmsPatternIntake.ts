import {
  buildQaCandidateBundle,
  buildQaCoverageDeclarations,
  markPendingQaCoverageUnavailable,
  QA_SMS_MESSAGE_FAMILIES,
  updateQaCoverageDeclaration,
  type QaCandidateArtifact,
  type QaContentDigest,
  type QaCoverageDeclaration,
  type QaCoverageStatus,
  type QaInboxMessage,
  type QaRawRangeSelection,
  type QaSanitizedCandidateDraft,
  type QaSmsCurrency,
  type QaSmsMessageFamily,
} from "@monyvi/logic";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { isQaSmsPatternIntakeFixtureMode } from "@/config/qa-sms-pattern-intake-config";
import {
  qaSmsPatternIntakeService,
  type QaSmsPatternIntakeService,
  type SmsPermissionStatus,
} from "@/services/dev/qa-sms-pattern-intake-service";
import {
  qaSmsPatternExportService,
  type ExportResult,
  type QaSmsPatternExportService,
} from "@/services/dev/qa-sms-pattern-export-service";

type QaSmsIntakeStep =
  | "authorization"
  | "permission_recovery"
  | "evidence_recovery"
  | "selection"
  | "sanitized_review"
  | "coverage_review"
  | "local_export";

interface QaSmsPermissionFacade {
  readonly status: SmsPermissionStatus;
  readonly isLoading: boolean;
  readonly requestPermission: () => Promise<SmsPermissionStatus>;
  readonly openSettings: () => Promise<void>;
  readonly recheckPermission: () => Promise<void>;
}

interface UseQaSmsPatternIntakeOptions {
  readonly service?: QaSmsPatternIntakeService;
  readonly exportService?: QaSmsPatternExportService;
  readonly permission?: QaSmsPermissionFacade;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly createContentDigest?: QaContentDigest;
}

interface QaSmsDraftClassificationInput {
  readonly messageFamily: QaSmsMessageFamily;
  readonly currency: QaSmsCurrency;
}

interface UseQaSmsPatternIntakeResult {
  readonly step: QaSmsIntakeStep;
  readonly isAcknowledged: boolean;
  readonly canAuthorize: boolean;
  readonly isLoading: boolean;
  readonly permissionStatus: SmsPermissionStatus;
  readonly errorCode: string | null;
  readonly messages: readonly QaInboxMessage[];
  readonly selectedIds: readonly string[];
  readonly drafts: readonly QaSanitizedCandidateDraft[];
  readonly candidateArtifacts: readonly QaCandidateArtifact[];
  readonly coverageDeclarations: readonly QaCoverageDeclaration[];
  readonly pendingCoverageCount: number;
  readonly exportResult: ExportResult | null;
  readonly currentDraft: QaSanitizedCandidateDraft | null;
  readonly currentRawPreview: string | null;
  readonly currentDraftIndex: number;
  readonly setAcknowledged: (value: boolean) => void;
  readonly authorize: () => Promise<void>;
  readonly requestPermission: () => Promise<SmsPermissionStatus>;
  readonly retryMessages: () => Promise<void>;
  readonly openSettings: () => Promise<void>;
  readonly toggleMessage: (localSelectionId: string) => void;
  readonly selectNewestMessages: (localSelectionIds: readonly string[]) => void;
  readonly sanitizeSelected: () => Promise<void>;
  readonly classifyCurrentDraft: (input: QaSmsDraftClassificationInput) => void;
  readonly previewCurrentDraftCorrections: (
    corrections: readonly QaRawRangeSelection[]
  ) => QaSanitizedCandidateDraft;
  readonly applyCurrentDraftCorrections: (
    corrections: readonly QaRawRangeSelection[]
  ) => void;
  readonly approveCurrentDraft: () => void;
  readonly discardCurrentDraft: () => void;
  readonly showPreviousDraft: () => void;
  readonly showNextDraft: () => void;
  readonly goToCoverage: () => void;
  readonly updateCoverage: (
    messageFamily: QaSmsMessageFamily,
    currency: QaSmsCurrency,
    status: QaCoverageStatus
  ) => void;
  readonly markPendingCoverageUnavailable: () => void;
  readonly goToExport: () => void;
  readonly exportBundle: () => Promise<void>;
  readonly recoverEvidenceSecret: () => Promise<void>;
  readonly backToReview: () => void;
  readonly navigateBack: () => boolean;
  readonly reset: () => void;
}

const FIXTURE_PERMISSION: QaSmsPermissionFacade = {
  status: "granted",
  isLoading: false,
  requestPermission: (): Promise<SmsPermissionStatus> =>
    Promise.resolve("granted"),
  openSettings: (): Promise<void> => Promise.resolve(),
  recheckPermission: (): Promise<void> => Promise.resolve(),
};

const defaultNow = (): Date => new Date();
const QA_SELECTION_LIMIT = 50;
const defaultCreateId = (): string => Crypto.randomUUID();
const createBundleContentDigest = (value: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

function getErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return error instanceof Error ? error.message : "qa_sms_intake_failed";
}

function findNearestUnresolvedDraftIndex(
  drafts: readonly QaSanitizedCandidateDraft[],
  preferredIndex: number
): number {
  const nextIndex = drafts.findIndex(
    (draft, index) => index >= preferredIndex && draft.status !== "approved"
  );
  if (nextIndex >= 0) return nextIndex;

  for (
    let index = Math.min(preferredIndex - 1, drafts.length - 1);
    index >= 0;
    index -= 1
  ) {
    if (drafts[index]?.status !== "approved") return index;
  }
  return 0;
}

export function useQaSmsPatternIntake(
  options: UseQaSmsPatternIntakeOptions = {}
): UseQaSmsPatternIntakeResult {
  const defaultPermission = useSmsPermission();
  const service = options.service ?? qaSmsPatternIntakeService;
  const exportService = options.exportService ?? qaSmsPatternExportService;
  const now = options.now ?? defaultNow;
  const createId = options.createId ?? defaultCreateId;
  const createContentDigest =
    options.createContentDigest ?? createBundleContentDigest;
  const permission =
    options.permission ??
    (isQaSmsPatternIntakeFixtureMode()
      ? FIXTURE_PERMISSION
      : defaultPermission);
  const [step, setStep] = useState<QaSmsIntakeStep>("authorization");
  const [isAcknowledged, setAcknowledged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly QaInboxMessage[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [drafts, setDrafts] = useState<readonly QaSanitizedCandidateDraft[]>(
    []
  );
  const [draftSourceIds, setDraftSourceIds] = useState<readonly string[]>([]);
  const [candidateArtifacts, setCandidateArtifacts] = useState<
    readonly QaCandidateArtifact[]
  >([]);
  const [coverageDeclarations, setCoverageDeclarations] = useState<
    readonly QaCoverageDeclaration[]
  >([]);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [currentDraftIndex, setCurrentDraftIndex] = useState(0);
  const generationRef = useRef(0);
  const isExportPickerActiveRef = useRef(false);
  const isPermissionSettingsActiveRef = useRef(false);

  const clearRawReviewState = useCallback((): void => {
    setMessages([]);
    setSelectedIds([]);
    setDrafts([]);
    setDraftSourceIds([]);
    setCurrentDraftIndex(0);
  }, []);

  const enterEvidenceRecovery = useCallback((): void => {
    service.close();
    setMessages([]);
    setSelectedIds([]);
    setDrafts([]);
    setDraftSourceIds([]);
    setCandidateArtifacts([]);
    setCoverageDeclarations([]);
    setStep("evidence_recovery");
  }, [service]);

  const loadMessages = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current;
    setStep("selection");
    setIsLoading(true);
    setErrorCode(null);
    try {
      const loaded = await service.listQnbMessages();
      if (generation !== generationRef.current) return;
      setMessages(loaded);
      setStep("selection");
    } catch (error: unknown) {
      if (generation !== generationRef.current) return;
      clearRawReviewState();
      setErrorCode(getErrorCode(error));
      setStep("permission_recovery");
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [clearRawReviewState, service]);

  const authorize = useCallback(async (): Promise<void> => {
    if (!isAcknowledged || permission.isLoading) return;
    setErrorCode(null);
    try {
      service.authorize({
        acknowledged: true,
        currencyScope: ["EGP", "USD"],
        messageFamilyScope: QA_SMS_MESSAGE_FAMILIES,
      });
      if (permission.status !== "granted") {
        setStep("permission_recovery");
        return;
      }
      await loadMessages();
    } catch (error: unknown) {
      setErrorCode(getErrorCode(error));
    }
  }, [
    isAcknowledged,
    loadMessages,
    permission.isLoading,
    permission.status,
    service,
  ]);

  const requestPermission =
    useCallback(async (): Promise<SmsPermissionStatus> => {
      const status = await permission.requestPermission();
      if (status === "granted") {
        await loadMessages();
        return status;
      }
      setStep("permission_recovery");
      setErrorCode(`sms_permission_${status}`);
      return status;
    }, [loadMessages, permission]);

  const openPermissionSettings = useCallback(async (): Promise<void> => {
    isPermissionSettingsActiveRef.current = true;
    await permission.openSettings();
  }, [permission]);

  const toggleMessage = useCallback(
    (localSelectionId: string): void => {
      setSelectedIds((current) => {
        const next = current.includes(localSelectionId)
          ? current.filter((id) => id !== localSelectionId)
          : [...current, localSelectionId];
        if (next.length > QA_SELECTION_LIMIT) {
          setErrorCode("selection_limit_exceeded");
          return current;
        }
        service.selectMessages(next);
        return next;
      });
    },
    [service]
  );

  const selectNewestMessages = useCallback(
    (localSelectionIds: readonly string[]): void => {
      const knownIds = new Set(
        messages.map(({ localSelectionId }) => localSelectionId)
      );
      setSelectedIds((current) => {
        const currentSet = new Set(current);
        const remainingCapacity = QA_SELECTION_LIMIT - current.length;
        const additions = [...new Set(localSelectionIds)]
          .filter((id) => knownIds.has(id) && !currentSet.has(id))
          .slice(0, Math.max(0, remainingCapacity));
        const next = [...current, ...additions];
        service.selectMessages(next);
        return next;
      });
    },
    [messages, service]
  );

  const sanitizeSelected = useCallback(async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    const generation = ++generationRef.current;
    setIsLoading(true);
    setErrorCode(null);
    try {
      service.selectMessages(selectedIds);
      const nextDrafts = await service.sanitizeSelectedMessages();
      if (generation !== generationRef.current) return;
      const selected = new Set(selectedIds);
      setDraftSourceIds(
        messages
          .filter(({ localSelectionId }) => selected.has(localSelectionId))
          .map(({ localSelectionId }) => localSelectionId)
      );
      setDrafts(nextDrafts);
      setCurrentDraftIndex(0);
      setStep("sanitized_review");
    } catch (error: unknown) {
      if (generation === generationRef.current) {
        const code = getErrorCode(error);
        clearRawReviewState();
        setErrorCode(code);
        if (code.startsWith("sms_permission_")) {
          setStep("permission_recovery");
        } else if (code === "evidence_secret_unavailable") {
          enterEvidenceRecovery();
        } else {
          setStep("selection");
        }
      }
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [
    clearRawReviewState,
    enterEvidenceRecovery,
    messages,
    selectedIds,
    service,
  ]);

  const completeCandidateReview = useCallback(
    (resolvedDrafts: readonly QaSanitizedCandidateDraft[]): void => {
      const artifacts = resolvedDrafts.map((draft) =>
        service.buildCandidateArtifact(draft)
      );
      const recordedAt = now().toISOString();
      setCandidateArtifacts(artifacts);
      setCoverageDeclarations(
        buildQaCoverageDeclarations(artifacts, recordedAt)
      );
      service.clearRawState();
      setMessages([]);
      setSelectedIds([]);
      setDraftSourceIds([]);
      setStep("coverage_review");
    },
    [now, service]
  );

  const classifyCurrentDraft = useCallback(
    (input: QaSmsDraftClassificationInput): void => {
      setDrafts((current) =>
        current.map((draft, index) =>
          index === currentDraftIndex
            ? service.validateDraft(service.classifyDraft(draft, input))
            : draft
        )
      );
      setCandidateArtifacts([]);
      setCoverageDeclarations([]);
      setErrorCode(null);
    },
    [currentDraftIndex, service]
  );

  const getCurrentCorrectionContext = useCallback((): {
    readonly draft: QaSanitizedCandidateDraft;
    readonly rawBody: string;
  } => {
    const selected = new Set(selectedIds);
    const selectedMessages = messages.filter(({ localSelectionId }) =>
      selected.has(localSelectionId)
    );
    const rawBody = selectedMessages[currentDraftIndex]?.body;
    if (!rawBody) throw new Error("raw_preview_unavailable");
    const draft = drafts[currentDraftIndex];
    if (!draft) throw new Error("candidate_not_ready");
    return { draft, rawBody };
  }, [currentDraftIndex, drafts, messages, selectedIds]);

  const previewCurrentDraftCorrections = useCallback(
    (
      corrections: readonly QaRawRangeSelection[]
    ): QaSanitizedCandidateDraft => {
      const { draft, rawBody } = getCurrentCorrectionContext();
      return service.previewPlaceholderCorrections(draft, {
        rawBody,
        corrections,
      });
    },
    [getCurrentCorrectionContext, service]
  );

  const applyCurrentDraftCorrections = useCallback(
    (corrections: readonly QaRawRangeSelection[]): void => {
      try {
        const { draft, rawBody } = getCurrentCorrectionContext();
        const corrected = service.applyPlaceholderCorrections(draft, {
          rawBody,
          corrections,
        });
        const validated = service.validateDraft(corrected);
        setDrafts((current) =>
          current.map((currentDraft, index) =>
            index === currentDraftIndex ? validated : currentDraft
          )
        );
        setCandidateArtifacts([]);
        setCoverageDeclarations([]);
        setErrorCode(null);
      } catch (error: unknown) {
        setErrorCode(getErrorCode(error));
      }
    },
    [currentDraftIndex, getCurrentCorrectionContext, service]
  );

  const approveCurrentDraft = useCallback((): void => {
    const currentDraft = drafts[currentDraftIndex];
    if (!currentDraft || currentDraft.status === "approved") return;

    const validated = service.validateDraft(currentDraft);
    if (validated.status !== "validated") {
      setDrafts((current) =>
        current.map((draft, index) =>
          index === currentDraftIndex ? validated : draft
        )
      );
      setErrorCode("candidate_not_ready");
      return;
    }

    const approved = service.approveDraft(validated);
    const next = drafts.map((draft, index) =>
      index === currentDraftIndex ? approved : draft
    );
    setDrafts(next);
    setErrorCode(null);

    if (next.every(({ status }) => status === "approved")) {
      completeCandidateReview(next);
      return;
    }

    if (currentDraftIndex < next.length - 1) {
      setCurrentDraftIndex((index) => index + 1);
    }
  }, [completeCandidateReview, currentDraftIndex, drafts, service]);

  const discardCurrentDraft = useCallback((): void => {
    const currentDraft = drafts[currentDraftIndex];
    if (!currentDraft) return;

    service.discardDraft(currentDraft.draftId);
    const sourceId = draftSourceIds[currentDraftIndex];
    const nextDrafts = drafts.filter((_, index) => index !== currentDraftIndex);
    const nextSourceIds = draftSourceIds.filter(
      (_, index) => index !== currentDraftIndex
    );
    const nextSelectedIds = sourceId
      ? selectedIds.filter((id) => id !== sourceId)
      : selectedIds;
    service.selectMessages(nextSelectedIds);
    setDrafts(nextDrafts);
    setDraftSourceIds(nextSourceIds);
    setSelectedIds(nextSelectedIds);
    setErrorCode(null);

    if (nextDrafts.length === 0) {
      setCurrentDraftIndex(0);
      setStep("selection");
      return;
    }
    if (nextDrafts.every(({ status }) => status === "approved")) {
      completeCandidateReview(nextDrafts);
      return;
    }
    const nextIndex = findNearestUnresolvedDraftIndex(
      nextDrafts,
      currentDraftIndex
    );
    setCurrentDraftIndex(nextIndex);
  }, [
    completeCandidateReview,
    currentDraftIndex,
    draftSourceIds,
    drafts,
    selectedIds,
    service,
  ]);

  const updateCoverage = useCallback(
    (
      messageFamily: QaSmsMessageFamily,
      currency: QaSmsCurrency,
      status: QaCoverageStatus
    ): void => {
      setCoverageDeclarations((current) =>
        updateQaCoverageDeclaration(
          current,
          { messageFamily, currency },
          status,
          now().toISOString()
        )
      );
      setErrorCode(null);
    },
    [now]
  );

  const pendingCoverageCount = coverageDeclarations.filter(
    ({ status }) => status === "pending"
  ).length;

  const markPendingCoverageUnavailable = useCallback((): void => {
    setCoverageDeclarations((current) =>
      markPendingQaCoverageUnavailable(current, now().toISOString())
    );
    setErrorCode(null);
  }, [now]);

  const goToExport = useCallback((): void => {
    if (pendingCoverageCount > 0) {
      setErrorCode("coverage_pending");
      return;
    }
    setErrorCode(null);
    setStep("local_export");
  }, [pendingCoverageCount]);

  const exportBundle = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current;
    setIsLoading(true);
    setErrorCode(null);
    setExportResult(null);
    try {
      const timestamp = now().toISOString();
      const evidenceDomainStatus = await service.getEvidenceDomainStatus();
      const bundle = await buildQaCandidateBundle(
        candidateArtifacts,
        coverageDeclarations,
        { exportId: createId(), exportedAt: timestamp, evidenceDomainStatus },
        createContentDigest
      );
      if (generation !== generationRef.current) return;
      isExportPickerActiveRef.current = true;
      const result = await exportService.exportBundle(bundle);
      if (generation !== generationRef.current) return;
      setExportResult(result);
      if (result.status === "failed") setErrorCode(result.errorCode);
      if (result.status === "exported") {
        setDrafts((current) =>
          current.map((draft) =>
            draft.status === "approved"
              ? { ...draft, status: "exported" as const }
              : draft
          )
        );
      }
    } catch (error: unknown) {
      if (generation !== generationRef.current) return;
      const code = getErrorCode(error);
      setErrorCode(code);
      if (code === "evidence_secret_unavailable") {
        enterEvidenceRecovery();
      }
    } finally {
      isExportPickerActiveRef.current = false;
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [
    candidateArtifacts,
    coverageDeclarations,
    createId,
    createContentDigest,
    exportService,
    enterEvidenceRecovery,
    now,
    service,
  ]);

  const resetState = useCallback((): void => {
    setStep("authorization");
    setAcknowledged(false);
    setIsLoading(false);
    setErrorCode(null);
    setMessages([]);
    setSelectedIds([]);
    setDrafts([]);
    setDraftSourceIds([]);
    setCandidateArtifacts([]);
    setCoverageDeclarations([]);
    setExportResult(null);
    setCurrentDraftIndex(0);
  }, []);

  const recoverEvidenceSecret = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorCode(null);
    try {
      await service.startNewEvidenceDomain();
      resetState();
    } catch (error: unknown) {
      setErrorCode(getErrorCode(error));
    } finally {
      setIsLoading(false);
    }
  }, [resetState, service]);

  const reset = useCallback((): void => {
    generationRef.current += 1;
    service.close();
    resetState();
  }, [resetState, service]);

  useEffect(() => reset, [reset]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus): void => {
        if (
          nextState !== "active" &&
          !isExportPickerActiveRef.current &&
          step !== "permission_recovery"
        ) {
          reset();
        }
      }
    );
    return () => subscription.remove();
  }, [reset, step]);

  useEffect(() => {
    if (
      !isPermissionSettingsActiveRef.current ||
      step !== "permission_recovery" ||
      permission.status !== "granted"
    ) {
      return;
    }
    isPermissionSettingsActiveRef.current = false;
    void loadMessages();
  }, [loadMessages, permission.status, step]);

  const currentDraft = drafts[currentDraftIndex] ?? null;
  const currentSourceId = draftSourceIds[currentDraftIndex];
  const currentRawPreview =
    step === "sanitized_review"
      ? (messages.find(
          ({ localSelectionId }) => localSelectionId === currentSourceId
        )?.body ?? null)
      : null;

  const navigateBack = useCallback((): boolean => {
    if (step === "sanitized_review") {
      if (messages.length === 0) {
        void loadMessages();
        return true;
      }
      setErrorCode(null);
      setDrafts([]);
      setDraftSourceIds([]);
      setCurrentDraftIndex(0);
      setStep("selection");
      return true;
    }
    if (step === "coverage_review") {
      setErrorCode(null);
      setCurrentDraftIndex(Math.max(0, drafts.length - 1));
      setStep("sanitized_review");
      return true;
    }
    if (step === "local_export") {
      setErrorCode(null);
      setStep("coverage_review");
      return true;
    }
    return false;
  }, [drafts.length, loadMessages, messages.length, step]);

  return useMemo(
    () => ({
      step,
      isAcknowledged,
      canAuthorize: isAcknowledged && !isLoading && !permission.isLoading,
      isLoading: isLoading || permission.isLoading,
      permissionStatus: permission.status,
      errorCode,
      messages,
      selectedIds,
      drafts,
      candidateArtifacts,
      coverageDeclarations,
      pendingCoverageCount,
      exportResult,
      currentDraft,
      currentRawPreview,
      currentDraftIndex,
      setAcknowledged,
      authorize,
      requestPermission,
      retryMessages: loadMessages,
      openSettings: openPermissionSettings,
      toggleMessage,
      selectNewestMessages,
      sanitizeSelected,
      classifyCurrentDraft,
      previewCurrentDraftCorrections,
      applyCurrentDraftCorrections,
      approveCurrentDraft,
      discardCurrentDraft,
      showPreviousDraft: () =>
        setCurrentDraftIndex((index) => Math.max(0, index - 1)),
      showNextDraft: () =>
        setCurrentDraftIndex((index) =>
          Math.min(Math.max(0, drafts.length - 1), index + 1)
        ),
      goToCoverage: () => {
        if (candidateArtifacts.length === 0) {
          setErrorCode("candidate_not_ready");
          return;
        }
        setMessages([]);
        setSelectedIds([]);
        setStep("coverage_review");
      },
      updateCoverage,
      markPendingCoverageUnavailable,
      goToExport,
      exportBundle,
      recoverEvidenceSecret,
      backToReview: () => setStep("coverage_review"),
      navigateBack,
      reset,
    }),
    [
      approveCurrentDraft,
      applyCurrentDraftCorrections,
      authorize,
      candidateArtifacts,
      classifyCurrentDraft,
      currentDraft,
      currentDraftIndex,
      currentRawPreview,
      coverageDeclarations,
      drafts,
      discardCurrentDraft,
      errorCode,
      exportBundle,
      exportResult,
      goToExport,
      isAcknowledged,
      isLoading,
      loadMessages,
      messages,
      navigateBack,
      openPermissionSettings,
      pendingCoverageCount,
      permission.isLoading,
      permission.status,
      previewCurrentDraftCorrections,
      requestPermission,
      recoverEvidenceSecret,
      reset,
      sanitizeSelected,
      selectNewestMessages,
      selectedIds,
      step,
      toggleMessage,
      updateCoverage,
      markPendingCoverageUnavailable,
    ]
  );
}

export type {
  QaSmsIntakeStep,
  QaSmsPermissionFacade,
  UseQaSmsPatternIntakeOptions,
  UseQaSmsPatternIntakeResult,
};
