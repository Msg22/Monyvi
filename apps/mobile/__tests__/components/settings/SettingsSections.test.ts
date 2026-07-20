import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  formatSmsAvailabilityTime,
  getSmsSyncDescription,
  SmsSyncSettingsSection,
} from "@/components/settings/SettingsSections";

const t = jest.fn((key: string, opts?: Record<string, unknown>): string => {
  const date = typeof opts?.date === "string" ? opts.date : null;
  return date ? `${key}:${date}` : key;
});

describe("SettingsSections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls back to scan prompt when last sync timestamp is invalid", () => {
    expect(
      getSmsSyncDescription(t, {
        hasSynced: true,
        lastSyncTimestamp: Number.NaN,
        smsPermissionStatus: "granted",
      })
    ).toBe("scan_inbox");
  });

  it("falls back to permission prompt when timestamp is invalid and SMS permission is missing", () => {
    expect(
      getSmsSyncDescription(t, {
        hasSynced: true,
        lastSyncTimestamp: Number.NaN,
        smsPermissionStatus: "denied",
      })
    ).toBe("grant_sms_permission");
  });

  it("renders separate incremental and rolling-history actions without plan or range controls", () => {
    const onIncrementalSync = jest.fn();
    const onHistoryRescanPress = jest.fn();
    render(
      React.createElement(SmsSyncSettingsSection, {
        t,
        hasSynced: true,
        chevronColor: "black",
        onIncrementalSync,
        onHistoryRescanPress,
      })
    );

    expect(screen.getByText("sync_new_description")).toBeTruthy();
    expect(screen.getByText("rescan_recent")).toBeTruthy();
    expect(screen.getByText("rescan_recent_description")).toBeTruthy();
    expect(screen.queryByText("custom_range")).toBeNull();
    expect(screen.queryByText("upgrade")).toBeNull();

    fireEvent.press(screen.getByTestId("sms-sync-button"));
    fireEvent.press(screen.getByTestId("sms-history-rescan-button"));

    expect(onIncrementalSync).toHaveBeenCalledTimes(1);
    expect(onHistoryRescanPress).toHaveBeenCalledTimes(1);
  });

  it("keeps recent history visible but disabled until the localized server availability time", () => {
    const onHistoryRescanPress = jest.fn();
    render(
      React.createElement(SmsSyncSettingsSection, {
        t,
        hasSynced: true,
        chevronColor: "black",
        onIncrementalSync: jest.fn(),
        onHistoryRescanPress,
        historyRescanAvailableAt: "2026-07-21T16:30:00.000Z",
        language: "en",
      })
    );

    expect(screen.getByTestId("sms-history-rescan-button")).toBeDisabled();
    expect(screen.getByText(/rescan_recent_available_at:/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("sms-history-rescan-button"));
    expect(onHistoryRescanPress).not.toHaveBeenCalled();
  });

  it("formats availability as an absolute localized time without a countdown", () => {
    const availableAt = "2026-07-21T16:30:00.000Z";
    const english = formatSmsAvailabilityTime(availableAt, "en");
    const arabic = formatSmsAvailabilityTime(availableAt, "ar");

    expect(english).not.toBeNull();
    expect(arabic).not.toBeNull();
    expect(english).not.toBe(arabic);
    expect(english).not.toMatch(/in \d+|remaining/i);
    expect(formatSmsAvailabilityTime("invalid", "en")).toBeNull();
  });
});
