import {
  applyQaRawRangeCorrections,
  approveQaSmsDraft,
  buildQaSmsEvidenceIdentity,
  buildQaCandidateArtifact,
  classifyQaSmsDraft,
  computeSmsFingerprint,
  sanitizeQaSmsCandidate,
  validateQaSmsDraft,
  type QaCandidateArtifact,
  type QaInboxMessage,
  type QaIntakeAuthorization,
  type QaRawRangeSelection,
  type QaSanitizedCandidateDraft,
  type QaSmsDraftClassification,
  type SmsMessage,
} from "@monyvi/logic";
import * as Crypto from "expo-crypto";
import { PermissionsAndroid, Platform } from "react-native";
import {
  getQaSmsPatternIntakeAvailability,
  isQaSmsPatternIntakeFixtureMode,
} from "@/config/qa-sms-pattern-intake-config";
import { QA_SMS_PATTERN_INTAKE_PROVIDER } from "@/config/qa-sms-provider-config";
import { readSmsInbox } from "@/services/sms-reader-service";
import { qaSmsEvidenceService } from "./qa-sms-evidence-service";
import { QA_SMS_INTAKE_FIXTURES } from "./qa-sms-intake-fixtures";

const QA_INBOX_LIMIT = 3000;
const QA_SELECTION_LIMIT = 50;

type SmsPermissionStatus = "granted" | "denied" | "blocked" | "undetermined";

interface IntakeDependencies {
  readonly getAvailability: typeof getQaSmsPatternIntakeAvailability;
  readonly getPermissionStatus: () => Promise<SmsPermissionStatus>;
  readonly readInbox: (options: {
    readonly address: string;
    readonly maxCount: number;
  }) => Promise<readonly SmsMessage[]>;
  readonly computeFingerprint: typeof computeSmsFingerprint;
  readonly buildEvidenceIdentity: typeof buildQaSmsEvidenceIdentity;
  readonly createEvidenceDigest: (fingerprint: string) => Promise<string>;
  readonly startNewEvidenceDomain: (
    acknowledged: boolean
  ) => Promise<{ readonly requiresManualDuplicateReview: true }>;
  readonly getEvidenceDomainStatus: () => Promise<
    "stable" | "reset_requires_manual_duplicate_review"
  >;
  readonly createId: () => string;
  readonly now: () => Date;
}

interface AuthorizeInput {
  readonly acknowledged: boolean;
  readonly currencyScope: ReadonlyArray<"EGP" | "USD">;
  readonly messageFamilyScope: QaIntakeAuthorization["messageFamilyScope"];
}

interface IntakeError extends Error {
  readonly code: string;
}

interface QaSmsPatternIntakeSnapshot {
  readonly authorization: QaIntakeAuthorization | null;
  readonly messageCount: number;
  readonly selectedIds: readonly string[];
  readonly drafts: readonly QaSanitizedCandidateDraft[];
}

interface QaPlaceholderCorrectionBatch {
  readonly rawBody: string;
  readonly corrections: readonly QaRawRangeSelection[];
}

interface QaSmsPatternIntakeService {
  readonly authorize: (input: AuthorizeInput) => QaIntakeAuthorization;
  readonly listQnbMessages: () => Promise<readonly QaInboxMessage[]>;
  readonly selectMessages: (ids: readonly string[]) => void;
  readonly getSelectedMessages: () => readonly QaInboxMessage[];
  readonly sanitizeSelectedMessages: () => Promise<
    readonly QaSanitizedCandidateDraft[]
  >;
  readonly classifyDraft: (
    draft: QaSanitizedCandidateDraft,
    classification: QaSmsDraftClassification
  ) => QaSanitizedCandidateDraft;
  readonly previewPlaceholderCorrections: (
    draft: QaSanitizedCandidateDraft,
    batch: QaPlaceholderCorrectionBatch
  ) => QaSanitizedCandidateDraft;
  readonly applyPlaceholderCorrections: (
    draft: QaSanitizedCandidateDraft,
    batch: QaPlaceholderCorrectionBatch
  ) => QaSanitizedCandidateDraft;
  readonly validateDraft: (
    draft: QaSanitizedCandidateDraft
  ) => QaSanitizedCandidateDraft;
  readonly approveDraft: (
    draft: QaSanitizedCandidateDraft
  ) => QaSanitizedCandidateDraft;
  readonly discardDraft: (draftId: string) => void;
  readonly buildCandidateArtifact: (
    draft: QaSanitizedCandidateDraft
  ) => QaCandidateArtifact;
  readonly handlePermissionChange: () => Promise<"granted" | "revoked">;
  readonly startNewEvidenceDomain: () => Promise<{
    readonly requiresManualDuplicateReview: true;
  }>;
  readonly getEvidenceDomainStatus: () => Promise<
    "stable" | "reset_requires_manual_duplicate_review"
  >;
  readonly getSnapshot: () => QaSmsPatternIntakeSnapshot;
  readonly clearRawState: () => void;
  readonly close: () => void;
}

