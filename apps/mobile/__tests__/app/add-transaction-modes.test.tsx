import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  getTestInstanceParent,
  getTestInstanceProps,
} from "../test-utils/test-instance-props";
import {
  mockBack,
  mockPush,
  mockSetParams,
  mockVoiceStartFlow,
  mockCreateTransaction,
  mockGrantConsent,
  unconsentedStatus,
  mockGetAiProcessingConsentStatus,
  renderRoute,
  expectTabState,
  enterOneManualUnit,
  createDeferred,
  AddTransaction,
  ManualTransactionEntry,
  mockRouteState,
  resetRouteMocks,
  type CreatedTransactionFixture,
} from "./add-transaction-route-fixtures";

describe("AddTransaction unified mode intent", () => {
  beforeEach(resetRouteMocks);

  it("uses one Add Transaction shell and selects Voice for mode=voice", () => {
    renderRoute("voice");

    expect(screen.getAllByTestId("page-header")).toHaveLength(1);

    expectTabState("Voice", { selected: true });
    expectTabState("Manual", { selected: false });
  });

  it("defers the FIRST expensive ManualTransactionEntry mount on direct Voice entry", (): void => {
    renderRoute("voice");
    expectTabState("Voice", { selected: true });
    expect(screen.UNSAFE_queryByType(ManualTransactionEntry)).toBeNull();
    expect(
      screen.queryByTestId("manual-amount-input", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(screen.queryByTestId("header-save")).toBeNull();
    // No measuring fabricated latency: this is a real mount/nonmount assertion.
    expect(screen.getByTestId("voice-entry-state")).toBeOnTheScreen();
  });

  it("mounts Manual immediately for default route and preserves its normal Save/amount contract", (): void => {
    renderRoute(undefined);
    expectTabState("Manual", { selected: true });
    expect(screen.UNSAFE_getByType(ManualTransactionEntry)).toBeTruthy();
    expect(screen.getByTestId("manual-amount-input")).toBeOnTheScreen();
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
  });

  it("Voice-first mounts Manual ONCE when selected, keeps it alive across switches and preserves the draft", async (): Promise<void> => {
    renderRoute("voice");
    expect(screen.UNSAFE_queryByType(ManualTransactionEntry)).toBeNull();

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      await Promise.resolve();
    });
    expectTabState("Manual", { selected: true });
    const originalManual: unknown = screen.UNSAFE_getByType(
      ManualTransactionEntry
    );
    expect(getTestInstanceProps(originalManual).isActive).toBe(true);
    await enterOneManualUnit();

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
      await Promise.resolve();
    });
    expect(screen.UNSAFE_getByType(ManualTransactionEntry)).toBe(
      originalManual
    );
    expect(getTestInstanceProps(originalManual).isActive).toBe(false);
    expect(screen.queryByTestId("header-save")).toBeNull();
    expect(screen.queryByTestId("manual-amount-input")).toBeNull();

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      await Promise.resolve();
    });
    expect(screen.UNSAFE_getByType(ManualTransactionEntry)).toBe(
      originalManual
    );
    expect(screen.getByTestId("manual-amount-input")).toHaveProp("value", "1");
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
  });

  it("preserves observable Manual amount state across safe mode switches", async (): Promise<void> => {
    renderRoute("manual");

    await enterOneManualUnit();

    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
      await Promise.resolve();
    });
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("manual-amount-input")).toHaveProp("value", "1");
  });

  it("keeps the unified shell wired to the real Manual save contract", async () => {
    renderRoute("manual");

    await enterOneManualUnit();

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(1));
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        currency: "EGP",
        accountId: "cash-1",
        categoryId: "cat-food",
        source: "MANUAL",
        type: "EXPENSE",
      })
    );
  });

  it("blocks Voice and Back while a Manual save is pending, then navigates once", async () => {
    const pending = createDeferred<CreatedTransactionFixture>();
    mockCreateTransaction.mockReturnValueOnce(pending.promise);
    renderRoute("manual");
    await enterOneManualUnit();
    fireEvent.press(screen.getByTestId("header-save"));
    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(1));

    const voiceTab: unknown = screen.getByRole("tab", { name: "Voice" });
    const disabledDuringSave =
      getTestInstanceProps(voiceTab).accessibilityState;
    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
    fireEvent.press(screen.getByTestId("header-back"));
    await act(async () => {
      await Promise.resolve();
    });
    const manualSelectedWhilePending = getTestInstanceProps(
      screen.getByRole("tab", { name: "Manual" })
    ).accessibilityState;
    const navigationCountWhilePending = mockBack.mock.calls.length;

    await act(async () => {
      pending.resolve({ id: "tx-1" });
      await pending.promise;
      await Promise.resolve();
    });

    expect(disabledDuringSave).toEqual(
      expect.objectContaining({ disabled: true })
    );
    expect(manualSelectedWhilePending).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(navigationCountWhilePending).toBe(0);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("locks mode switching while consent grant is pending", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    expectTabState("Manual", { disabled: true });

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
    });
    // Consent continuation must finish before automatic RNTL cleanup.
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("does not start or show permission recovery after Back invalidates a pending grant", async () => {
    mockRouteState.mockVoiceHasPermission = false;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    fireEvent.press(screen.getByTestId("header-back"));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
      await Promise.resolve();
    });

    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
  });

  it("grants consent once and hands successful start to the Voice hook once", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    const hookStart = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    mockVoiceStartFlow.mockReturnValueOnce(hookStart.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    expect(mockGrantConsent).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      grant.resolve(undefined);
      await grant.promise;
      await Promise.resolve();
    });

    expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
    expectTabState("Manual", { disabled: true });

    await act(async (): Promise<void> => {
      hookStart.resolve(undefined);
      await hookStart.promise;
    });

    expectTabState("Manual", { disabled: false });
  });

  it("drops a stale daily refusal after authoritative availability becomes ready", () => {
    mockRouteState.mockVoiceRefusalReason = "daily_limit";
    mockRouteState.mockVoiceAvailability = {
      ...mockRouteState.mockVoiceAvailability,
      remaining: 0,
      reason: "daily_limit",
      availableAt: "2026-10-08T21:00:00.000Z",
    };
    const view = renderRoute("voice");

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "daily-limit"
    );

    mockRouteState.mockVoiceAvailability = {
      ...mockRouteState.mockVoiceAvailability,
      remaining: 5,
      reason: null,
      availableAt: null,
    };
    view.rerender(<AddTransaction />);

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });

  it("reopens consent after returning from privacy details", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-privacy-details"));
    expect(mockPush).toHaveBeenCalledWith("/privacy-details");
    expect(screen.queryByTestId("voice-privacy-details")).toBeNull();
    act((): void => {
      mockRouteState.mockFocusCallback?.();
    });
    expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();
    // Privacy-return recovery must leave no pending start at teardown.
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("keeps consent visible when granting it fails", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    mockGrantConsent.mockRejectedValueOnce(new Error("profile unavailable"));
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    await waitFor((): void => {
      expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    // Rejected consent is caught and the pending-start lock is released.
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("uses fresh profile consent when mounted consent is stale", async (): Promise<void> => {
    mockRouteState.mockAiConsented = true;
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    // The fresh-status rejection returns without a dangling pending start.
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("preserves retry intent until consent loading finishes", async (): Promise<void> => {
    mockRouteState.mockRouteParams = { mode: "voice", retry: "true" };
    mockRouteState.mockAiConsentLoading = true;
    const view = render(<AddTransaction />);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    mockRouteState.mockAiConsentLoading = false;
    view.rerender(<AddTransaction />);
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });
    expect(mockSetParams).toHaveBeenCalledWith({ retry: undefined });
    // Wait for the request's finally cleanup, not only hook invocation,
    // before automatic route teardown.
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("drops a stale burst refusal after authoritative capacity returns", (): void => {
    mockRouteState.mockVoiceRefusalReason = "burst_limit";
    mockRouteState.mockVoiceAvailability = {
      ...mockRouteState.mockVoiceAvailability,
      reason: "burst_limit",
      availableAt: "2026-10-08T01:00:30.000Z",
    };
    const view = renderRoute("voice");
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "burst-limit"
    );
    mockRouteState.mockVoiceAvailability = {
      ...mockRouteState.mockVoiceAvailability,
      reason: null,
      availableAt: null,
    };
    view.rerender(<AddTransaction />);
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });

  it.each([undefined, "manual", "invalid", "VOICE"])(
    "defaults %s route intent to Manual without showing Voice quota",
    (requested) => {
      renderRoute(requested);
      expectTabState("Manual", { selected: true });
      expect(screen.getByTestId("header-save")).toBeOnTheScreen();
      expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
    }
  );

  it.each([
    ["available", 3, null, null, false],
    ["exhausted", 0, "daily_limit", null, false],
    ["burst-blocked", 3, "burst_limit", null, false],
    ["availability-error", 3, null, "network", false],
    ["consent-required", 3, null, "consent_required", false],
    ["null-loading", 3, null, null, true],
  ] as const)(
    "keeps all Voice counters and errors off the visible Manual form: %s",
    (_label, remaining, reason, errorKind, isLoading) => {
      mockRouteState.mockVoiceAvailability = {
        ...mockRouteState.mockVoiceAvailability,
        remaining,
        reason,
      };
      mockRouteState.mockVoiceAvailabilityErrorKind = errorKind;
      mockRouteState.mockVoiceAvailabilityLoading = isLoading;
      renderRoute("manual");

      expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
      expect(screen.queryByText("VOICE_UNAVAILABLE_BODY")).toBeNull();
      expect(screen.getByTestId("header-save")).toBeOnTheScreen();
      expectTabState("Manual", { selected: true });
    }
  );

  it("passes active mode into the kept-mounted Manual entry without exposing the hidden subtree", () => {
    renderRoute("manual");
    expect(
      getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry))
        .isActive
    ).toBe(true);

    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));

    expect(
      getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry))
        .isActive
    ).toBe(false);
    expect(screen.queryByTestId("header-save")).toBeNull();

    expect(screen.queryByTestId("manual-amount-input")).toBeNull();
    const amount: unknown = screen.getByTestId("manual-amount-input", {
      includeHiddenElements: true,
    });
    let container: unknown = getTestInstanceParent(amount);
    while (
      container !== null &&
      container !== undefined &&
      getTestInstanceProps(container).accessibilityElementsHidden === undefined
    ) {
      container = getTestInstanceParent(container);
    }
    expect(getTestInstanceProps(container).accessibilityElementsHidden).toBe(
      true
    );
    expect(getTestInstanceProps(container).importantForAccessibility).toBe(
      "no-hide-descendants"
    );

    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));

    expect(
      getTestInstanceProps(screen.UNSAFE_getByType(ManualTransactionEntry))
        .isActive
    ).toBe(true);
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
  });

  it("keeps Voice unavailable, daily exhaustion, and burst failures nonblocking for Manual", () => {
    mockRouteState.mockVoiceAvailability = {
      ...mockRouteState.mockVoiceAvailability,
      remaining: 0,
      reason: "daily_limit",
    };
    renderRoute("voice");
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "daily-limit"
    );
    expect(screen.queryByTestId("header-save")).toBeNull();

    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
    expect(screen.getByTestId("header-save")).toBeOnTheScreen();
    expect(screen.queryByText("VOICE_QUOTA_HEADING")).toBeNull();
  });

  it.each(["recording", "paused", "analyzing"] as const)(
    "preserves the mode-switch lock during %s",
    (status) => {
      mockRouteState.mockVoiceFlowStatus = status;
      mockRouteState.mockVoiceModeSwitchLocked = true;
      renderRoute("voice");

      const manual: unknown = screen.getByRole("tab", { name: "Manual" });
      expect(getTestInstanceProps(manual).accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      expectTabState("Voice", { selected: true });
    }
  );
});


