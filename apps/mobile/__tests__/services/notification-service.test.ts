import type { ParsedSmsTransaction } from "@monyvi/logic";
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  ACTION_CONFIRM,
  ACTION_DISCARD,
  getNotificationPermissionStatus,
  hasNotificationPermission,
  openNotificationSettings,
  registerNotificationActionHandler,
  resetNotificationServiceForTests,
  showTransactionCreatedNotification,
  showTransactionNeedsAccountNotification,
  requestNotificationPermission,
  requestNotificationPermissionStatus,
  showTransactionNotification,
} from "@/services/notification-service";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: "high" },
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  PermissionStatus: {
    DENIED: "denied",
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
  },
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
}));

const mockOpenSettings = jest.fn<Promise<void>, []>(() => Promise.resolve());
const originalPlatformOS = Platform.OS;

const mockGetPermissionsAsync =
  Notifications.getPermissionsAsync as jest.MockedFunction<
    typeof Notifications.getPermissionsAsync
  >;
const mockRequestPermissionsAsync =
  Notifications.requestPermissionsAsync as jest.MockedFunction<
    typeof Notifications.requestPermissionsAsync
  >;
const mockScheduleNotificationAsync =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;
const mockDismissNotificationAsync =
  Notifications.dismissNotificationAsync as jest.MockedFunction<
    typeof Notifications.dismissNotificationAsync
  >;
const mockAddNotificationResponseReceivedListener =
  Notifications.addNotificationResponseReceivedListener as jest.MockedFunction<
    typeof Notifications.addNotificationResponseReceivedListener
  >;
const mockGetLastNotificationResponseAsync =
  Notifications.getLastNotificationResponseAsync as jest.MockedFunction<
    typeof Notifications.getLastNotificationResponseAsync
  >;
const mockClearLastNotificationResponseAsync =
  Notifications.clearLastNotificationResponseAsync as jest.MockedFunction<
    typeof Notifications.clearLastNotificationResponseAsync
  >;
const mockSetNotificationCategoryAsync =
  Notifications.setNotificationCategoryAsync as jest.MockedFunction<
    typeof Notifications.setNotificationCategoryAsync
  >;
const mockSetNotificationChannelAsync =
  Notifications.setNotificationChannelAsync as jest.MockedFunction<
    typeof Notifications.setNotificationChannelAsync
  >;

function getScheduledNotificationInput(): Parameters<
  typeof Notifications.scheduleNotificationAsync
>[0] {
  const scheduledNotification =
    mockScheduleNotificationAsync.mock.calls[0]?.[0];
  if (!scheduledNotification) {
    throw new Error("Expected notification to be scheduled");
  }

  return scheduledNotification;
}

function getNotificationCategoryActions(): Parameters<
  typeof Notifications.setNotificationCategoryAsync
>[1] {
  const categoryCall = mockSetNotificationCategoryAsync.mock.calls[0] as
    | Parameters<typeof Notifications.setNotificationCategoryAsync>
    | undefined;
  if (!categoryCall) {
    throw new Error("Expected notification category to be configured");
  }

  return categoryCall[1];
}

function getNotificationChannelInput(): Parameters<
  typeof Notifications.setNotificationChannelAsync
>[1] {
  const channelCall = mockSetNotificationChannelAsync.mock.calls[0] as
    | Parameters<typeof Notifications.setNotificationChannelAsync>
    | undefined;
  if (!channelCall) {
    throw new Error("Expected notification channel to be configured");
  }

  return channelCall[1];
}

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

