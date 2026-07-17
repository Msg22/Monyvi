import type { ParsedSmsTransaction } from "@monyvi/logic";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";

let mockRegisteredHandler:
  | ((
      actionId: string,
      payload: TransactionNotificationPayload
    ) => Promise<void>)
  | null = null;

interface TransactionNotificationPayload {
  readonly type: "sms_transaction";
  readonly transactionData: NotificationParsedSmsTransaction;
  readonly resolvedAccountId: string;
  readonly resolvedAccountName: string;
  readonly initiatingUserId: string;
}

type NotificationParsedSmsTransaction = Omit<
  ParsedSmsTransaction,
  "date" | "rawSmsBody"
> & {
  readonly date: Date | string | number | null;
};

type NotificationActionHandler = (
  actionId: string,
  payload: TransactionNotificationPayload
) => Promise<void>;

interface SmsAtmTransferResult {
  readonly success: boolean;
}

const mockCreateTransaction = jest.fn<Promise<unknown>, [unknown, string?]>();
const mockCreateSmsAtmTransfer = jest.fn<
  Promise<SmsAtmTransferResult>,
  [unknown]
>();
const mockHasExistingSmsFingerprint = jest.fn<Promise<boolean>, [string]>();
const mockGetNotificationPermissionStatus = jest.fn<
  Promise<"undetermined" | "granted" | "denied" | "blocked">,
  []
>();
const mockResolveAccountForSms = jest.fn<Promise<unknown>, unknown[]>();
const mockShowTransactionNotification = jest.fn<Promise<void>, unknown[]>();
const mockShowTransactionCreatedNotification = jest.fn<
  Promise<void>,
  unknown[]
>();
const mockShowTransactionNeedsAccountNotification = jest.fn<
  Promise<void>,
  unknown[]
>();
const mockGetCurrentUserId = jest.fn<Promise<string | null>, []>();

jest.mock("@/services/notification-service", () => ({
  ACTION_CONFIRM: "CONFIRM",
  registerNotificationActionHandler: jest.fn(
    (handler: NotificationActionHandler) => {
      mockRegisteredHandler = handler;
      return jest.fn();
    }
  ),
  getNotificationPermissionStatus: () => mockGetNotificationPermissionStatus(),
  showTransactionNotification: (...args: unknown[]) =>
    mockShowTransactionNotification(...args),
  showTransactionCreatedNotification: (...args: unknown[]) =>
    mockShowTransactionCreatedNotification(...args),
  showTransactionNeedsAccountNotification: (...args: unknown[]) =>
    mockShowTransactionNeedsAccountNotification(...args),
}));

jest.mock("@/services/sms-account-resolver", () => ({
  resolveAccountForSms: (...args: unknown[]) =>
    mockResolveAccountForSms(...args),
}));

jest.mock("@/services/sms-dedup-service", () => ({
  hasExistingSmsFingerprint: (smsFingerprint: string): Promise<boolean> =>
    mockHasExistingSmsFingerprint(smsFingerprint),
}));

jest.mock("@/services/transaction-service", () => ({
  createTransaction: (
    input: unknown,
    expectedUserId?: string
  ): Promise<unknown> => mockCreateTransaction(input, expectedUserId),
}));

jest.mock("@/services/transfer-service", () => ({
  createSmsAtmTransfer: (input: unknown): Promise<SmsAtmTransferResult> =>
    mockCreateSmsAtmTransfer(input),
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => mockGetCurrentUserId(),
}));

import {
  handleDetectedSms,
  initializeDetectionActionHandler,
  isAutoConfirmEnabled,
  isLiveDetectionEnabled,
  reconcileLiveDetectionPreference,
  setAutoConfirm,
  setLiveDetectionEnabled,
} from "@/services/sms-live-detection-handler";

