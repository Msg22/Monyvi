import { act, renderHook } from "@testing-library/react-native";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";

let mockUserId = "a";
let mockEmit: ((language: "en" | "ar" | null) => void) | undefined;
const mockUnsubscribe = jest.fn();
jest.mock("@/hooks/useCurrentUser", (): object => ({
  useCurrentUser: (): object => ({
    userId: mockUserId,
    isResolvingUser: false,
  }),
}));
jest.mock("@/services/profile-language-read-model-service", (): object => ({
  observeProfileLanguage: (_user: string, next: typeof mockEmit): object => {
    mockEmit = next;
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
    mockEmit?.("en");
  });
  expect(result.current.language).toBe("en");
  act((): void => {
    mockEmit?.("ar");
  });
  expect(result.current.language).toBe("ar");
  seen.length = 0;
  mockUserId = "b";
  rerender({});
  expect(seen).not.toContain("ar");
  expect(result.current.isLoading).toBe(true);
  expect(mockUnsubscribe).toHaveBeenCalled();
});
