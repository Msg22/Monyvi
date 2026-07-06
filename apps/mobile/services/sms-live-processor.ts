import { database, type Category } from "@monyvi/db";
import {
  type ParsedSmsTransaction,
  computeSmsFingerprint,
  isLikelyFinancialSms,
  SUPPORTED_CURRENCIES,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import {
  type AiParseResult,
  parseSmsWithAi,
  type ParseSmsContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import {
  reconcileLiveDetectionPreference,
  setAutoConfirm,
  setLiveDetectionEnabled,
} from "./sms-live-detection-handler";
import { hasExistingSmsFingerprint } from "./sms-dedup-service";
import { getAiProcessingConsentStatus } from "./profile-service";
import { getCurrentUserDataScope } from "./user-data-access";
import { logger } from "@/utils/logger";
import { toCategoryTreeSources } from "@/utils/category-tree-source";

type LiveSmsDeliveryMode = "foreground" | "headless";

type LiveSmsProcessingStatus =
  | "disabled"
  | "ignored"
  | "duplicate"
  | "infrastructure_error"
  | "ai_failed"
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
  readonly transactions: readonly ParsedSmsTransaction[];
}

interface LiveSmsProcessingOptions {
  readonly isRecentlyProcessed?: (smsFingerprint: string) => boolean;
  readonly markRecentlyProcessed?: (smsFingerprint: string) => void;
}

const EMPTY_TRANSACTIONS: readonly ParsedSmsTransaction[] = [];
const inFlightSmsFingerprints = new Set<string>();

function createResult(
  status: LiveSmsProcessingStatus,
  smsFingerprint?: string,
  transactions: readonly ParsedSmsTransaction[] = EMPTY_TRANSACTIONS,
  isRetryable?: boolean
): LiveSmsProcessingResult {
  return { status, smsFingerprint, isRetryable, transactions };
}

async function loadAiContext(): Promise<ParseSmsContext> {
  const scope = await getCurrentUserDataScope();
  const categories = await scope
    .queryAccessibleCategories(
      database.get<Category>("categories"),
      Q.where("deleted", Q.notEq(true))
    )
    .fetch();

  return {
    categories: toCategoryTreeSources(categories),
    supportedCurrencies: SUPPORTED_CURRENCIES.map((currency) => currency.code),
  };
}

async function hasLiveSmsAiConsent(): Promise<boolean> {
  const aiConsentStatus = await getAiProcessingConsentStatus();
  if (aiConsentStatus.isConsented) {
    return true;
  }

  await setLiveDetectionEnabled(false);
  await setAutoConfirm(false);
  return false;
}

export async function processLiveSmsEvent(
  event: LiveSmsEvent,
  options: LiveSmsProcessingOptions = {}
): Promise<LiveSmsProcessingResult> {
  if (!isLikelyFinancialSms(event.body)) {
    return createResult("ignored");
  }

  try {
    const canRun = await reconcileLiveDetectionPreference();
    if (!canRun) {
      return createResult("disabled");
    }

    if (!(await hasLiveSmsAiConsent())) {
      return createResult("disabled");
    }
  } catch (error: unknown) {
    logger.error("liveSms.consentCheck.failed", error, {
      deliveryMode: event.deliveryMode,
    });
    return createResult("infrastructure_error", undefined);
  }

  let smsFingerprint: string | undefined;
  try {
    smsFingerprint = await computeSmsFingerprint({
      sender: event.sender,
      body: event.body,
      receivedAtMs: event.timestamp,
    });

    if (inFlightSmsFingerprints.has(smsFingerprint)) {
      return createResult("duplicate", smsFingerprint);
    }

    if (options.isRecentlyProcessed?.(smsFingerprint)) {
      return createResult("duplicate", smsFingerprint);
    }

    inFlightSmsFingerprints.add(smsFingerprint);

    if (await hasExistingSmsFingerprint(smsFingerprint)) {
      inFlightSmsFingerprints.delete(smsFingerprint);
      return createResult("duplicate", smsFingerprint);
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

  try {
    let context: ParseSmsContext;
    try {
      context = await loadAiContext();
    } catch (error: unknown) {
      logger.error("liveSms.context.failed", error, {
        deliveryMode: event.deliveryMode,
      });
      return createResult("infrastructure_error", confirmedSmsFingerprint);
    }

    try {
      if (!(await hasLiveSmsAiConsent())) {
        return createResult("disabled", confirmedSmsFingerprint);
      }
    } catch (error: unknown) {
      logger.error("liveSms.consentCheck.failed", error, {
        deliveryMode: event.deliveryMode,
      });
      return createResult("infrastructure_error", confirmedSmsFingerprint);
    }

    const candidate: SmsCandidate = {
      message: {
        id: `live-${event.deliveryMode}-${event.timestamp}`,
        address: event.sender,
        body: event.body,
        date: event.timestamp,
        read: false,
      },
      smsFingerprint: confirmedSmsFingerprint,
    };

    let aiResult: AiParseResult;
    try {
      aiResult = await parseSmsWithAi([candidate], context);
    } catch (error: unknown) {
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

    if (aiResult.hasError === true) {
      return createResult(
        "ai_failed",
        confirmedSmsFingerprint,
        EMPTY_TRANSACTIONS,
        aiResult.isRetryable !== false
      );
    }

    options.markRecentlyProcessed?.(confirmedSmsFingerprint);

    if (aiResult.transactions.length === 0) {
      return createResult("ignored", confirmedSmsFingerprint);
    }

    return createResult(
      "parsed",
      confirmedSmsFingerprint,
      aiResult.transactions
    );
  } finally {
    inFlightSmsFingerprints.delete(confirmedSmsFingerprint);
  }
}
