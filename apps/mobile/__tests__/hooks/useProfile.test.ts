/**
 * Unit tests for useProfile hook.
 *
 * Validates that the hook scopes the local profile observation to the
 * currently authenticated user. A foreign local profile row must never drive
 * routing.
 */

import {
  act,
  renderHook as renderTestingHook,
} from "@testing-library/react-native";

// ---------------------------------------------------------------------------
// Mock: WatermelonDB observable
// ---------------------------------------------------------------------------

let activeSubscriber: {
  next: (value: unknown[]) => void;
  error: (err: unknown) => void;
} | null = null;
const mockUnsubscribes: jest.Mock[] = [];

const mockSubscribe = jest.fn(
  (subscriber: {
    next: (value: unknown[]) => void;
    error: (err: unknown) => void;
  }) => {
    activeSubscriber = subscriber;
    const unsubscribe = jest.fn(() => {
      activeSubscriber = null;
    });
    mockUnsubscribes.push(unsubscribe);
    return {
      unsubscribe,
    };
  }
);

const mockObserve = jest.fn(() => ({ subscribe: mockSubscribe }));

const mockQuery = jest.fn(() => ({ observe: mockObserve }));
const mockWhere = jest.fn((column: string, value: unknown) => ({
  column,
  value,
}));
const mockTake = jest.fn((count: number) => ({ count }));
const mockUseAuth = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({
      query: mockQuery,
    })),
  },
  Profile: {},
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (column: string, value: unknown): unknown =>
      mockWhere(column, value),
    take: (count: number): unknown => mockTake(count),
  },
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): unknown => mockUseAuth(),
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve("current-user")),
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// Import after mocks
import { useProfile } from "../../hooks/useProfile";

// ---------------------------------------------------------------------------
// Lightweight renderHook
// ---------------------------------------------------------------------------

interface HookResult {
  profile: unknown;
  isLoading: boolean;
}

function renderHook(): {
  result: { current: HookResult };
  unmount: () => void;
  update: () => void;
} {
  const rendered = renderTestingHook(() => useProfile());

  return {
    result: rendered.result,
    unmount: rendered.unmount,
    update: () => {
      rendered.rerender({});
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  activeSubscriber = null;
  mockUnsubscribes.length = 0;
  mockUseAuth.mockReturnValue({
    user: { id: "current-user" },
    isLoading: false,
  });
});

describe("useProfile", () => {
  it("starts with isLoading=true and profile=null", () => {
    const { result } = renderHook();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.profile).toBeNull();
  });

  it("sets up a WatermelonDB observation on mount", () => {
    renderHook();
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(activeSubscriber).not.toBeNull();
  });

  it("subscribes only to the current authenticated user's profile", () => {
    renderHook();

    expect(mockQuery).toHaveBeenCalledWith(
      { column: "user_id", value: "current-user" },
      { column: "deleted", value: false },
      { count: 1 }
    );
  });

  it("does not subscribe or emit a foreign row while auth is unresolved", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    const { result } = renderHook();

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(result.current.profile).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("clears the profile and resubscribes when the authenticated user changes", () => {
    const firstProfile = { id: "profile-1", userId: "current-user" };
    const { result, update } = renderHook();

    act(() => {
      activeSubscriber?.next([firstProfile]);
    });
    expect(result.current.profile).toBe(firstProfile);
    expect(result.current.isLoading).toBe(false);

    mockUseAuth.mockReturnValue({
      user: { id: "next-user" },
      isLoading: false,
    });

    update();

    expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(result.current.profile).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(mockQuery).toHaveBeenLastCalledWith(
      { column: "user_id", value: "next-user" },
      { column: "deleted", value: false },
      { count: 1 }
    );
  });

  it("does not emit foreign profile rows from the scoped observation", () => {
    const { result } = renderHook();

    act(() => {
      activeSubscriber?.next([]);
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("rerenders consumers when Watermelon emits an updated same profile instance", () => {
    const profile = {
      id: "profile-1",
      userId: "current-user",
      aiProcessingConsentRaw: null as string | null,
    };
    const rendered = renderTestingHook(() => {
      const { profile: currentProfile } = useProfile();
      return (
        (currentProfile as typeof profile | null)?.aiProcessingConsentRaw ??
        null
      );
    });

    act(() => {
      activeSubscriber?.next([profile]);
    });

    expect(rendered.result.current).toBeNull();

    profile.aiProcessingConsentRaw = JSON.stringify({
      version: 1,
      consentedAt: "2026-07-07T10:00:00.000Z",
      revokedAt: null,
    });

    act(() => {
      activeSubscriber?.next([profile]);
    });

    expect(rendered.result.current).toBe(profile.aiProcessingConsentRaw);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook();

    unmount();

    expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
  });
});
