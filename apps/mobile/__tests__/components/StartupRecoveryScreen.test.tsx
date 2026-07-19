/**
 * Unit tests for StartupRecoveryScreen.
 *
 * Regression guard: the status chip must use a dedicated translation key, not
 * a substring of the title. The old `.split(" ").slice(-2)` approach breaks on
 * Arabic (RTL + different word order).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { top: number; bottom: number } => ({
    top: 0,
    bottom: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

import { StartupRecoveryScreen } from "@/components/ui/StartupRecoveryScreen";

describe("StartupRecoveryScreen", () => {
  it("invokes onRetry when the profile-loading retry button is pressed", () => {
    const onRetry = jest.fn();
    const onSignOut = jest.fn();

    render(
      <StartupRecoveryScreen
        reason="profile-loading"
        onRetry={onRetry}
        onSignOut={onSignOut}
      />
    );

    fireEvent.press(screen.getByLabelText("retry_loading_profile"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("invokes onRetry when the startup-loading retry button is pressed", () => {
    const onRetry = jest.fn();
    const onSignOut = jest.fn();

    render(
      <StartupRecoveryScreen
        reason="startup-loading"
        onRetry={onRetry}
        onSignOut={onSignOut}
      />
    );

    fireEvent.press(screen.getByLabelText("retry_startup_loading"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("invokes onRetry when the market-rate recovery action is pressed", () => {
    const onRetry = jest.fn();
    const onSignOut = jest.fn();

    render(
      <StartupRecoveryScreen
        reason="market-rates-unavailable"
        onRetry={onRetry}
        onSignOut={onSignOut}
      />
    );

    fireEvent.press(screen.getByLabelText("retry_market_rates"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("invokes onSignOut when the Sign out button is pressed", () => {
    const onRetry = jest.fn();
    const onSignOut = jest.fn();

    render(
      <StartupRecoveryScreen
        reason="profile-loading"
        onRetry={onRetry}
        onSignOut={onSignOut}
      />
    );

    fireEvent.press(screen.getByLabelText("sign_out"));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders profile-loading recovery copy for missing-profile recovery", () => {
    render(
      <StartupRecoveryScreen
        reason="profile-loading"
        onRetry={jest.fn()}
        onSignOut={jest.fn()}
      />
    );

    expect(screen.getByText("profile_loading_failed_chip")).toBeTruthy();
    expect(screen.getByText("profile_loading_failed_title")).toBeTruthy();
    expect(screen.getByText("profile_loading_failed_description")).toBeTruthy();
    expect(screen.getByText("profile_loading_helper_text")).toBeTruthy();
  });

  it("renders startup-loading recovery copy for sync/setup retry", () => {
    render(
      <StartupRecoveryScreen
        reason="startup-loading"
        onRetry={jest.fn()}
        onSignOut={jest.fn()}
      />
    );

    expect(screen.getByText("startup_loading_failed_chip")).toBeTruthy();
    expect(screen.getByText("startup_loading_failed_title")).toBeTruthy();
    expect(screen.getByText("startup_loading_failed_description")).toBeTruthy();
    expect(screen.getByText("startup_loading_helper_text")).toBeTruthy();
  });

  it("renders dedicated market-rate recovery copy", () => {
    render(
      <StartupRecoveryScreen
        reason="market-rates-unavailable"
        onRetry={jest.fn()}
        onSignOut={jest.fn()}
      />
    );

    expect(screen.getByText("market_rates_unavailable_chip")).toBeTruthy();
    expect(screen.getByText("market_rates_unavailable_title")).toBeTruthy();
    expect(
      screen.getByText("market_rates_unavailable_description")
    ).toBeTruthy();
    expect(
      screen.getByText("market_rates_unavailable_helper_text")
    ).toBeTruthy();
  });
});
