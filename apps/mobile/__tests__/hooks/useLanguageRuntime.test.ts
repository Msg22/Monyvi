import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  createLanguageCoordinator,
  type LanguageSnapshot,
} from "@/services/language-coordinator";
import { useLanguageReconciliation } from "@/hooks/useLanguageRuntime";

const mockNormalize = jest.fn();
const mockCoordinator = createLanguageCoordinator({
  translate: jest.fn().mockResolvedValue(undefined),
  normalizeDirection: mockNormalize,
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
jest.mock("@/utils/logger", (): object => ({ logger: { warn: jest.fn() } }));

describe("startup language reconciliation", (): void => {
  beforeEach((): void => {
    mockCoordinator.setScope(null);
    jest.clearAllMocks();
  });

  it("reconciles English direction even when translations already match", async (): Promise<void> => {
    mockCoordinator.setScope("user-a");
    const { result } = renderHook(() =>
      useLanguageReconciliation("en", "user-a", false)
    );
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(mockNormalize).toHaveBeenCalledWith("en");
  });

  it("waits for profile resolution and never applies the device fallback first", async (): Promise<void> => {
    mockCoordinator.setScope("user-a");
    const { rerender } = renderHook<
      LanguageSnapshot,
      { readonly loading: boolean }
    >(
      ({ loading }): LanguageSnapshot =>
        useLanguageReconciliation("ar", "user-a", loading),
      { initialProps: { loading: true } }
    );
    expect(mockNormalize).not.toHaveBeenCalled();
    rerender({ loading: false });
    await waitFor(() => expect(mockNormalize).toHaveBeenCalledWith("ar"));
  });

  it("never reports ready from another user's snapshot on the first render", async (): Promise<void> => {
    mockCoordinator.setScope("user-a");
    await act(async (): Promise<void> => {
      await mockCoordinator.apply("en");
    });
    const seen: string[] = [];
    renderHook(() => {
      const state = useLanguageReconciliation(null, "user-b", true);
      seen.push(state.phase);
      return state;
    });
    expect(seen).not.toContain("ready");
  });
});