function createParsedSmsTransaction(): ParsedSmsTransaction {
  return {
    amount: 413,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "LIVE TEST MARKET",
    date: new Date("2026-05-03T12:00:00.000Z"),
    categoryId: "category-1",
    categoryDisplayName: "Shopping",
    confidence: 0.95,
    originLabel: "NBE",
    source: "SMS",
    smsFingerprint: "hash-1",
    senderDisplayName: "NBE",
    rawSmsBody: "Purchase EGP 413.00 at LIVE TEST MARKET",
  };
}

function createPayload(
  transactionData: NotificationParsedSmsTransaction = createNotificationParsedSmsTransaction()
): TransactionNotificationPayload {
  return {
    type: "sms_transaction",
    transactionData,
    resolvedAccountId: "account-1",
    resolvedAccountName: "MainCIBAccount",
    initiatingUserId: "user-1",
  };
}

function createNotificationParsedSmsTransaction(): NotificationParsedSmsTransaction {
  const { rawSmsBody: _rawSmsBody, ...transactionData } =
    createParsedSmsTransaction();
  return transactionData;
}

function getRegisteredHandler(): NotificationActionHandler {
  if (!mockRegisteredHandler) {
    throw new Error("Expected notification action handler to be registered");
  }

  return mockRegisteredHandler;
}

