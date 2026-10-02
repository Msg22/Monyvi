import { database, type Category } from "@monyvi/db";
import {
  type ParsedSmsTransaction,
  computeSmsFingerprint,
  isExcludedBeforeSmsParsing,
  isLikelyCorruptedSmsText,
  isLikelyFinancialSms,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import {
  isAiConsentRequiredError,
  type ParseSmsContext,
  type SmsAiRetryRequest,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import {
  getTrustedPrefilterDisposition,
  parseSmsWithOrchestrator,
  toSmsParserDiagnosticsLogContext,
} from "./sms-parser-orchestrator";
import type { SmsParserOrchestratorOptions } from "./sms-parser-result-contract";
import {
  reconcileLiveDetectionPreference,
  setAutoConfirm,
  setLiveDetectionEnabled,
} from "./sms-live-detection-handler";
import { hasExistingSmsFingerprint } from "./sms-dedup-service";
import { getTerminalSmsFingerprints } from "./sms-processing-outcome-service";
import {
  clearLiveSmsRetryRequestKey,
  clearLiveSmsRetryRequestsForUser,
  loadLiveSmsRetryRequestKey,
  saveLiveSmsRetryRequestKey,
} from "./sms-live-retry-request-store";
import {
  getAiProcessingConsentStatus,
  revokeAiProcessingConsent,
} from "./profile-service";
import {
  getCurrentUserDataScope,
  getRequiredCurrentUserId,
} from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";
import { logger } from "@/utils/logger";
import { toCategoryTreeSources } from "@/utils/category-tree-source";

type LiveSmsDeliveryMode = "foreground" | "headless";

type LiveSmsProcessingStatus =
  | "disabled"
  | "ignored"
  | "duplicate"
  | "infrastructure_error"
  | "ai_failed"
  | "stale_user"
  | "parsed";

export interface LiveSmsEvent {
  readonly sender: string;
  readonly body: string;
  readonly timestamp: number;
  readonly deliveryMode: LiveSmsDeliveryMode;
}

export interface LiveSmsProcessingResult {
  readonly status: LiveSmsProcessingStatus;
  readonly smsFingerprint?: string;
  readonly isRetryable?: boolean;
  readonly userId?: string;
  readonly transactions: readonly ParsedSmsTransaction[];
}

interface LiveSmsProcessingOptions {
  readonly isRecentlyProcessed?: (smsFingerprint: string) => boolean;
  readonly markRecentlyProcessed?: (smsFingerprint: string) => void;
}

type LiveSmsConsentCheckResult =
  | { readonly canProcess: true }
  | {
      readonly canProcess: false;
      readonly result: LiveSmsProcessingResult;
    };

const EMPTY_TRANSACTIONS: readonly ParsedSmsTransaction[] = [];
const inFlightSmsFingerprints = new Set<string>();

function createResult(
  status: LiveSmsProcessingStatus,
  smsFingerprint?: string,
  transactions: readonly ParsedSmsTransaction[] = EMPTY_TRANSACTIONS,
  isRetryable?: boolean,
  userId?: string
): LiveSmsProcessingResult {
  return { status, smsFingerprint, isRetryable, userId, transactions };
}

interface ScopedParseSmsContext {
  readonly context: ParseSmsContext;
  readonly userId: string;
}

async function isInitiatingUserCurrent(userId: string): Promise<boolean> {
  try {
    return (await getRequiredCurrentUserId()) === userId;
  } catch {
    return false;
  }
}

function isUserScopeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    [
      USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED,
      USER_DATA_ACCESS_ERROR_CODES.USER_REQUIRED,
    ].includes(error.message)
  );
}

type RetryStoreResult =
  | { readonly status: "ready"; readonly requestKey: string }
  | { readonly status: "stale_user" }
  | { readonly status: "failed" };

async function prepareRetryRequestKey(
  userId: string,
  smsFingerprint: string
): Promise<RetryStoreResult> {
  try {
    const persisted = await loadLiveSmsRetryRequestKey({
      expectedUserId: userId,
      smsFingerprint,
    });
    const requestKey = persisted ?? `live:${smsFingerprint}`;
    await saveLiveSmsRetryRequestKey({
      expectedUserId: userId,
      smsFingerprint,
      requestKey,
    });
    if (!(await isInitiatingUserCurrent(userId))) {
      return { status: "stale_user" };
    }
    return { status: "ready", requestKey };
  } catch (error: unknown) {
    if (isUserScopeError(error)) return { status: "stale_user" };
    logger.error("liveSms.retryIdentity.persistFailed", error);
    return { status: "failed" };
  }
}

