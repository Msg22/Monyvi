import React from "react";
import { Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createLanguageCoordinator } from "@/services/language-coordinator";
import { useLanguageScope } from "@/hooks/useLocaleStartup";
import {
  PublicLanguageBoundary,
  PrivateLanguageBoundary,
} from "@/components/LanguageRuntimeBoundary";

const mockHide = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
let mockUser: { readonly id: string } | null = null;
const mockTranslate = jest.fn().mockResolvedValue(undefined);
const mockCoordinator = createLanguageCoordinator({
  translate: mockTranslate,
  normalizeDirection: jest.fn(),
  needsReload: (): boolean => false,
  reload: jest.fn(),
  readMarker: jest.fn().mockResolvedValue(null),
  writeMarker: jest.fn(),
  clearMarker: jest.fn(),
});
jest.mock("@/services/language-runtime-service", (): object => ({
  get languageCoordinator(): typeof mockCoordinator {
    return mockCoordinator;
  },
}));
jest.mock("@/context/AuthContext", (): object => ({
  useAuth: (): object => ({
    user: mockUser,
    isLoading: false,
    isAuthenticated: mockUser !== null,
  }),
}));
jest.mock("@/services/intro-flag-service", (): object => ({
  readIntroLocaleOverride: jest.fn().mockResolvedValue("en"),
}));
let mockPreferredLanguage: {
  readonly language: "en" | "ar" | null;
  readonly profileExists: boolean;
  readonly isLoading: boolean;
  readonly hasError: boolean;
} = {
  language: null,
  profileExists: false,
  isLoading: false,
  hasError: true,
};
jest.mock("@/hooks/usePreferredLanguage", (): object => ({
  usePreferredLanguage: (): object => mockPreferredLanguage,
}));

jest.mock("@/hooks/useProfile", (): object => ({
  useProfile: (): object => ({
    profile: { preferredLanguage: "en" },
    isLoading: false,
  }),
}));
jest.mock("@/providers/SyncProvider", (): object => ({
  useSync: (): object => ({ initialSyncState: "success" }),
}));
jest.mock("@/utils/rtl", (): object => ({
  getDeviceLanguage: (): string => "en",
}));
jest.mock("expo-splash-screen", (): object => ({
  hideAsync: (): Promise<void> => mockHide(),
}));
jest.mock("@/components/LanguageFailureNotice", (): object => ({
  LanguageFailureNotice: (): null => null,
}));
jest.mock("@/components/ui/Skeleton", (): object => ({
  Skeleton: (): null => null,
}));
jest.mock("@/utils/logger", (): object => ({ logger: { warn: jest.fn() } }));

function ScopeOwner({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactNode {
  useLanguageScope();
  return children;
}

describe("locale startup integration", (): void => {
  beforeEach((): void => {
    mockUser = null;
    mockCoordinator.setScope(null);
    jest.clearAllMocks();
  });
  it("keeps explicit public selection after bootstrap on a platform without reload", async (): Promise<void> => {
    render(
      <ScopeOwner>
        <PublicLanguageBoundary>
          <Text>Public controls</Text>
        </PublicLanguageBoundary>
      </ScopeOwner>
    );
    await waitFor(() =>
      expect(screen.getByText("Public controls")).toBeOnTheScreen()
    );
    await act(async (): Promise<void> => {
      await mockCoordinator.apply("ar", {
        persist: (): Promise<void> => Promise.resolve(),
      });
    });
    expect(mockCoordinator.getSnapshot()).toMatchObject({
      phase: "ready",
      language: "ar",
    });
    expect(mockTranslate).toHaveBeenLastCalledWith("ar");
  });
  it("does not deadlock splash when language observation fails but normal profile succeeds", async (): Promise<void> => {
    mockUser = { id: "user-a" };
    mockPreferredLanguage = {
      language: null,
      profileExists: false,
      isLoading: false,
      hasError: true,
    };
    render(
      <ScopeOwner>
        <PrivateLanguageBoundary>
          <Text>Account gate</Text>
        </PrivateLanguageBoundary>
      </ScopeOwner>
    );
    await waitFor(() => expect(mockHide).toHaveBeenCalled());
    expect(screen.getByText("Account gate")).toBeOnTheScreen();
  });
  it("reconciles fallback language when profile exists but preferred language is null", async (): Promise<void> => {
    mockUser = { id: "user-b" };
    mockPreferredLanguage = {
      language: null,
      profileExists: true,
      isLoading: false,
      hasError: false,
    };
    render(
      <ScopeOwner>
        <PrivateLanguageBoundary>
          <Text>Account gate</Text>
        </PrivateLanguageBoundary>
      </ScopeOwner>
    );
    await waitFor(() => expect(mockTranslate).toHaveBeenCalledWith("en"));
    expect(mockCoordinator.getSnapshot()).toMatchObject({
      scope: "user-b",
      language: "en",
    });
    expect(screen.getByText("Account gate")).toBeOnTheScreen();
  });
});

