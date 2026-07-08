import { act, renderHook } from "@testing-library/react-native";
import { useSettingsAiConsentState } from "@/hooks/useSettingsAiConsentState";

describe("useSettingsAiConsentState", () => {
  it("keeps a local grant while persistence catches up, then clears it after persisted revocation", () => {
    const revokePersistedConsent = jest.fn<Promise<void>, []>();
    const { result, rerender } = renderHook(
      ({
        hasPersistedConsentRecord,
        isPersistedConsented,
      }: {
        readonly hasPersistedConsentRecord: boolean;
        readonly isPersistedConsented: boolean;
      }) =>
        useSettingsAiConsentState({
          hasPersistedConsentRecord,
          isPersistedConsented,
          revokePersistedConsent,
        }),
      {
        initialProps: {
          hasPersistedConsentRecord: false,
          isPersistedConsented: false,
        },
      }
    );

    act(() => {
      result.current.markAiConsentGranted();
    });

    expect(result.current.isAiConsentEnabled).toBe(true);

    rerender({ hasPersistedConsentRecord: true, isPersistedConsented: true });
    expect(result.current.isAiConsentEnabled).toBe(true);

    rerender({ hasPersistedConsentRecord: true, isPersistedConsented: false });
    expect(result.current.isAiConsentEnabled).toBe(false);
    expect(result.current.hasConsentedBefore).toBe(true);
  });

  it("tracks when the current consent version has been accepted before", () => {
    const revokePersistedConsent = jest.fn<Promise<void>, []>();
    const { result, rerender } = renderHook(
      ({
        hasPersistedConsentRecord,
        isPersistedConsented,
      }: {
        readonly hasPersistedConsentRecord: boolean;
        readonly isPersistedConsented: boolean;
      }) =>
        useSettingsAiConsentState({
          hasPersistedConsentRecord,
          isPersistedConsented,
          revokePersistedConsent,
        }),
      {
        initialProps: {
          hasPersistedConsentRecord: false,
          isPersistedConsented: false,
        },
      }
    );

    expect(result.current.hasConsentedBefore).toBe(false);

    act(() => {
      result.current.markAiConsentGranted();
    });

    expect(result.current.hasConsentedBefore).toBe(true);

    rerender({ hasPersistedConsentRecord: false, isPersistedConsented: false });
    expect(result.current.hasConsentedBefore).toBe(true);
  });

  it("remembers a previously accepted but currently revoked persisted consent", () => {
    const revokePersistedConsent = jest.fn<Promise<void>, []>();
    const { result } = renderHook(() =>
      useSettingsAiConsentState({
        hasPersistedConsentRecord: true,
        isPersistedConsented: false,
        revokePersistedConsent,
      })
    );

    expect(result.current.isAiConsentEnabled).toBe(false);
    expect(result.current.hasConsentedBefore).toBe(true);
  });
});