async function clearRetryRequestKey(
  userId: string,
  smsFingerprint: string
): Promise<"cleared" | "stale_user" | "failed"> {
  try {
    await clearLiveSmsRetryRequestKey({
      expectedUserId: userId,
      smsFingerprint,
    });
    return "cleared";
  } catch (error: unknown) {
    if (isUserScopeError(error)) return "stale_user";
    logger.error("liveSms.retryIdentity.clearFailed", error);
    return "failed";
  }
}

async function clearRetryRequestsForUser(
  userId: string
): Promise<"cleared" | "stale_user" | "failed"> {
  try {
    await clearLiveSmsRetryRequestsForUser({ expectedUserId: userId });
    return "cleared";
  } catch (error: unknown) {
    if (isUserScopeError(error)) return "stale_user";
    logger.error("liveSms.retryIdentity.clearUserFailed", error);
    return "failed";
  }
}

function retryStorageFailure(
  smsFingerprint?: string
): LiveSmsProcessingResult {
  return createResult(
    "ai_failed",
    smsFingerprint,
    EMPTY_TRANSACTIONS,
    true
  );
}

function selectCanonicalRetryRequest(
  unresolved: Awaited<
    ReturnType<typeof parseSmsWithOrchestrator>
  >["unresolvedCandidates"],
  smsFingerprint: string
): SmsAiRetryRequest | null {
  const matching = unresolved.flatMap((item) =>
    item.isRetryable &&
    item.candidate.smsFingerprint === smsFingerprint &&
    item.retryRequest !== undefined &&
    item.retryRequest.candidates.some(
      (candidate) => candidate.smsFingerprint === smsFingerprint
    )
      ? [item.retryRequest]
      : []
  );
  const keys = new Set(matching.map((request) => request.requestKey));
  return keys.size === 1 ? (matching[0] ?? null) : null;
}

function createLiveParserOptions(input: {
  readonly userId: string;
  readonly terminalFingerprints: ReadonlySet<string>;
  readonly timestamp: number;
  readonly requestKey: string;
}): SmsParserOrchestratorOptions {
  return {
    expectedUserId: input.userId,
    terminalFingerprints: input.terminalFingerprints,
    requestContext: {
      scanSessionId: null,
      scanKind: "live",
      scanStartedAtMs: input.timestamp,
    },
    requestKey: input.requestKey,
  };
}

async function loadAiContext(
  expectedUserId: string
): Promise<ScopedParseSmsContext | null> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedUserId) return null;
  const categories = await scope
    .queryAccessibleCategories(
      database.get<Category>("categories"),
      Q.where("deleted", Q.notEq(true))
    )
    .fetch();

  return {
    userId: scope.userId,
    context: {
      categories: toCategoryTreeSources(categories),
      supportedCurrencies: SUPPORTED_CURRENCIES.map(
        (currency) => currency.code
      ),
    },
  };
}

type LiveSmsConsentState = "consented" | "disabled" | "stale_user";

async function getLiveSmsConsentState(
  expectedUserId: string
): Promise<LiveSmsConsentState> {
  const aiConsentStatus = await getAiProcessingConsentStatus();
  if (aiConsentStatus.userId !== expectedUserId) return "stale_user";
  if (aiConsentStatus.isConsented) {
    return "consented";
  }

  await setLiveDetectionEnabled(false, expectedUserId);
  await setAutoConfirm(false, expectedUserId);
  return (await isInitiatingUserCurrent(expectedUserId))
    ? "disabled"
    : "stale_user";
}

