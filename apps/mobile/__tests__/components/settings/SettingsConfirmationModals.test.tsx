import React, { type ReactNode } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { SettingsConfirmationModals } from "@/components/settings/SettingsConfirmationModals";

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: ({
    visible,
    title,
    message,
  }: {
    readonly visible: boolean;
    readonly title: string;
    readonly message: string;
  }): ReactNode =>
    visible ? <Text testID={`confirmation-${title}`}>{message}</Text> : null,
}));

const t = (key: string, opts?: Record<string, unknown>): string => {
  const days = typeof opts?.days === "number" ? opts.days : null;
  return days === null ? key : `${key}:${days}`;
};

function createProps(lookbackDays: number): Readonly<Record<string, unknown>> {
  return {
    dismissForceLogoutError: jest.fn(),
    dismissSyncWarning: jest.fn(),
    forceLogout: jest.fn(() => Promise.resolve()),
    isAiDisableConfirmOpen: false,
    isFullRescanModalOpen: true,
    onCancelAiDisableConfirm: jest.fn(),
    onCancelFullRescan: jest.fn(),
    onConfirmAiDisable: jest.fn(),
    onConfirmFullRescan: jest.fn(),
    showForceLogoutError: false,
    showSyncWarning: false,
    t,
    tCommon: (key: string): string => key,
    lookbackDays,
  };
}

describe("SettingsConfirmationModals", () => {
  it.each([30, 60, 17])(
    "interpolates the supplied %i-day effective scan window in the rescan message",
    (lookbackDays) => {
      render(
        React.createElement(
          SettingsConfirmationModals,
          createProps(lookbackDays)
        )
      );

      expect(
        screen.getByTestId("confirmation-rescan_title").props.children
      ).toBe(`rescan_message:${lookbackDays}`);
    }
  );
});
