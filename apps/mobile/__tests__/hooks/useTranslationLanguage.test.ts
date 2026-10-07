import { act, renderHook } from "@testing-library/react-native";
import { useTranslationLanguage } from "@/hooks/useTranslationLanguage";

const mockListeners = new Set<() => void>();
const mockI18n = {
  language: undefined as string | undefined,
  on: jest.fn((_event: string, callback: () => void): void => {
    mockListeners.add(callback);
  }),
  off: jest.fn((_event: string, callback: () => void): void => {
    mockListeners.delete(callback);
  }),
};
jest.mock("@/i18n", (): object => ({
  __esModule: true,
  get default(): typeof mockI18n {
    return mockI18n;
  },
}));

it("subscribes before initialization without suspending and tracks pronunciation language", (): void => {
  const { result, unmount } = renderHook(() => useTranslationLanguage());
  expect(result.current).toBe("en");
  act((): void => {
    mockI18n.language = "ar";
    mockListeners.forEach((listener): void => listener());
  });
  expect(result.current).toBe("ar");
  unmount();
  expect(mockListeners.size).toBe(0);
  expect(mockI18n.off).toHaveBeenCalledWith(
    "languageChanged",
    expect.any(Function)
  );
});
