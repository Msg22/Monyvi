import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { LanguageSnapshot } from "@/services/language-coordinator";
import {
  PrivateLanguageBoundary,
  PublicLanguageBoundary,
} from "@/components/LanguageRuntimeBoundary";

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
});
