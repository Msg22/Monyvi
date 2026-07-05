import { render, screen } from "@testing-library/react-native";
import React from "react";

import { SmsPermissionPrompt } from "@/components/sms-sync/SmsPermissionPrompt";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({
    top: 0,
    right: 0,
    bottom: 24,
    left: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("SmsPermissionPrompt", () => {
  it("keeps the first-run auto-track prompt clear of the Android navigation bar", () => {
    render(
      <SmsPermissionPrompt
        visible
        onPermissionGranted={jest.fn()}
        onDismiss={jest.fn()}
        requestPermission={jest.fn(() => Promise.resolve("granted"))}
      />
    );

    expect(screen.getByTestId("sms-permission-prompt-sheet")).toHaveStyle({
      paddingBottom: 64,
    });
  });
});