function intakeError(code: string): IntakeError {
  return Object.assign(new Error(code), { code });
}

function normalizeVerifiedProviderAlias(sender: string): string | null {
  const normalized = sender.trim().toUpperCase();
  return QA_SMS_PATTERN_INTAKE_PROVIDER.senderAliases.includes(normalized)
    ? normalized
    : null;
}

function mergeVerifiedProviderMessages(
  messageGroups: ReadonlyArray<readonly SmsMessage[]>
): readonly SmsMessage[] {
  const verifiedMessages = messageGroups
    .flat()
    .filter(
      (message) => normalizeVerifiedProviderAlias(message.address) !== null
    )
    .sort(
      (left, right) => right.date - left.date || left.id.localeCompare(right.id)
    );
  const uniqueMessages = verifiedMessages.reduce<readonly SmsMessage[]>(
    (messages, message) =>
      messages.some(({ id }) => id === message.id)
        ? messages
        : [...messages, message],
    []
  );
  return uniqueMessages.slice(0, QA_INBOX_LIMIT);
}

export function createQaSmsPatternIntakeService(
  dependencies: IntakeDependencies
): QaSmsPatternIntakeService {
  let authorization: QaIntakeAuthorization | null = null;
  let messages: readonly QaInboxMessage[] = [];
  let selectedIds: readonly string[] = [];
  let drafts: readonly QaSanitizedCandidateDraft[] = [];
  let correctionHistoryByDraftId: Readonly<
    Record<string, readonly QaRawRangeSelection[]>
  > = {};

  function clearSensitiveWorkflowState(): void {
    messages = [];
    selectedIds = [];
    drafts = [];
    correctionHistoryByDraftId = {};
  }

  function replaceDraft(
    nextDraft: QaSanitizedCandidateDraft
  ): QaSanitizedCandidateDraft {
    drafts = drafts.map((draft) =>
      draft.draftId === nextDraft.draftId ? nextDraft : draft
    );
    return nextDraft;
  }

  function preparePlaceholderCorrections(
    draft: QaSanitizedCandidateDraft,
    batch: QaPlaceholderCorrectionBatch
  ): {
    readonly corrected: QaSanitizedCandidateDraft;
    readonly history: readonly QaRawRangeSelection[];
  } {
    const previous = correctionHistoryByDraftId[draft.draftId] ?? [];
    const history = batch.corrections.reduce<readonly QaRawRangeSelection[]>(
      (current, correction) => [
        ...current.filter(
          (entry) =>
            entry.startOffset !== correction.startOffset ||
            entry.endOffset !== correction.endOffset
        ),
        correction,
      ],
      previous
    );
    return {
      corrected: applyQaRawRangeCorrections(draft, batch.rawBody, history),
      history,
    };
  }

  const service: QaSmsPatternIntakeService = {
    authorize(input: AuthorizeInput): QaIntakeAuthorization {
      const availability = dependencies.getAvailability();
      if (!availability.isAvailable) throw intakeError(availability.reason);
      if (!input.acknowledged) throw intakeError("authorization_required");
      authorization = {
        version: 1,
        authorizationClass: "qa_operator_explicit",
        authorizedAt: dependencies.now().toISOString(),
        providerScope: QA_SMS_PATTERN_INTAKE_PROVIDER.id,
        currencyScope: [...input.currencyScope],
        messageFamilyScope: [...input.messageFamilyScope],
      };
      clearSensitiveWorkflowState();
      return authorization;
    },

    async listQnbMessages(): Promise<readonly QaInboxMessage[]> {
      if (!authorization) throw intakeError("not_authorized");
      const activeAuthorization = authorization;
      try {
        const permission = await dependencies.getPermissionStatus();
        if (authorization !== activeAuthorization) {
          throw intakeError("not_authorized");
        }
        if (permission !== "granted") {
          throw intakeError(`sms_permission_${permission}`);
        }
        let bounded: readonly SmsMessage[] = [];
        for (const address of QA_SMS_PATTERN_INTAKE_PROVIDER.senderAliases) {
          const messageGroup = await dependencies.readInbox({
            address,
            maxCount: QA_INBOX_LIMIT,
          });
          if (authorization !== activeAuthorization) {
            throw intakeError("not_authorized");
          }
          bounded = mergeVerifiedProviderMessages([bounded, messageGroup]);
        }
        const nextMessages = await Promise.all(
          bounded.map(async (message, index): Promise<QaInboxMessage> => {
            const smsFingerprint = await dependencies.computeFingerprint({
              sender: message.address,
              body: message.body,
              receivedAtMs: message.date,
            });
            return {
              localSelectionId: `${dependencies.createId()}-${index}`,
              nativeMessageId: message.id,
              sender: message.address,
              body: message.body,
              receivedAtMs: message.date,
              smsFingerprint,
              isSelected: false,
            };
          })
        );
        if (authorization !== activeAuthorization) {
          throw intakeError("not_authorized");
        }
        messages = nextMessages;
        return messages;
      } catch (error: unknown) {
        if (authorization === activeAuthorization) {
          clearSensitiveWorkflowState();
        }
        throw error;
      }
    },

    selectMessages(ids: readonly string[]): void {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length > QA_SELECTION_LIMIT) {
        throw intakeError("selection_limit_exceeded");
      }
      const knownIds = new Set(
        messages.map(({ localSelectionId }) => localSelectionId)
      );
      if (uniqueIds.some((id) => !knownIds.has(id))) {
        throw intakeError("unknown_selection_id");
      }
      selectedIds = uniqueIds;
      const selected = new Set(uniqueIds);
      messages = messages.map((message) => ({
        ...message,
        isSelected: selected.has(message.localSelectionId),
      }));
    },

    getSelectedMessages(): readonly QaInboxMessage[] {
      const selected = new Set(selectedIds);
      return messages.filter(({ localSelectionId }) =>
        selected.has(localSelectionId)
      );
    },

    async sanitizeSelectedMessages(): Promise<
      readonly QaSanitizedCandidateDraft[]
    > {
      if (!authorization) throw intakeError("not_authorized");
      const activeAuthorization = authorization;
      let permission: SmsPermissionStatus;
      try {
        permission = await dependencies.getPermissionStatus();
      } catch (error: unknown) {
        clearSensitiveWorkflowState();
        throw error;
      }
      if (authorization !== activeAuthorization) {
        throw intakeError("not_authorized");
      }
      if (permission !== "granted") {
        clearSensitiveWorkflowState();
        throw intakeError(`sms_permission_${permission}`);
      }
      const selected = service.getSelectedMessages();
      if (selected.length === 0) throw intakeError("selection_required");
      try {
        const nextDrafts = await Promise.all(
          selected.map(async (message): Promise<QaSanitizedCandidateDraft> => {
            const evidenceDigest = await dependencies.createEvidenceDigest(
              dependencies.buildEvidenceIdentity({
                sender: message.sender,
                body: message.body,
              })
            );
            return sanitizeQaSmsCandidate({
              draftId: dependencies.createId(),
              body: message.body,
              providerId: QA_SMS_PATTERN_INTAKE_PROVIDER.id,
              verifiedSenderAlias: normalizeVerifiedProviderAlias(
                message.sender
              ),
              messageFamily: null,
              currency: null,
              expectedOutcome: null,
              evidenceDigest,
              authorization: activeAuthorization,
            });
          })
        );
        if (authorization !== activeAuthorization) {
          throw intakeError("not_authorized");
        }
        drafts = nextDrafts;
        return drafts;
      } catch (error: unknown) {
        if (authorization === activeAuthorization) {
          clearSensitiveWorkflowState();
        }
        throw error;
      }
    },

    classifyDraft(
      draft: QaSanitizedCandidateDraft,
      classification: QaSmsDraftClassification
    ): QaSanitizedCandidateDraft {
      if (!authorization || draft.authorization !== authorization) {
        throw intakeError("not_authorized");
      }
      if (
        !authorization.messageFamilyScope.includes(classification.messageFamily)
      ) {
        throw intakeError("message_family_outside_authorized_scope");
      }
      if (
        classification.currency !== null &&
        !authorization.currencyScope.includes(classification.currency)
      ) {
        throw intakeError("currency_outside_authorized_scope");
      }
      return replaceDraft(classifyQaSmsDraft(draft, classification));
    },

    previewPlaceholderCorrections(
      draft: QaSanitizedCandidateDraft,
      batch: QaPlaceholderCorrectionBatch
    ): QaSanitizedCandidateDraft {
      return preparePlaceholderCorrections(draft, batch).corrected;
    },

    applyPlaceholderCorrections(
      draft: QaSanitizedCandidateDraft,
      batch: QaPlaceholderCorrectionBatch
    ): QaSanitizedCandidateDraft {
      const { corrected, history } = preparePlaceholderCorrections(
        draft,
        batch
      );
      correctionHistoryByDraftId = {
        ...correctionHistoryByDraftId,
        [draft.draftId]: history,
      };
      return replaceDraft(corrected);
    },

    validateDraft(draft: QaSanitizedCandidateDraft): QaSanitizedCandidateDraft {
      return replaceDraft(validateQaSmsDraft(draft));
    },

    approveDraft(draft: QaSanitizedCandidateDraft): QaSanitizedCandidateDraft {
      return replaceDraft(approveQaSmsDraft(draft));
    },

    discardDraft(draftId: string): void {
      drafts = drafts.filter((draft) => draft.draftId !== draftId);
      correctionHistoryByDraftId = Object.fromEntries(
        Object.entries(correctionHistoryByDraftId).filter(
          ([currentDraftId]) => currentDraftId !== draftId
        )
      );
    },

    buildCandidateArtifact(
      draft: QaSanitizedCandidateDraft
    ): QaCandidateArtifact {
      return buildQaCandidateArtifact(draft, {
        candidateId: `qa-candidate-${dependencies.createId()}`,
        createdAt: dependencies.now().toISOString(),
      });
    },

    async handlePermissionChange(): Promise<"granted" | "revoked"> {
      const permission = await dependencies.getPermissionStatus();
      if (permission === "granted") return "granted";
      clearSensitiveWorkflowState();
      return "revoked";
    },

    async startNewEvidenceDomain(): Promise<{
      readonly requiresManualDuplicateReview: true;
    }> {
      const availability = dependencies.getAvailability();
      if (!availability.isAvailable) throw intakeError(availability.reason);
      authorization = null;
      clearSensitiveWorkflowState();
      return dependencies.startNewEvidenceDomain(true);
    },

    async getEvidenceDomainStatus(): Promise<
      "stable" | "reset_requires_manual_duplicate_review"
    > {
      const availability = dependencies.getAvailability();
      if (!availability.isAvailable) throw intakeError(availability.reason);
      return dependencies.getEvidenceDomainStatus();
    },

    getSnapshot(): QaSmsPatternIntakeSnapshot {
      return {
        authorization,
        messageCount: messages.length,
        selectedIds,
        drafts,
      };
    },

    clearRawState(): void {
      clearSensitiveWorkflowState();
    },

    close(): void {
      authorization = null;
      clearSensitiveWorkflowState();
    },
  };

  return service;
}

