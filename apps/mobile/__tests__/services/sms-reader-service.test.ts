import { Platform } from "react-native";
import { LOCAL_SMS_FIXTURE_CORPUS } from "@monyvi/logic";

const mockNativeSmsList = jest.fn();

jest.mock("react-native-get-sms-android", () => ({
  list: (...args: readonly unknown[]): unknown => mockNativeSmsList(...args),
}));

import { readSmsInbox } from "@/services/sms-reader-service";

const originalPlatformOS = Platform.OS;
const TEST_NOW_MS = Date.parse("2026-07-07T16:18:00.000Z");
const JULY_6_2026_16_10 = Date.parse("2026-07-06T16:10:00.000Z");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS = new Set([
  "nbe",
  "qnb-egypt",
  "vodafone-cash",
]);

function enableFixtureSmsInbox(): void {
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";
}

function enableLocalParserFixtureSmsInbox(): void {
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
}

function enableHybridFixtureSmsInbox(): void {
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "hybrid-fixture";
}

function enableDevLocalParserFixtureSmsInbox(): void {
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
  process.env.EXPO_PUBLIC_SMS_INBOX_MODE = "fixture";
}

function enableSafeguardQaFixtureInbox(): void {
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = "partial-quota-v1";
  process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID = "sms-reader-run";
}

function freezeFixtureInboxClock(nowMs: number = TEST_NOW_MS): void {
  jest.spyOn(Date, "now").mockReturnValue(nowMs);
}

