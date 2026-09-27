import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { LanguageSnapshot } from "@/services/language-coordinator";
import {
  LanguageScopeSync,
  PrivateLanguageBoundary,
  PublicLanguageBoundary,
} from "@/components/LanguageRuntimeBoundary";

const mockUseLanguageScope = jest.fn();
let mockAuthenticated = false;
let mockMissingProfile = false;
let mockState: LanguageSnapshot = {
  phase: "resolving",
  scope: "public",
  language: "en",
  errorCode: null,
};
jest.mock("@/context/AuthContext", (): object => ({
  useAuth: (): object => ({ isAuthenticated: mockAuthenticated }),
}));
jest.mock("@/hooks/useLocaleStartup", (): object => ({
  useLanguageScope: (): void => {
    mockUseLanguageScope();
  },
  usePublicLocaleStartup: (): LanguageSnapshot => mockState,
  usePrivateLocaleStartup: (): object => ({
    state: mockState,
    isProfileUnavailable: mockMissingProfile,
  }),
}));
jest.mock("@/components/ui/Skeleton", (): object => ({
  Skeleton: (): null => null,
}));
jest.mock("@/components/AppReadyGate", (): object => ({
  AppReadyGate: (): null => null,
}));
jest.mock("@/components/LanguageFailureNotice", (): object => ({
  LanguageFailureNotice: (): null => null,
}));

describe("language content boundaries", (): void => {
  beforeEach((): void => {
    mockAuthenticated = false;
    mockMissingProfile = false;
    mockState = {
      phase: "resolving",
      scope: "public",
      language: "en",
      errorCode: null,
    };
  });
  it("withholds public controls while language is pending", (): void => {
    render(
      <PublicLanguageBoundary>
        <Text>Sign in</Text>
      </PublicLanguageBoundary>
    );
    expect(screen.queryByText("Sign in")).toBeNull();
  });
  it("mounts private providers while authenticated without first applying public language", (): void => {
    mockAuthenticated = true;
    render(
      <PublicLanguageBoundary>
        <Text>Private providers</Text>
      </PublicLanguageBoundary>
    );
    expect(screen.getByText("Private providers")).toBeOnTheScreen();
  });
  it("withholds private content during restart", (): void => {
    mockState = { ...mockState, phase: "restarting" };
    render(
      <PrivateLanguageBoundary>
        <Text>Accounts</Text>
      </PrivateLanguageBoundary>
    );
    expect(screen.queryByText("Accounts")).toBeNull();
  });
  it("allows account routing to continue after direction failure", (): void => {
    mockState = { ...mockState, phase: "error", errorCode: "direction-failed" };
    render(
      <PrivateLanguageBoundary>
        <Text>Account gate</Text>
      </PrivateLanguageBoundary>
    );
    expect(screen.getByText("Account gate")).toBeOnTheScreen();
  });
  it("keeps missing-profile account recovery reachable", (): void => {
    mockMissingProfile = true;
    render(
      <PrivateLanguageBoundary>
        <Text>Profile recovery</Text>
      </PrivateLanguageBoundary>
    );
    expect(screen.getByText("Profile recovery")).toBeOnTheScreen();
  });
  it("mounts language scope sync to invoke useLanguageScope at the auth root", (): void => {
    mockUseLanguageScope.mockClear();
    render(<LanguageScopeSync />);
    expect(mockUseLanguageScope).toHaveBeenCalledTimes(1);
  });
  it("keeps public controls mounted during applying phase after initial settlement", (): void => {
    mockState = { ...mockState, phase: "ready" };
    const { rerender } = render(
      <PublicLanguageBoundary>
        <Text>Sign in form</Text>
      </PublicLanguageBoundary>
    );
    expect(screen.getByText("Sign in form")).toBeOnTheScreen();

    mockState = { ...mockState, phase: "applying" };
    rerender(
      <PublicLanguageBoundary>
        <Text>Sign in form</Text>
      </PublicLanguageBoundary>
    );
    expect(screen.getByText("Sign in form")).toBeOnTheScreen();

    mockState = { ...mockState, phase: "restarting" };
    rerender(
      <PublicLanguageBoundary>
        <Text>Sign in form</Text>
      </PublicLanguageBoundary>
    );
    expect(screen.queryByText("Sign in form")).toBeNull();
  });
  it("keeps private content mounted during applying phase after initial settlement", (): void => {
    mockState = { ...mockState, phase: "ready" };
    const { rerender } = render(
      <PrivateLanguageBoundary>
        <Text>Dashboard</Text>
      </PrivateLanguageBoundary>
    );
    expect(screen.getByText("Dashboard")).toBeOnTheScreen();

    mockState = { ...mockState, phase: "applying" };
    rerender(
      <PrivateLanguageBoundary>
        <Text>Dashboard</Text>
      </PrivateLanguageBoundary>
    );
    expect(screen.getByText("Dashboard")).toBeOnTheScreen();
  });
});