async function checkLiveSmsAiConsent({
  logTag,
  deliveryMode,
  smsFingerprint,
  expectedUserId,
}: {
  readonly logTag: string;
  readonly deliveryMode: LiveSmsDeliveryMode;
  readonly smsFingerprint?: string;
  readonly expectedUserId: string;
}): Promise<LiveSmsConsentCheckResult> {
  try {
    const consentState = await getLiveSmsConsentState(expectedUserId);
    if (consentState !== "consented") {
      return {
        canProcess: false,
        result: createResult(consentState, smsFingerprint),
      };
    }
  } catch (error: unknown) {
    logger.error(logTag, error, { deliveryMode });
    return {
      canProcess: false,
      result: createResult("infrastructure_error", smsFingerprint),
    };
  }

  return { canProcess: true };
}

async function disableLiveSmsAfterConsentRequired({
  deliveryMode,
  smsFingerprint,
  expectedUserId,
}: {
  readonly deliveryMode: LiveSmsDeliveryMode;
  readonly smsFingerprint: string;
  readonly expectedUserId: string;
}): Promise<LiveSmsProcessingResult> {
  try {
    if (!(await isInitiatingUserCurrent(expectedUserId))) {
      return createResult("stale_user", smsFingerprint);
    }
    await revokeAiProcessingConsent({ expectedUserId });
    if (!(await isInitiatingUserCurrent(expectedUserId))) {
      return createResult("stale_user", smsFingerprint);
    }
    await setLiveDetectionEnabled(false, expectedUserId);
    if (!(await isInitiatingUserCurrent(expectedUserId))) {
      return createResult("stale_user", smsFingerprint);
    }
    await setAutoConfirm(false, expectedUserId);
  } catch (settingsError: unknown) {
    logger.error("liveSms.consentRequiredDisable.failed", settingsError, {
      deliveryMode,
    });
  }

  return createResult("disabled", smsFingerprint);
}

