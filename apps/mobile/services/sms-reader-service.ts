/**
 * SMS Reader Service
 *
 * Wraps `react-native-get-sms-android` with a typed interface for
 * reading the Android SMS inbox. Returns empty results on iOS.
 *
 * Architecture & Design Rationale:
 * - Pattern: Adapter Pattern
 * - Why: Isolates the untyped native module behind a typed interface.
 *   If the underlying library changes or needs swapping, only this
 *   file is affected.
 * - SOLID: Single Responsibility — only handles SMS reading, not parsing.
 *
 * @module sms-reader-service
 */

import { Platform } from "react-native";
import {
  LOCAL_SMS_FIXTURE_CORPUS,
  type LocalSmsFixture,
  type SmsMessage,
} from "@monyvi/logic";
import {
  getAiSmsParserMode,
  shouldUseFixtureSmsInbox,
} from "@/config/e2e-test-config";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { getFixtureById } from "@/services/dev/sms-fixtures";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmsReaderOptions {
  /** Maximum number of SMS messages to read. Defaults to 1000. */
  readonly maxCount?: number;
  /** Only read messages after this timestamp (ms since epoch). */
  readonly minDate?: number;
  /** Only read messages at or before this timestamp (ms since epoch). */
  readonly maxDate?: number;
  /** Zero-based offset used for stable inbox pagination. */
  readonly indexFrom?: number;
  /** Explicit native ordering used to keep paged reads deterministic. */
  readonly sortOrder?: "date DESC, _id DESC";

  readonly address?: string;
}

// ---------------------------------------------------------------------------
// Native Module Interface
// ---------------------------------------------------------------------------

/**
 * The raw filter object expected by react-native-get-sms-android.
 * @see https://github.com/nickalderilan/react-native-get-sms-android
 */
interface SmsFilter {
  box: "inbox";
  maxCount?: number;
  minDate?: number;
  maxDate?: number;
  indexFrom?: number;
  sortOrder?: "date DESC, _id DESC";
  address?: string;
}

/**
 * Raw SMS record from the native module (snake_case keys).
 */
interface RawNativeSms {
  _id: string;
  address: string;
  body: string;
  date: string;
  read: number;
}

/**
 * Typed interface for the react-native-get-sms-android native module.
 * Provides type safety over the dynamically imported module.
 */
interface NativeSmsModule {
  list(
    filter: string,
    onFail: (error: string) => void,
    onSuccess: (count: number, smsList: string) => void
  ): void;
}

const E2E_SMS_INBOX_FIXTURE_IDS = [
  "pr622_batch_duplicate_shop",
  "pr622_batch_duplicate_shop",
  "qnb_atm_withdrawal",
] as const;

const E2E_HYBRID_SMS_INBOX_FIXTURE_IDS = [
  "hybrid_ai_purchase",
  "hybrid_retryable_once",
  "hybrid_trusted_qnb_purchase",
] as const;

const E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS = new Set([
  "nbe",
  "qnb-egypt",
  "vodafone-cash",
]);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const E2E_DUPLICATE_SECOND_OFFSET_MS = 60_000;
const INVALID_SMS_DATE_FALLBACK_BASE_MS = Date.UTC(2024, 0, 1);
const INVALID_SMS_DATE_FALLBACK_STEP_MS = 1000;

interface FixtureInboxMessage {
  readonly id: string;
  readonly address: string;
  readonly body: string;
  readonly date: number;
  readonly read: true;
}

function resolveFixtureTimestamp(
  fixtureId: string,
  index: number,
  timestamp: number | undefined
): number {
  if (timestamp === undefined) {
    throw new Error(
      `Fixture ${fixtureId} at index ${index} must define timestamp in E2E fixture mode`
    );
  }

  return timestamp;
}

function toRollingFixtureInboxTimestamp(timestamp: number): number {
  const now = new Date(Date.now());
  const yesterdayStartUtc =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    ONE_DAY_MS;
  const source = new Date(timestamp);

  return (
    yesterdayStartUtc +
    source.getUTCHours() * 60 * 60 * 1000 +
    source.getUTCMinutes() * 60 * 1000 +
    source.getUTCSeconds() * 1000 +
    source.getUTCMilliseconds()
  );
}