function createNotificationResponse(
  actionIdentifier: string,
  identifier: string,
  smsFingerprint = "hash-1"
): Notifications.NotificationResponse {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier,
        content: {
          data: {
            type: "sms_transaction",
            transactionData: {
              ...createParsedSmsTransaction(),
              smsFingerprint,
            },
            resolvedAccountId: "account-1",
            resolvedAccountName: "MainCIBAccount",
          },
        },
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createPermissionStatus({
  granted,
  canAskAgain = true,
  status,
}: {
  readonly granted: boolean;
  readonly canAskAgain?: boolean;
  readonly status?: Notifications.PermissionStatus;
}): Notifications.NotificationPermissionsStatus {
  const permissionStatus = {
    granted,
    canAskAgain,
    status:
      status ??
      (granted
        ? Notifications.PermissionStatus.GRANTED
        : Notifications.PermissionStatus.DENIED),
  };
  return permissionStatus as Notifications.NotificationPermissionsStatus;
}

describe("notification-service", () => {
  beforeEach(() => {
    resetNotificationServiceForTests();
    jest.clearAllMocks();
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOS,
    });
    jest.spyOn(Linking, "openSettings").mockImplementation(mockOpenSettings);
  });

  it("reports whether notification permission is granted", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: true })
    );

    await expect(hasNotificationPermission()).resolves.toBe(true);
  });

  it("reports undetermined notification permission without requesting", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({
        granted: false,
        status: Notifications.PermissionStatus.UNDETERMINED,
      })
    );

    await expect(getNotificationPermissionStatus()).resolves.toBe(
      "undetermined"
    );
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reports denied notification permission without requesting", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({
        granted: false,
        status: Notifications.PermissionStatus.DENIED,
      })
    );

    await expect(getNotificationPermissionStatus()).resolves.toBe("denied");
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests notification permission when it is not already granted", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: false })
    );
    mockRequestPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: true })
    );

    await expect(requestNotificationPermission()).resolves.toBe(true);

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("returns blocked when notification permission cannot be requested again", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: false, canAskAgain: false })
    );

    await expect(requestNotificationPermissionStatus()).resolves.toBe(
      "blocked"
    );
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns denied when notification permission is denied but can be requested again", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: false, canAskAgain: true })
    );
    mockRequestPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: false, canAskAgain: true })
    );

    await expect(requestNotificationPermissionStatus()).resolves.toBe("denied");
  });

  it("opens app settings for notification permission recovery", async () => {
    await openNotificationSettings();

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("does not schedule an SMS notification when permission is denied", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce(
      createPermissionStatus({ granted: false })
    );

    await showTransactionNotification(
      createParsedSmsTransaction(),
      "account-1",
      "MainCIBAccount"
    );

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  describe("on Android", () => {
    beforeEach(() => {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "android",
      });
    });

    it("uses the SMS notification channel for immediate Android notifications", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionNotification(
        createParsedSmsTransaction(),
        "account-1",
        "MainCIBAccount"
      );

      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: "sms-transaction-hash-1",
          trigger: { channelId: "sms-transactions" },
        })
      );
    });

    it("lets Android use the default channel sound without a custom sound resource", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionNotification(
        createParsedSmsTransaction(),
        "account-1",
        "MainCIBAccount"
      );

      expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
        "sms-transactions",
        expect.any(Object)
      );
      expect(getNotificationChannelInput()).not.toHaveProperty("sound");
    });

    it("keeps SMS notification actions foreground-capable for killed-app responses", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionNotification(
        createParsedSmsTransaction(),
        "account-1",
        "MainCIBAccount"
      );

      const actions = getNotificationCategoryActions();
      const confirmAction = actions?.find(
        (action) => action.identifier === ACTION_CONFIRM
      );
      const discardAction = actions?.find(
        (action) => action.identifier === ACTION_DISCARD
      );

      expect(mockSetNotificationCategoryAsync).toHaveBeenCalledWith(
        "SMS_TRANSACTION",
        expect.any(Array)
      );
      expect(confirmAction?.options?.opensAppToForeground).toBe(true);
      expect(discardAction?.options?.opensAppToForeground).toBe(true);
    });

    it("schedules an info-only notification for auto-confirmed SMS transactions", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionCreatedNotification(
        createParsedSmsTransaction(),
        "MainCIBAccount"
      );

      const scheduledNotification = getScheduledNotificationInput();
      expect(scheduledNotification.identifier).toBe(
        "sms-transaction-created-hash-1"
      );
      expect(scheduledNotification.content.categoryIdentifier).toBeUndefined();
      expect(scheduledNotification.content.data).toMatchObject({
        type: "sms_transaction_created",
      });
      expect(scheduledNotification.trigger).toEqual({
        channelId: "sms-transactions",
      });
    });

    it("does not include raw SMS body in actionable notification payloads", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionNotification(
        createParsedSmsTransaction(),
        "account-1",
        "MainCIBAccount"
      );

      const scheduledNotification = getScheduledNotificationInput();
      expect(
        scheduledNotification.content.data.transactionData
      ).not.toHaveProperty("rawSmsBody");
    });

    it("does not include raw SMS body in auto-confirm info notification payloads", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionCreatedNotification(
        createParsedSmsTransaction(),
        "MainCIBAccount"
      );

      const scheduledNotification = getScheduledNotificationInput();
      expect(
        scheduledNotification.content.data.transactionData
      ).not.toHaveProperty("rawSmsBody");
    });

    it("does not include raw SMS body in account setup info notification payloads", async () => {
      mockGetPermissionsAsync.mockResolvedValueOnce(
        createPermissionStatus({ granted: true })
      );

      await showTransactionNeedsAccountNotification(
        createParsedSmsTransaction()
      );

      const scheduledNotification = getScheduledNotificationInput();
      expect(
        scheduledNotification.content.data.transactionData
      ).not.toHaveProperty("rawSmsBody");
    });
  });

  it("dismisses a notification after handling a confirm action", async () => {
    const handler = jest.fn(() => Promise.resolve());
    registerNotificationActionHandler(handler);
    const listener =
      mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(createNotificationResponse(ACTION_CONFIRM, "notification-1"));
    await flushPromises();

    expect(handler).toHaveBeenCalledWith(
      ACTION_CONFIRM,
      expect.objectContaining({
        resolvedAccountId: "account-1",
      })
    );
    expect(mockDismissNotificationAsync).toHaveBeenCalledWith("notification-1");
  });

  it("handles the last notification response when the app opens from a killed state", async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(
      createNotificationResponse(
        ACTION_CONFIRM,
        "notification-cold",
        "hash-cold"
      )
    );
    const handler = jest.fn(() => Promise.resolve());

    registerNotificationActionHandler(handler);
    await flushPromises();
    await flushPromises();

    expect(handler).toHaveBeenCalledWith(
      ACTION_CONFIRM,
      expect.objectContaining({
        resolvedAccountId: "account-1",
      })
    );
    expect(mockDismissNotificationAsync).toHaveBeenCalledWith(
      "notification-cold"
    );
    expect(mockClearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it("preserves the last notification response when cold-start handling fails", async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(
      createNotificationResponse(
        ACTION_CONFIRM,
        "notification-failed",
        "hash-failed"
      )
    );
    const handler = jest.fn(() => Promise.reject(new Error("save failed")));

    registerNotificationActionHandler(handler);
    await flushPromises();
    await flushPromises();

    expect(handler).toHaveBeenCalledWith(
      ACTION_CONFIRM,
      expect.objectContaining({
        resolvedAccountId: "account-1",
      })
    );
    expect(mockDismissNotificationAsync).not.toHaveBeenCalledWith(
      "notification-failed"
    );
    expect(mockClearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });

  it("dismisses a notification when the user discards it", async () => {
    const handler = jest.fn(() => Promise.resolve());
    registerNotificationActionHandler(handler);
    const listener =
      mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      createNotificationResponse(ACTION_DISCARD, "notification-2", "hash-2")
    );
    await flushPromises();

    expect(mockDismissNotificationAsync).toHaveBeenCalledWith("notification-2");
    expect(handler).toHaveBeenCalledWith(
      ACTION_DISCARD,
      expect.objectContaining({
        resolvedAccountId: "account-1",
      })
    );
  });

  it("keeps a notification recoverable when confirm handling fails", async () => {
    const handler = jest.fn(() => Promise.reject(new Error("save failed")));
    registerNotificationActionHandler(handler);
    const listener =
      mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      createNotificationResponse(
        ACTION_CONFIRM,
        "notification-failed",
        "hash-failed"
      )
    );
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockDismissNotificationAsync).not.toHaveBeenCalledWith(
      "notification-failed"
    );

    listener(
      createNotificationResponse(
        ACTION_CONFIRM,
        "notification-failed",
        "hash-failed"
      )
    );
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not run the action handler twice for the same SMS notification", async () => {
    const handler = jest.fn(() => Promise.resolve());
    registerNotificationActionHandler(handler);
    const listener =
      mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    const response = createNotificationResponse(
      ACTION_CONFIRM,
      "notification-3",
      "hash-3"
    );

    listener(response);
    listener(response);
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockDismissNotificationAsync).toHaveBeenCalledWith("notification-3");
  });
});