export async function processLiveSmsEvent(
  event: LiveSmsEvent,
  options: LiveSmsProcessingOptions = {}
): Promise<LiveSmsProcessingResult> {
  let initiatingUserId: string;
  try {
    initiatingUserId = await getRequiredCurrentUserId();
  } catch {
    return createResult("stale_user");
  }

  try {
    const canRun = await reconcileLiveDetectionPreference();
    if (!canRun) {
      return createResult("disabled");
    }

    const consentCheck = await checkLiveSmsAiConsent({
      logTag: "liveSms.consentCheck.failed",
      deliveryMode: event.deliveryMode,
      expectedUserId: initiatingUserId,
    });
    if (!consentCheck.canProcess) {
      if (consentCheck.result.status === "disabled") {
        const cleared = await clearRetryRequestsForUser(initiatingUserId);
        if (cleared === "stale_user") return createResult("stale_user");
        if (cleared === "failed") return retryStorageFailure();
      }
      return consentCheck.result;
    }
    if (!(await isInitiatingUserCurrent(initiatingUserId))) {
      return createResult("stale_user");
    }
  } catch (error: unknown) {
    logger.error("liveSms.consentCheck.failed", error, {
      deliveryMode: event.deliveryMode,
    });
    return createResult("infrastructure_error", undefined);
  }

  if (
    isExcludedBeforeSmsParsing(event.body) ||
    isLikelyCorruptedSmsText(event.body)
  ) {
    return createResult("ignored");
  }

  let smsFingerprint: string | undefined;
  let candidate: SmsCandidate | undefined;
  try {
    smsFingerprint = await computeSmsFingerprint({
      sender: event.sender,
      body: event.body,
      receivedAtMs: event.timestamp,
    });
    candidate = {
      message: {
        id: `live-${smsFingerprint}`,
        address: event.sender,
        body: event.body,
        date: event.timestamp,
        read: false,
      },
      smsFingerprint,
    };
    const trustedPrefilterDisposition = getTrustedPrefilterDisposition(
      candidate,
      SUPPORTED_CURRENCIES.map(({ code }) => code)
    );
    if (
      trustedPrefilterDisposition === "filter_before_ai" ||
      (!isLikelyFinancialSms(event.body) &&
        trustedPrefilterDisposition !== "route_to_parser")
    ) {
      return createResult("ignored", smsFingerprint);
    }

    if (inFlightSmsFingerprints.has(smsFingerprint)) {
      return createResult("duplicate", smsFingerprint);
    }

    if (options.isRecentlyProcessed?.(smsFingerprint)) {
      return createResult("duplicate", smsFingerprint);
    }

    inFlightSmsFingerprints.add(smsFingerprint);

    if (await hasExistingSmsFingerprint(smsFingerprint, initiatingUserId)) {
      await clearRetryRequestKey(initiatingUserId, smsFingerprint);
      inFlightSmsFingerprints.delete(smsFingerprint);
      return createResult("duplicate", smsFingerprint);
    }
    if (!(await isInitiatingUserCurrent(initiatingUserId))) {
      inFlightSmsFingerprints.delete(smsFingerprint);
      return createResult("stale_user", smsFingerprint);
    }
  } catch (error: unknown) {
    if (smsFingerprint !== undefined) {
      inFlightSmsFingerprints.delete(smsFingerprint);
    }
    logger.error("liveSms.infrastructure.failed", error, {
      deliveryMode: event.deliveryMode,
    });
    return createResult("infrastructure_error", undefined);
  }

  const confirmedSmsFingerprint = smsFingerprint;
  if (confirmedSmsFingerprint === undefined) {
    return createResult("infrastructure_error", undefined);
  }
  if (candidate === undefined) {
    return createResult("infrastructure_error", confirmedSmsFingerprint);
  }

  try {
    let scopedContext: ScopedParseSmsContext | null;
    try {
      scopedContext = await loadAiContext(initiatingUserId);
    } catch (error: unknown) {
      logger.error("liveSms.context.failed", error, {
        deliveryMode: event.deliveryMode,
      });
      return createResult("infrastructure_error", confirmedSmsFingerprint);
    }
    if (scopedContext === null) {
      return createResult("stale_user", confirmedSmsFingerprint);
    }
    const { context } = scopedContext;

    const preParseConsentCheck = await checkLiveSmsAiConsent({
      logTag: "liveSms.consentPreParseCheck.failed",
      deliveryMode: event.deliveryMode,
      smsFingerprint: confirmedSmsFingerprint,
      expectedUserId: initiatingUserId,
    });
    if (!preParseConsentCheck.canProcess) {
      if (preParseConsentCheck.result.status === "disabled") {
        const cleared = await clearRetryRequestKey(
          initiatingUserId,
          confirmedSmsFingerprint
        );
        if (cleared === "stale_user") {
          return createResult("stale_user", confirmedSmsFingerprint);
        }
        if (cleared === "failed") {
          return retryStorageFailure(confirmedSmsFingerprint);
        }
      }
      return preParseConsentCheck.result;
    }

    let aiResult: Awaited<ReturnType<typeof parseSmsWithOrchestrator>>;
    let activeRequestKey: string | null = null;
    let wasTerminalBeforeDispatch = false;
    try {
      const terminalFingerprints = await getTerminalSmsFingerprints(
        [confirmedSmsFingerprint],
        initiatingUserId
      );
      wasTerminalBeforeDispatch = terminalFingerprints.has(
        confirmedSmsFingerprint
      );
      const retryIdentity = await prepareRetryRequestKey(
        initiatingUserId,
        confirmedSmsFingerprint
      );
      if (retryIdentity.status === "stale_user") {
        return createResult("stale_user", confirmedSmsFingerprint);
      }
      if (retryIdentity.status === "failed") {
        return retryStorageFailure(confirmedSmsFingerprint);
      }
      if (!(await isInitiatingUserCurrent(initiatingUserId))) {
        return createResult("stale_user", confirmedSmsFingerprint);
      }
      activeRequestKey = retryIdentity.requestKey;
      const parserOptions = createLiveParserOptions({
        userId: initiatingUserId,
        terminalFingerprints,
        timestamp: event.timestamp,
        requestKey: activeRequestKey,
      });
      aiResult = await parseSmsWithOrchestrator(
        [candidate],
        context,
        undefined,
        undefined,
        parserOptions
      );
      if (!(await isInitiatingUserCurrent(initiatingUserId))) {
        return createResult("stale_user", confirmedSmsFingerprint);
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED
      ) {
        return createResult("stale_user", confirmedSmsFingerprint);
      }
      if (isAiConsentRequiredError(error)) {
        await clearRetryRequestKey(
          initiatingUserId,
          confirmedSmsFingerprint
        );
        return disableLiveSmsAfterConsentRequired({
          deliveryMode: event.deliveryMode,
          smsFingerprint: confirmedSmsFingerprint,
          expectedUserId: initiatingUserId,
        });
      }

      logger.error("liveSms.aiParse.failed", error, {
        deliveryMode: event.deliveryMode,
      });
      return createResult(
        "ai_failed",
        confirmedSmsFingerprint,
        EMPTY_TRANSACTIONS,
        true
      );
    }

    logger.info("liveSms.parserDiagnostics", {
      deliveryMode: event.deliveryMode,
      ...toSmsParserDiagnosticsLogContext(aiResult.diagnostics),
    });

    if (wasTerminalBeforeDispatch) {
      const cleared = await clearRetryRequestKey(
        initiatingUserId,
        confirmedSmsFingerprint
      );
      if (cleared === "stale_user") {
        return createResult("stale_user", confirmedSmsFingerprint);
      }
    }

    if (aiResult.isConsentRequired === true) {
      await clearRetryRequestKey(
        initiatingUserId,
        confirmedSmsFingerprint
      );
      return disableLiveSmsAfterConsentRequired({
        deliveryMode: event.deliveryMode,
        smsFingerprint: confirmedSmsFingerprint,
        expectedUserId: initiatingUserId,
      });
    }

    const consentRecheck = await checkLiveSmsAiConsent({
      logTag: "liveSms.consentRecheck.failed",
      deliveryMode: event.deliveryMode,
      smsFingerprint: confirmedSmsFingerprint,
      expectedUserId: initiatingUserId,
    });
    if (!consentRecheck.canProcess) {
      if (consentRecheck.result.status === "disabled") {
        await clearRetryRequestKey(
          initiatingUserId,
          confirmedSmsFingerprint
        );
      }
      return consentRecheck.result;
    }

    if (!(await isInitiatingUserCurrent(initiatingUserId))) {
      logger.info("liveSms.authScopeChanged", {
        deliveryMode: event.deliveryMode,
      });
      return createResult("stale_user", confirmedSmsFingerprint);
    }

    const hasUnresolvedFailure =
      aiResult.hasError === true &&
      (aiResult.transactions.length === 0 ||
        aiResult.unresolvedCandidates.length > 0);
    if (hasUnresolvedFailure) {
      const isRetryable = aiResult.isRetryable !== false;
      if (!isRetryable) {
        const cleared = await clearRetryRequestKey(
          initiatingUserId,
          confirmedSmsFingerprint
        );
        if (cleared === "stale_user") {
          return createResult("stale_user", confirmedSmsFingerprint);
        }
      } else {
        const retryRequest = selectCanonicalRetryRequest(
          aiResult.unresolvedCandidates,
          confirmedSmsFingerprint
        );
        if (
          retryRequest !== null &&
          activeRequestKey !== null &&
          retryRequest.requestKey !== activeRequestKey
        ) {
          try {
            await saveLiveSmsRetryRequestKey({
              expectedUserId: initiatingUserId,
              smsFingerprint: confirmedSmsFingerprint,
              requestKey: retryRequest.requestKey,
            });
          } catch (error: unknown) {
            if (isUserScopeError(error)) {
              return createResult("stale_user", confirmedSmsFingerprint);
            }
            logger.error("liveSms.retryIdentity.rotateFailed", error);
            return retryStorageFailure(confirmedSmsFingerprint);
          }
        }
      }
      return createResult(
        "ai_failed",
        confirmedSmsFingerprint,
        EMPTY_TRANSACTIONS,
        isRetryable
      );
    }

    const cleared = await clearRetryRequestKey(
      initiatingUserId,
      confirmedSmsFingerprint
    );
    if (cleared === "stale_user") {
      return createResult("stale_user", confirmedSmsFingerprint);
    }
    options.markRecentlyProcessed?.(confirmedSmsFingerprint);

    if (aiResult.transactions.length === 0) {
      return createResult("ignored", confirmedSmsFingerprint);
    }

    return createResult(
      "parsed",
      confirmedSmsFingerprint,
      aiResult.transactions,
      undefined,
      initiatingUserId
    );
  } finally {
    inFlightSmsFingerprints.delete(confirmedSmsFingerprint);
  }
}