describe("AddTransaction Voice startup S2 Red", () => {
  beforeEach(resetRouteMocks);

  it("renders Starting immediately while fresh consent status is unresolved", async (): Promise<void> => {
    const consentStatus = createDeferred<{
      readonly consent: null;
      readonly isConsented: boolean;
      readonly userId: string;
    }>();
    mockGetAiProcessingConsentStatus.mockReturnValueOnce(consentStatus.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("starting");
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();

    consentStatus.resolve({
      consent: null,
      isConsented: false,
      userId: "user-1",
    });
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    await waitFor(() => expectTabState("Manual", { disabled: false }));
  });

  it("marks the first post-consent start as superseding pre-consent availability", async (): Promise<void> => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    const grant = createDeferred<void>();
    mockGrantConsent.mockReturnValueOnce(grant.promise);
    renderRoute("voice");

    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    grant.resolve(undefined);
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });

    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
      supersedePendingAvailability: true,
    });
  });

  it("keeps an already-consented ordinary start on normal pending coalescing", async (): Promise<void> => {
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));

    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });

    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
  });

  it("keeps unavailable retry consent-first, refreshes once, and hands that snapshot into flow", async (): Promise<void> => {
    mockRouteState.mockVoiceAvailabilityErrorKind = "network";
    const consentStatus = createDeferred<{
      readonly consent: null;
      readonly isConsented: boolean;
      readonly userId: string;
    }>();
    mockGetAiProcessingConsentStatus.mockReturnValueOnce(consentStatus.promise);
    renderRoute("voice");

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "unavailable"
    );
    fireEvent.press(screen.getByTestId("voice-unavailable-retry"));

    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("starting");
    expect(mockVoiceAvailabilityRefresh).not.toHaveBeenCalled();
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();

    consentStatus.resolve({
      consent: null,
      isConsented: true,
      userId: "user-1",
    });

    await waitFor((): void => {
      expect(mockVoiceAvailabilityRefresh).toHaveBeenCalledTimes(1);
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
      availabilitySnapshot: expect.objectContaining({
        remaining: 5,
        reason: null,
      }),
    });
  });
});