async function getReadSmsPermissionStatus(): Promise<SmsPermissionStatus> {
  if (isQaSmsPatternIntakeFixtureMode()) return "granted";
  if (Platform.OS !== "android") return "denied";
  const isGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_SMS
  );
  return isGranted ? "granted" : "undetermined";
}

async function readQaSmsInbox(options: {
  readonly address: string;
  readonly maxCount: number;
}): Promise<readonly SmsMessage[]> {
  if (isQaSmsPatternIntakeFixtureMode()) {
    return QA_SMS_INTAKE_FIXTURES.filter(
      ({ address }) => address === options.address
    ).slice(0, options.maxCount);
  }
  return readSmsInbox(options);
}

export const qaSmsPatternIntakeService = createQaSmsPatternIntakeService({
  getAvailability: getQaSmsPatternIntakeAvailability,
  getPermissionStatus: getReadSmsPermissionStatus,
  readInbox: readQaSmsInbox,
  computeFingerprint: computeSmsFingerprint,
  buildEvidenceIdentity: buildQaSmsEvidenceIdentity,
  createEvidenceDigest: qaSmsEvidenceService.createEvidenceDigest,
  startNewEvidenceDomain: qaSmsEvidenceService.startNewEvidenceDomain,
  getEvidenceDomainStatus: qaSmsEvidenceService.getEvidenceDomainStatus,
  createId: (): string => Crypto.randomUUID(),
  now: () => new Date(),
});

export type {
  AuthorizeInput,
  QaPlaceholderCorrectionBatch,
  QaSmsPatternIntakeService,
  QaSmsPatternIntakeSnapshot,
  SmsPermissionStatus,
};