function filterFixtureMessages(
  messages: readonly FixtureInboxMessage[],
  options?: SmsReaderOptions
): readonly SmsMessage[] {
  const minDate = options?.minDate;
  const maxDate = options?.maxDate;
  const filteredByAddress =
    options?.address === undefined
      ? messages
      : messages.filter((message) => message.address === options.address);
  const filteredByMinDate =
    minDate === undefined
      ? filteredByAddress
      : filteredByAddress.filter((message) => message.date >= minDate);
  const filtered =
    maxDate === undefined
      ? filteredByMinDate
      : filteredByMinDate.filter((message) => message.date <= maxDate);
  const newestFirst = [...filtered].sort(
    (a, b) => b.date - a.date || b.id.localeCompare(a.id)
  );
  const indexFrom = options?.indexFrom ?? 0;

  return newestFirst.slice(indexFrom, indexFrom + (options?.maxCount ?? 1000));
}

function readLegacyFixtureSmsInbox(
  options?: SmsReaderOptions
): readonly SmsMessage[] {
  const fixtureMessages = E2E_SMS_INBOX_FIXTURE_IDS.map((fixtureId, index) => {
    const fixture = getFixtureById(fixtureId);
    if (!fixture) {
      throw new Error(`Missing E2E SMS inbox fixture: ${fixtureId}`);
    }

    const baseDate = resolveFixtureTimestamp(
      fixtureId,
      index,
      fixture.timestamp
    );
    const duplicateOffset =
      fixtureId === "pr622_batch_duplicate_shop" && index === 1
        ? E2E_DUPLICATE_SECOND_OFFSET_MS
        : 0;

    const message: FixtureInboxMessage = {
      id: `e2e-${fixtureId}-${index}`,
      address: fixture.sender,
      body: fixture.body,
      date: toRollingFixtureInboxTimestamp(baseDate) + duplicateOffset,
      read: true,
    };
    return message;
  });

  return filterFixtureMessages(fixtureMessages, options);
}

function readHybridFixtureSmsInbox(
  options?: SmsReaderOptions
): readonly SmsMessage[] {
  const fixtureMessages = E2E_HYBRID_SMS_INBOX_FIXTURE_IDS.map(
    (fixtureId, index) => {
      const fixture = getFixtureById(fixtureId);
      if (!fixture) {
        throw new Error(`Missing hybrid E2E SMS fixture: ${fixtureId}`);
      }

      return {
        id: `e2e-hybrid-${fixtureId}-${index}`,
        address: fixture.sender,
        body: fixture.body,
        date: toRollingFixtureInboxTimestamp(
          resolveFixtureTimestamp(fixtureId, index, fixture.timestamp)
        ),
        read: true,
      } satisfies FixtureInboxMessage;
    }
  );

  return filterFixtureMessages(fixtureMessages, options);
}

function mapLocalParserFixture(
  fixture: LocalSmsFixture,
  index: number
): FixtureInboxMessage {
  return {
    id: `e2e-local-${fixture.id}`,
    address: fixture.sender,
    body: fixture.body,
    date: toRollingFixtureInboxTimestamp(fixture.receivedAtMs) + index,
    read: true,
  };
}

function readLocalParserFixtureSmsInbox(
  options?: SmsReaderOptions
): readonly SmsMessage[] {
  const saveableFixtures = LOCAL_SMS_FIXTURE_CORPUS.filter((fixture) =>
    E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS.has(fixture.providerId)
  );

  return filterFixtureMessages(
    saveableFixtures.map(mapLocalParserFixture),
    options
  );
}

