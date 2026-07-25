import {
  shouldUseFixtureSmsParser,
  shouldUseLocalSmsParser,
} from "@/config/e2e-test-config";
import { logger } from "@/utils/logger";
import {
  initializeSmsAiScanSession,
  isAiConsentRequiredError,
  type ParseSmsContext,
  type SmsAiRequestContext,
} from "./ai-sms-parser-service";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

function isScanSessionControlFlowError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    isAiConsentRequiredError(error) ||
    (error instanceof Error &&
      error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
  );
}

export type EnsureRemoteSmsScanSession = () => Promise<void>;

export async function initializeSmsParserScanSession(
  context: ParseSmsContext,
  requestContext: SmsAiRequestContext,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<EnsureRemoteSmsScanSession | undefined> {
  if (shouldUseLocalSmsParser() || shouldUseFixtureSmsParser()) return;

  try {
    await initializeSmsAiScanSession(
      context,
      requestContext,
      abortSignal,
      expectedUserId
    );
    return undefined;
  } catch (error: unknown) {
    if (isScanSessionControlFlowError(error)) throw error;

    logger.warn("smsParser.scanSessionInitializationFailed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return async (): Promise<void> =>
      initializeSmsAiScanSession(
        context,
        requestContext,
        abortSignal,
        expectedUserId
      );
  }
}