describe("sms-reader-service", (): void => {
  beforeEach((): void => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_SMS_INBOX_MODE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  afterEach((): void => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOS,
    });
  });

  it("uses a stable timestamp fallback for invalid native SMS dates", async (): Promise<void> => {
    mockNativeSmsList.mockImplementation(
      (
        _filter: string,
        _onFail: (error: string) => void,
        onSuccess: (count: number, smsList: string) => void
      ) => {
        onSuccess(
          1,
          JSON.stringify([
            {
              _id: "10",
              address: "NBE",
              body: "Purchase EGP 100 at Shop",
              date: "not-a-date",
              read: 0,
            },
            {
              _id: "11",
              address: "NBE",
              body: "Purchase EGP 100 at Shop",
              date: "also-not-a-date",
              read: 0,
            },
          ])
        );
      }
    );

    const firstRead = await readSmsInbox();
    const secondRead = await readSmsInbox();

    expect(firstRead[0]?.date).toBeGreaterThan(Date.UTC(2024, 0, 1) - 1);
    expect(firstRead[1]?.date).toBeGreaterThan(firstRead[0]?.date ?? 0);
    expect(secondRead.map((message) => message.date)).toEqual(
      firstRead.map((message) => message.date)
    );
  });

  it("uses deterministic fixture inbox messages in E2E fixture mode", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.body)).toEqual([
      "Purchase EGP 33.33 on card **** 4321 at PR622 BATCH DUPLICATE SHOP on 08/04 17:01. Avail bal EGP 12,397.22",
      "Purchase EGP 33.33 on card **** 4321 at PR622 BATCH DUPLICATE SHOP on 08/04 17:01. Avail bal EGP 12,397.22",
      "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
    ]);
    expect(messages[0]?.date).not.toBe(messages[1]?.date);
    expect(messages[0]?.date).toBeGreaterThan(messages[1]?.date ?? 0);
    expect(messages[1]?.date).toBeGreaterThan(messages[2]?.date ?? 0);
  });

  it("uses deterministic fixture inbox messages in E2E local parser mode", async (): Promise<void> => {
    enableLocalParserFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    const expectedSaveableCount = LOCAL_SMS_FIXTURE_CORPUS.filter((fixture) =>
      E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS.has(fixture.providerId)
    ).length;
    expect(messages.length).toBeGreaterThan(3);
    expect(messages).toHaveLength(expectedSaveableCount);
    expect(
      messages.every((message) => message.id.startsWith("e2e-local-"))
    ).toBe(true);
    expect(messages[0]?.id).not.toBe("e2e-pr622_batch_duplicate_shop-1");
  });

  it("uses a mixed trusted and AI fallback inbox in hybrid fixture mode", async (): Promise<void> => {
    enableHybridFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    expect(messages.map((message) => message.id)).toEqual([
      "e2e-hybrid-hybrid_ai_purchase-0",
      "e2e-hybrid-hybrid_retryable_once-1",
      "e2e-hybrid-hybrid_trusted_qnb_purchase-2",
    ]);
  });

  it("uses local parser fixture inbox in normal dev mode when explicitly requested", async (): Promise<void> => {
    enableDevLocalParserFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    expect(messages.length).toBeGreaterThan(3);
    expect(
      messages.every((message) => message.id.startsWith("e2e-local-"))
    ).toBe(true);
  });

  it("uses the selected safeguard profile inbox without reading the device inbox", async (): Promise<void> => {
    enableSafeguardQaFixtureInbox();

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    expect(messages.length).toBeGreaterThan(3);
    expect(
      messages.every((message) =>
        message.id.startsWith("sms-safeguard-qa:partial-quota-v1:")
      )
    ).toBe(true);
  });

  it("keeps local parser fixture inbox timestamps stable for fingerprint dedup", async (): Promise<void> => {
    enableLocalParserFixtureSmsInbox();
    freezeFixtureInboxClock();

    const firstScan = await readSmsInbox();
    const secondScan = await readSmsInbox();

    expect(secondScan.map((message) => message.id)).toEqual(
      firstScan.map((message) => message.id)
    );
    expect(secondScan.map((message) => message.date)).toEqual(
      firstScan.map((message) => message.date)
    );
  });

  it("keeps all fixture inbox messages inside the rolling 30-day scan window", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox({
      minDate: TEST_NOW_MS - THIRTY_DAYS_MS,
    });

    expect(messages).toHaveLength(3);
    expect(
      messages.some((message) => message.id === "e2e-qnb_atm_withdrawal-2")
    ).toBe(true);
  });

  it("passes the inclusive minimum date to the Android inbox adapter", async (): Promise<void> => {
    const minDate = Date.parse("2026-06-20T09:00:00.000Z");
    mockNativeSmsList.mockImplementation(
      (
        filter: string,
        _onFail: (error: string) => void,
        onSuccess: (count: number, smsList: string) => void
      ) => {
        expect(JSON.parse(filter)).toEqual({
          box: "inbox",
          maxCount: 321,
          minDate,
        });
        onSuccess(0, "[]");
      }
    );

    await readSmsInbox({ maxCount: 321, minDate });

    expect(mockNativeSmsList).toHaveBeenCalledTimes(1);
  });

  it("includes fixture messages exactly at minDate and excludes older rows", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();
    const allMessages = await readSmsInbox();
    const boundaryMessage = allMessages[1];
    expect(boundaryMessage).toBeDefined();

    const messages = await readSmsInbox({ minDate: boundaryMessage?.date });

    expect(messages.map((message) => message.id)).toContain(
      boundaryMessage?.id
    );
    expect(
      messages.every((message) => message.date >= (boundaryMessage?.date ?? 0))
    ).toBe(true);
  });

  it("applies fixture inbox maxCount after native-like newest-first ordering", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox({ maxCount: 1 });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "e2e-pr622_batch_duplicate_shop-1",
      address: "NBE",
      body: "Purchase EGP 33.33 on card **** 4321 at PR622 BATCH DUPLICATE SHOP on 08/04 17:01. Avail bal EGP 12,397.22",
    });
  });

  it("keeps the fixture inbox disabled on iOS", async (): Promise<void> => {
    enableFixtureSmsInbox();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });

    const messages = await readSmsInbox();

    expect(mockNativeSmsList).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it("applies fixture inbox sender and scan-window filters", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();

    const messages = await readSmsInbox({
      address: "NBE",
      minDate: JULY_6_2026_16_10,
    });

    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.address === "NBE")).toBe(true);
    expect(messages.every((message) => message.date >= JULY_6_2026_16_10)).toBe(
      true
    );
  });

  it("keeps fixture timestamps stable when scans use minDate filters", async (): Promise<void> => {
    enableFixtureSmsInbox();
    freezeFixtureInboxClock();

    const firstScan = await readSmsInbox();
    const filteredScan = await readSmsInbox({
      minDate: JULY_6_2026_16_10,
    });
    const firstDuplicate = firstScan.find(
      (message) => message.id === "e2e-pr622_batch_duplicate_shop-1"
    );
    const filteredDuplicate = filteredScan.find(
      (message) => message.id === "e2e-pr622_batch_duplicate_shop-1"
    );

    expect(filteredDuplicate?.date).toBe(firstDuplicate?.date);
  });
});
