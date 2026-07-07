import { act, renderHook } from "@testing-library/react-native";
import { useSettingsAiConsentState } from "@/hooks/useSettingsAiConsentState";

describe("useSettingsAiConsentState", () => {
  it("keeps a local grant while persistence catches up, then clears it after persisted revocation", () => {
    const revokePersistedConsent = jest.fn<Promise<void>, []>();
    const { result, rerender } = renderHook(
      ({ isPersistedConsented }: { readonly isPersistedConsented: boolean }) =>
        useSettingsAiConsentState({
          isPersistedConsented,
          revokePersistedConsent,
        }),
      { initialProps: { isPersistedConsented: false } }
    );

    act(() => {
      result.current.markAiConsentGranted();
    });

    expect(result.current.isAiConsentEnabled).toBe(true);

    rerender({ isPersistedConsented: true });
    expect(result.current.isAiConsentEnabled).toBe(true);

    rerender({ isPersistedConsented: false });
    expect(result.current.isAiConsentEnabled).toBe(false);
  });
});
