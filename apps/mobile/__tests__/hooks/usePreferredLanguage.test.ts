import { act, renderHook } from "@testing-library/react-native";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import type { ProfileLanguageObservation } from "@/services/profile-language-read-model-service";


let mockUserId = "a";
let mockEmit: ((observation: ProfileLanguageObservation) => void) | undefined;
let mockError: ((error: unknown) => void) | undefined;
const mockUnsubscribe = jest.fn();
jest.mock("@/hooks/useCurrentUser", (): object => ({
  useCurrentUser: (): object => ({
    userId: mockUserId,
    isResolvingUser: false,
  }),
}));
jest.mock("@/services/profile-language-read-model-service", (): object => ({
  observeProfileLanguage: (
    _user: string,
    next: typeof mockEmit,
    error: typeof mockError
  ): object => {
    mockEmit = next;
    mockError = error;
    return { unsubscribe: mockUnsubscribe };
  },
}));
jest.mock("@/utils/logger", (): object => ({ logger: { error: jest.fn() } }));

it("copies primitive language and hides previous account before effects", (): void => {
  const seen: Array<string | null> = [];
  const { result, rerender } = renderHook(() => {
    const state = usePreferredLanguage();
    seen.push(state.language);
    return state;
  });
  act((): void => {
    mockEmit?.({ language: "en", profileExists: true });
  });
  expect(result.current.language).toBe("en");
  expect(result.current.profileExists).toBe(true);
  act((): void => {
    mockEmit?.({ language: "ar", profileExists: true });
  });
  expect(result.current.language).toBe("ar");
  expect(result.current.profileExists).toBe(true);
  seen.length = 0;
  mockUserId = "b";
  rerender({});
  expect(seen).not.toContain("ar");
  expect(result.current.isLoading).toBe(true);
  expect(result.current.profileExists).toBe(false);
  expect(mockUnsubscribe).toHaveBeenCalled();
});

it("handles profile present with null language and observation error", (): void => {
  mockUserId = "c";
  const { result } = renderHook(() => usePreferredLanguage());
  act((): void => {
    mockEmit?.({ language: null, profileExists: true });
  });
  expect(result.current.language).toBeNull();
  expect(result.current.profileExists).toBe(true);
  expect(result.current.isLoading).toBe(false);

  act((): void => {
    mockError?.(new Error("disk read failed"));
  });
  expect(result.current.hasError).toBe(true);
  expect(result.current.profileExists).toBe(false);
});