function readSafeguardQaFixtureSmsInbox(
  profileId: NonNullable<
    ReturnType<typeof getSmsSafeguardQaConfig>["profileId"]
  >,
  options?: SmsReaderOptions
): readonly SmsMessage[] {
  // Development-only module stays behind the explicit, fail-closed QA flag.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const qaRuntime =
    require("./testing/sms-safeguard-qa-runner") as typeof import("./testing/sms-safeguard-qa-runner");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return filterFixtureMessages(
    qaRuntime.createSafeguardQaInboxMessages(profileId),
    options
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read SMS messages from the Android inbox.
 *
 * @param options - Optional filtering (maxCount, minDate)
 * @returns Array of typed SmsMessage objects. Empty array on iOS.
 */
export async function readSmsInbox(
  options?: SmsReaderOptions
): Promise<readonly SmsMessage[]> {
  if (Platform.OS !== "android") {
    return [];
  }

  const safeguardQaConfig = getSmsSafeguardQaConfig();
  if (safeguardQaConfig.enabled) {
    if (safeguardQaConfig.profileId === null) {
      throw new Error("SMS safeguard QA requires a selected profile.");
    }
    return readSafeguardQaFixtureSmsInbox(safeguardQaConfig.profileId, options);
  }

  if (shouldUseFixtureSmsInbox()) {
    const parserMode = getAiSmsParserMode();
    const messages =
      parserMode === "local"
        ? readLocalParserFixtureSmsInbox(options)
        : parserMode === "hybrid-fixture"
          ? readHybridFixtureSmsInbox(options)
          : readLegacyFixtureSmsInbox(options);

    logger.info("smsReader.fixtureInbox.used", {
      parserMode,
      messageCount: messages.length,
    });

    return messages;
  }

  try {
    // Dynamic import to avoid crash on iOS where the native module isn't linked.
    // The module uses `module.exports = NativeModules.Sms` (no .default wrapper).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeModule = require("react-native-get-sms-android") as
      | NativeSmsModule
      | { default: NativeSmsModule };
    const SmsAndroid: NativeSmsModule =
      "list" in nativeModule ? nativeModule : nativeModule.default;

    const filter: SmsFilter = {
      box: "inbox",
      maxCount: options?.maxCount ?? 1000,
      ...(options?.indexFrom !== undefined
        ? { indexFrom: options.indexFrom }
        : {}),
      ...(options?.address ? { address: options.address } : {}),
      ...(options?.minDate !== undefined ? { minDate: options.minDate } : {}),
      ...(options?.maxDate !== undefined ? { maxDate: options.maxDate } : {}),
      ...(options?.sortOrder ? { sortOrder: options.sortOrder } : {}),
    };

    return new Promise<readonly SmsMessage[]>((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          reject(new Error(`SMS read failed: ${fail}`));
        },
        (_count: number, smsList: string) => {
          try {
            const rawMessages = JSON.parse(smsList) as readonly RawNativeSms[];
            // Preserve the native page length so empty/corrupt rows cannot
            // terminate pagination before later valid messages are read.
            const messages = rawMessages.map(mapNativeSms);
            resolve(messages);
          } catch (parseError) {
            reject(
              new Error(
                `SMS parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`
              )
            );
          }
        }
      );
    });
  } catch (error) {
    // Native module not available (dev build issue or iOS)
    console.warn(
      "[sms-reader-service] Native SMS module unavailable:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

/**
 * Get the total count of SMS messages in the inbox.
 * Returns 0 on iOS.
 */
export async function getSmsCount(): Promise<number> {
  if (Platform.OS !== "android") {
    return 0;
  }

  try {
    const messages = await readSmsInbox({ maxCount: 1 });
    // The native module doesn't provide a count-only API,
    // so we use a maxCount of 1 just to check availability
    return messages.length > 0 ? -1 : 0; // -1 means "messages exist, count unknown"
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Map a raw native SMS record to our typed SmsMessage interface.
 */
function mapNativeSms(raw: RawNativeSms): SmsMessage {
  return {
    id: String(raw._id),
    address: raw.address,
    body: raw.body,
    date: parseNativeSmsDate(raw.date, raw._id),
    read: raw.read === 1,
  };
}

function parseNativeSmsDate(date: string, id: string): number {
  const parsedDate = Number.parseInt(date, 10);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  return getInvalidSmsDateFallback(id);
}

function getInvalidSmsDateFallback(id: string): number {
  const parsedId = Number.parseInt(id, 10);
  if (Number.isFinite(parsedId) && parsedId >= 0) {
    return (
      INVALID_SMS_DATE_FALLBACK_BASE_MS +
      parsedId * INVALID_SMS_DATE_FALLBACK_STEP_MS
    );
  }

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1_000_000_000;
  }

  return (
    INVALID_SMS_DATE_FALLBACK_BASE_MS + hash * INVALID_SMS_DATE_FALLBACK_STEP_MS
  );
}
