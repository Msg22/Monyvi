import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { AppReadyGate } from "@/components/AppReadyGate";
import * as SplashScreen from "expo-splash-screen";

let mockAuthLoading = false;
let mockProfile: object | null = {};
let mockProfileLoading = false;
let mockSyncState = "success";
let mockPhase = "ready";
let mockScope = "user-a";
jest.mock("expo-splash-screen", (): object => ({
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/context/AuthContext", (): object => ({
  useAuth: (): object => ({
    isLoading: mockAuthLoading,
    isAuthenticated: true,
    user: { id: "user-a" },
  }),
}));
jest.mock("@/hooks/useProfile", (): object => ({
  useProfile: (): object => ({
    profile: mockProfile,
    isLoading: mockProfileLoading,
  }),
}));
jest.mock("@/providers/SyncProvider", (): object => ({
  useSync: (): object => ({ initialSyncState: mockSyncState }),
}));
jest.mock("@/hooks/useLanguageRuntime", (): object => ({
  useLanguageState: (): object => ({ scope: mockScope, phase: mockPhase }),
}));
jest.mock("@/utils/logger", (): object => ({ logger: { warn: jest.fn() } }));

describe("AppReadyGate", (): void => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockAuthLoading = false;
    mockProfile = {};
    mockProfileLoading = false;
    mockSyncState = "success";
    mockPhase = "ready";
    mockScope = "user-a";
  });
  it.each(["resolving", "applying", "restarting"])(
    "keeps splash for locale %s",
    (phase): void => {
      mockPhase = phase;
      render(<AppReadyGate />);
      expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    }
  );
  it("hides splash after account and locale settle", async (): Promise<void> => {
    render(<AppReadyGate />);
    await waitFor(() =>
      expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
    );
  });
  it("does not expose private UI for a previous user's ready locale", (): void => {
    mockScope = "other";
    render(<AppReadyGate />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
  it("direction error does not block account access", async (): Promise<void> => {
    mockPhase = "error";
    render(<AppReadyGate />);
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });
  it("language error never bypasses account startup safety", (): void => {
    mockPhase = "error";
    mockSyncState = "in-progress";
    render(<AppReadyGate />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
  it("shows missing-profile recovery without waiting for nonexistent language", async (): Promise<void> => {
    mockProfile = null;
    mockPhase = "resolving";
    mockSyncState = "failed";
    render(<AppReadyGate />);
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });
  it("settled locale cannot bypass unresolved auth", (): void => {
    mockAuthLoading = true;
    render(<AppReadyGate isLocaleSettled />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
  it("settled locale cannot bypass loading profile", (): void => {
    mockProfileLoading = true;
    render(<AppReadyGate isLocaleSettled />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });
  it("hides splash once on sync timeout and remains idempotent on rerender", async (): Promise<void> => {
    mockSyncState = "timeout";
    const { rerender } = render(<AppReadyGate isLocaleSettled />);
    await waitFor(() =>
      expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
    );
    rerender(<AppReadyGate isLocaleSettled />);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