describe("sms-live-detection-handler notification actions", () => {
  beforeEach(() => {
    mockRegisteredHandler = null;
    void AsyncStorage.clear();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
    jest
      .spyOn(PermissionsAndroid, "check")
      .mockImplementation((permission) =>
        Promise.resolve(permission === PermissionsAndroid.PERMISSIONS.READ_SMS)
      );
    mockGetNotificationPermissionStatus.mockReset();
    mockGetNotificationPermissionStatus.mockResolvedValue("granted");
    mockResolveAccountForSms.mockReset();
    mockResolveAccountForSms.mockResolvedValue({
      accountId: "account-1",
      accountName: "MainCIBAccount",
      matchReason: "sms_sender",
    });
    mockShowTransactionNotification.mockReset();
    mockShowTransactionNotification.mockResolvedValue();
    mockShowTransactionCreatedNotification.mockReset();
    mockShowTransactionCreatedNotification.mockResolvedValue();
    mockShowTransactionNeedsAccountNotification.mockReset();
    mockShowTransactionNeedsAccountNotification.mockResolvedValue();
    mockGetCurrentUserId.mockReset();
    mockGetCurrentUserId.mockResolvedValue("user-1");
    mockHasExistingSmsFingerprint.mockReset();
    mockHasExistingSmsFingerprint.mockResolvedValue(false);
    mockCreateTransaction.mockReset();
    mockCreateTransaction.mockResolvedValue({});
    mockCreateSmsAtmTransfer.mockReset();
    mockCreateSmsAtmTransfer.mockResolvedValue({ success: true });
  });

  it("passes the SMS fingerprint when confirming a regular SMS transaction", async () => {
    initializeDetectionActionHandler();

    await getRegisteredHandler()("CONFIRM", createPayload());

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "SMS",
        smsFingerprint: "hash-1",
      }),
      "user-1"
    );
  });

  it("confirms a notification transaction without raw SMS body payload data", async () => {
    initializeDetectionActionHandler();

    await getRegisteredHandler()("CONFIRM", createPayload());

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "SMS",
        smsFingerprint: "hash-1",
      }),
      "user-1"
    );
  });

  it("restores the SMS date when confirming a serialized notification payload", async () => {
    initializeDetectionActionHandler();
    const parsed = createNotificationParsedSmsTransaction();
    const serializedPayload = createPayload({
      ...parsed,
      date: "2026-05-03T12:00:00.000Z",
    });

    await getRegisteredHandler()("CONFIRM", serializedPayload);

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date("2026-05-03T12:00:00.000Z"),
      }),
      "user-1"
    );
  });

  it("passes the SMS fingerprint when confirming an ATM withdrawal transfer", async () => {
    initializeDetectionActionHandler();
    const atmWithdrawal = {
      ...createParsedSmsTransaction(),
      isAtmWithdrawal: true,
    };

    await getRegisteredHandler()("CONFIRM", createPayload(atmWithdrawal));

    expect(mockCreateSmsAtmTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        smsFingerprint: "hash-1",
        senderDisplayName: "NBE",
      })
    );
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it("does not write financial records when discarding a notification", async () => {
    initializeDetectionActionHandler();

    await getRegisteredHandler()("DISCARD", createPayload());

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateSmsAtmTransfer).not.toHaveBeenCalled();
    expect(mockHasExistingSmsFingerprint).not.toHaveBeenCalled();
  });

  it("does not confirm a notification created for another user", async () => {
    initializeDetectionActionHandler();
    mockGetCurrentUserId.mockResolvedValue("user-2");

    await getRegisteredHandler()("CONFIRM", createPayload());

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateSmsAtmTransfer).not.toHaveBeenCalled();
    expect(mockHasExistingSmsFingerprint).not.toHaveBeenCalled();
  });

  it("does not save again when an SMS fingerprint already exists", async () => {
    mockHasExistingSmsFingerprint.mockResolvedValueOnce(true);
    initializeDetectionActionHandler();

    await getRegisteredHandler()("CONFIRM", createPayload());

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateSmsAtmTransfer).not.toHaveBeenCalled();
  });

  it("serializes concurrent saves for the same SMS fingerprint", async () => {
    mockHasExistingSmsFingerprint.mockImplementation(() =>
      Promise.resolve(mockCreateTransaction.mock.calls.length > 0)
    );
    initializeDetectionActionHandler();
    const handler = getRegisteredHandler();

    await Promise.all([
      handler("CONFIRM", createPayload()),
      handler("CONFIRM", createPayload()),
    ]);

    expect(mockHasExistingSmsFingerprint).toHaveBeenCalledTimes(2);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
  });

  it("auto-confirms and notifies the user that the transaction was created", async () => {
    await setAutoConfirm(true);
    const parsed = createParsedSmsTransaction();

    await handleDetectedSms(parsed, "user-1");

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ smsFingerprint: "hash-1" }),
      "user-1"
    );
    expect(mockShowTransactionCreatedNotification).toHaveBeenCalledWith(
      parsed,
      "MainCIBAccount",
      "user-1"
    );
    expect(mockShowTransactionNotification).not.toHaveBeenCalled();
  });

  it("pins no-account notifications to the initiating user", async () => {
    const parsed = createParsedSmsTransaction();
    mockResolveAccountForSms.mockResolvedValueOnce(null);

    await handleDetectedSms(parsed, "user-1");

    expect(mockShowTransactionNeedsAccountNotification).toHaveBeenCalledWith(
      parsed,
      "user-1"
    );
  });

  it("drops live work pinned to a different authenticated user", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-2");

    await handleDetectedSms(createParsedSmsTransaction(), "user-1");

    expect(mockResolveAccountForSms).not.toHaveBeenCalled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockShowTransactionNotification).not.toHaveBeenCalled();
  });

  it("does not write when the user changes during fingerprint lookup", async () => {
    await setAutoConfirm(true);
    mockGetCurrentUserId
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValue("user-2");

    await handleDetectedSms(createParsedSmsTransaction(), "user-1");

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockShowTransactionCreatedNotification).not.toHaveBeenCalled();
  });

  it("does not notify the next user after the initiating user's save", async () => {
    await setAutoConfirm(true);
    mockGetCurrentUserId
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce("user-1")
      .mockResolvedValue("user-2");

    await handleDetectedSms(createParsedSmsTransaction(), "user-1");

    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockShowTransactionCreatedNotification).not.toHaveBeenCalled();
  });

  it("passes the parser card hint into live account resolution", async () => {
    const parsed = {
      ...createParsedSmsTransaction(),
      cardLast4: "4321",
    };

    await handleDetectedSms(parsed, "user-1");

    expect(mockResolveAccountForSms).toHaveBeenCalledWith(
      "NBE",
      parsed.rawSmsBody,
      "EGP",
      "4321",
      "user-1"
    );
  });

  it("keeps needs-review live suggestions out of auto-confirm", async () => {
    await setAutoConfirm(true);
    const parsed = {
      ...createParsedSmsTransaction(),
      reviewStatus: "needs_review" as const,
      reviewReasons: ["low_confidence" as const],
    };

    await handleDetectedSms(parsed, "user-1");

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockShowTransactionCreatedNotification).not.toHaveBeenCalled();
    expect(mockShowTransactionNotification).toHaveBeenCalledWith(
      parsed,
      "account-1",
      "MainCIBAccount",
      "user-1"
    );
  });

  it("keeps default-account fallbacks out of live auto-confirm", async () => {
    await setAutoConfirm(true);
    mockResolveAccountForSms.mockResolvedValueOnce({
      accountId: "account-1",
      accountName: "MainCIBAccount",
      matchReason: "default",
    });
    const parsed = {
      ...createParsedSmsTransaction(),
      reviewStatus: "auto_selectable" as const,
      reviewReasons: [],
    };

    await handleDetectedSms(parsed, "user-1");

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockShowTransactionCreatedNotification).not.toHaveBeenCalled();
    expect(mockShowTransactionNotification).toHaveBeenCalledWith(
      parsed,
      "account-1",
      "MainCIBAccount",
      "user-1"
    );
  });

  it("keeps low-confidence AI suggestions out of live auto-confirm", async () => {
    await setAutoConfirm(true);
    const parsed = {
      ...createParsedSmsTransaction(),
      confidence: 0.3,
      reviewStatus: undefined,
      reviewReasons: undefined,
    };

    await handleDetectedSms(parsed, "user-1");

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockShowTransactionCreatedNotification).not.toHaveBeenCalled();
    expect(mockShowTransactionNotification).toHaveBeenCalledWith(
      parsed,
      "account-1",
      "MainCIBAccount",
      "user-1"
    );
  });

  it("auto-disables stored live detection when required SMS permission is missing", async () => {
    await setLiveDetectionEnabled(true);
    await setAutoConfirm(true);

    await expect(reconcileLiveDetectionPreference()).resolves.toBe(false);

    await expect(isLiveDetectionEnabled()).resolves.toBe(false);
    await expect(isAutoConfirmEnabled()).resolves.toBe(false);
  });

  it("keeps live detection and auto-confirm preferences scoped to the current user", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-1");
    await setLiveDetectionEnabled(true);
    await setAutoConfirm(true);

    mockGetCurrentUserId.mockResolvedValue("user-2");

    await expect(isLiveDetectionEnabled()).resolves.toBe(false);
    await expect(isAutoConfirmEnabled()).resolves.toBe(false);

    await setLiveDetectionEnabled(false);
    await setAutoConfirm(false);

    mockGetCurrentUserId.mockResolvedValue("user-1");

    await expect(isLiveDetectionEnabled()).resolves.toBe(true);
    await expect(isAutoConfirmEnabled()).resolves.toBe(true);
  });

  it("keeps stored live detection enabled when SMS and notification permissions are granted", async () => {
    jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
    await setLiveDetectionEnabled(true);

    await expect(reconcileLiveDetectionPreference()).resolves.toBe(true);

    await expect(isLiveDetectionEnabled()).resolves.toBe(true);
  });

  it("auto-disables stored live detection when notification permission is missing", async () => {
    jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);
    mockGetNotificationPermissionStatus.mockResolvedValue("denied");
    await setLiveDetectionEnabled(true);

    await expect(reconcileLiveDetectionPreference()).resolves.toBe(false);

    await expect(isLiveDetectionEnabled()).resolves.toBe(false);
  });
});
