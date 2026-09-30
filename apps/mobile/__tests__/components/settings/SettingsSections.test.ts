import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  formatSmsAvailabilityTime,
  getSmsSyncDescription,
  SmsSyncSettingsSection,
} from "@/components/settings/SettingsSections";

const t = jest.fn((key: string, opts?: Record<string, unknown>): string => {
  const days = typeof opts?.days === "number" ? opts.days : null;
  if (days !== null) return `${key}:${days}`;
  const date = typeof opts?.date === "string" ? opts.date : null;
  return date ? `${key}:${date}` : key;
});

type SmsSyncSettingsSectionProps = React.ComponentProps<
  typeof SmsSyncSettingsSection
>;

function createSmsSyncSectionProps(
  lookbackDays: number,
  overrides: Readonly<Partial<SmsSyncSettingsSectionProps>> = {}
): SmsSyncSettingsSectionProps {
  return {
    t,
    hasSynced: true,
    chevronColor: "black",
    onIncrementalSync: jest.fn(),
    onHistoryRescanPress: jest.fn(),
    lookbackDays,
    ...overrides,
  };
}

function assertLocaleDaysToken(
  settings: Readonly<Record<string, unknown>>,
  locale: "en" | "ar",
  key: string
): void {
  const value = settings[key];
  expect(typeof value).toBe("string");
  expect(value).toContain("{{days}}");
  expect(value).not.toContain("30");
  if (locale === "ar") {
    expect(value).not.toContain("٣٠");
  }
}

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
      React.createElement(
        SmsSyncSettingsSection,
        createSmsSyncSectionProps(60, {
          onIncrementalSync,
          onHistoryRescanPress,
        })
      )
    );

    expect(screen.getByText("sync_new_description:60")).toBeTruthy();
    expect(screen.getByText("rescan_recent")).toBeTruthy();
    expect(screen.getByText("rescan_recent_description:60")).toBeTruthy();
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
      React.createElement(
        SmsSyncSettingsSection,
        createSmsSyncSectionProps(30, {
          onIncrementalSync: jest.fn(),
          onHistoryRescanPress,
          historyRescanAvailableAt: "2026-07-21T16:30:00.000Z",
          language: "en",
        })
      )
    );

    expect(screen.getByTestId("sms-history-rescan-button")).toBeDisabled();
    expect(screen.getByText(/rescan_recent_available_at:/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("sms-history-rescan-button"));
    expect(onHistoryRescanPress).not.toHaveBeenCalled();
  });

  it("uses the supplied effective lookback day count for both SMS actions", () => {
    render(
      React.createElement(
        SmsSyncSettingsSection,
        createSmsSyncSectionProps(17)
      )
    );

    expect(screen.getByText("sync_new_description:17")).toBeTruthy();
    expect(screen.getByText("rescan_recent_description:17")).toBeTruthy();
  });

  it("keeps EN and AR SMS sync copy parameterized by the day prop", () => {
    for (const locale of ["en", "ar"] as const) {
      const settings = JSON.parse(
        readFileSync(
          path.resolve(__dirname, `../../../locales/${locale}/settings.json`),
          "utf8"
        )
      ) as Readonly<Record<string, unknown>>;

      for (const key of [
        "sync_new_description",
        "rescan_recent_description",
        "rescan_message",
      ] as const) {
        assertLocaleDaysToken(settings, locale, key);
      }
    }
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
