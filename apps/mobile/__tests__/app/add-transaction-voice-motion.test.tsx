import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import {
  mockVoiceAvailabilityRefresh,
  mockVoiceStartFlow,
  mockVoiceDiscardRecording,
  mockVoicePermissionRefresh,
  mockVoiceOpenMicrophoneSettings,
  mockGrantConsent,
  unconsentedStatus,
  mockGetAiProcessingConsentStatus,
  initialVoiceAvailability,
  renderRoute,
  expectTabState,
  createDeferred,
  AddTransaction,
  mockRouteState,
  resetRouteMocks,
  type GetConsentStatus,
} from "./add-transaction-route-fixtures";

describe("AddTransaction approved Voice motion and recovery", () => {
  beforeEach(resetRouteMocks);

  it("shows Starting immediately while fresh consent is unresolved", async (): Promise<void> => {
    const consent = createDeferred<Awaited<ReturnType<GetConsentStatus>>>();
    mockGetAiProcessingConsentStatus.mockReturnValueOnce(consent.promise);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "starting"
    );
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      consent.resolve({ consent: null, isConsented: true, userId: "user-1" });
      await consent.promise;
    });
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
  });

  it("Cancel invalidates pending consent without opening late permission UI", async (): Promise<void> => {
    const consent = createDeferred<Awaited<ReturnType<GetConsentStatus>>>();
    mockGetAiProcessingConsentStatus.mockReturnValueOnce(consent.promise);
    mockRouteState.mockVoiceHasPermission = false;
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    fireEvent.press(screen.getByTestId("voice-starting-cancel"));
    await act(async (): Promise<void> => {
      consent.resolve({ consent: null, isConsented: true, userId: "user-1" });
      await consent.promise;
      await Promise.resolve();
    });
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });

  it("late canceled attempt A cannot clear attempt B Starting or mode locks", async (): Promise<void> => {
    const first = createDeferred<Awaited<ReturnType<GetConsentStatus>>>();
    const second = createDeferred<Awaited<ReturnType<GetConsentStatus>>>();
    mockGetAiProcessingConsentStatus
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("voice-starting-cancel"));
      await Promise.resolve();
    });
    fireEvent.press(screen.getByTestId("voice-start"));
    await act(async (): Promise<void> => {
      first.resolve({ consent: null, isConsented: true, userId: "user-1" });
      await first.promise;
    });
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "starting"
    );
    expectTabState("Manual", { disabled: true });
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      second.resolve({ consent: null, isConsented: true, userId: "user-1" });
      await second.promise;
    });
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
  });

  it("routes one permission-denied result to inline explanation without a duplicate native read", async (): Promise<void> => {
    mockRouteState.mockVoiceHasPermission = false;
    mockVoiceStartFlow.mockResolvedValueOnce({
      kind: "permission",
      permissionStatus: "denied",
    });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
        "permission-explanation"
      )
    );
    expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
    // The Flow owns its single fresh read; the route must never re-query it.
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
  });

  it("maps fresh blocked permission to Settings without issuing an OS request", async (): Promise<void> => {
    mockRouteState.mockVoiceHasPermission = false;
    mockRouteState.mockPermissionStatus = "blocked";
    mockVoiceStartFlow.mockResolvedValueOnce({
      kind: "permission",
      permissionStatus: "blocked",
    });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
        "permission-denied"
      )
    );
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("voice-action-settings"));
    expect(mockVoiceOpenMicrophoneSettings).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
  });

  it("leaves unknown permission unresolved: no inline denial, OS sheet, or capture", async (): Promise<void> => {
    mockVoiceStartFlow.mockResolvedValueOnce({
      kind: "permission",
      permissionStatus: "unknown",
    });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
    expect(screen.getByTestId("voice-entry-state")).not.toHaveTextContent("recording");
    expect(screen.getByTestId("voice-entry-state")).not.toHaveTextContent("permission-denied");
    expect(mockVoiceOpenMicrophoneSettings).not.toHaveBeenCalled();
  });


  it("unavailable Try again refreshes and automatically starts when eligible", async (): Promise<void> => {
    mockRouteState.mockVoiceAvailabilityErrorKind = "network";
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-unavailable-retry"));
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
    expect(mockVoiceAvailabilityRefresh).toHaveBeenCalledTimes(1);
  });

  it("unavailable retry preserves an authoritative refusal without capture", async (): Promise<void> => {
    mockRouteState.mockVoiceAvailabilityErrorKind = "network";
    mockVoiceAvailabilityRefresh.mockResolvedValueOnce({
      ...initialVoiceAvailability,
      remaining: 0,
      reason: "daily_limit",
    });
    renderRoute("voice");
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("voice-unavailable-retry"));
      await Promise.resolve();
    });
    expect(mockVoiceAvailabilityRefresh).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
  });

  it("grants fresh AI consent before Flow's one permission read; only the inline action can request OS access", async (): Promise<void> => {
    mockRouteState.mockVoiceHasPermission = false;
    mockRouteState.mockPermissionStatus = "denied";
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce(unconsentedStatus);
    mockVoiceStartFlow
      .mockResolvedValueOnce({ kind: "permission", permissionStatus: "denied" })
      .mockResolvedValueOnce({ kind: "started" });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(screen.getByTestId("voice-consent-continue")).toBeOnTheScreen();
    });
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("voice-consent-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
        "permission-explanation"
      )
    );
    expect(mockGrantConsent).toHaveBeenCalledTimes(1);
    expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
    expect(mockVoiceStartFlow).toHaveBeenNthCalledWith(1, {
      skipAiProcessingConsent: true,
    });
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();

    fireEvent.press(screen.getByTestId("voice-permission-primary"));
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(2);
    });
    expect(mockVoiceStartFlow).toHaveBeenNthCalledWith(2, {
      skipAiProcessingConsent: true,
      requestMicrophonePermission: true,
    });
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
  });


  it("clears blocked recovery after a fresh granted permission without automatically recording", async (): Promise<void> => {
    mockRouteState.mockVoiceFlowStatus = "error";
    mockRouteState.mockMicrophonePermissionError = true;
    mockRouteState.mockPermissionStatus = "blocked";
    mockRouteState.mockVoiceHasPermission = false;
    const view = renderRoute("voice");
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "permission-denied"
    );
    mockRouteState.mockPermissionStatus = "granted";
    mockRouteState.mockVoiceHasPermission = true;
    view.rerender(<AddTransaction />);
    await waitFor(() =>
      expect(mockVoiceDiscardRecording).toHaveBeenCalledTimes(1)
    );
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    mockRouteState.mockMicrophonePermissionError = false;
    mockRouteState.mockVoiceFlowStatus = "idle";
    view.rerender(<AddTransaction />);
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
  });

  it("shows Starting while an inline permission retry waits for fresh consent", async (): Promise<void> => {
    mockRouteState.mockVoiceFlowStatus = "error";
    mockRouteState.mockMicrophonePermissionError = true;
    mockRouteState.mockVoiceHasPermission = false;
    renderRoute("voice");
    const consent = createDeferred<Awaited<ReturnType<GetConsentStatus>>>();
    mockGetAiProcessingConsentStatus.mockReturnValueOnce(consent.promise);
    fireEvent.press(screen.getByTestId("voice-permission-primary"));
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent(
      "starting"
    );
    fireEvent.press(screen.getByTestId("voice-starting-cancel"));
    await act(async (): Promise<void> => {
      consent.resolve(unconsentedStatus);
      await consent.promise;
    });
    expect(mockVoiceStartFlow).not.toHaveBeenCalled();
    expect(screen.queryByTestId("voice-consent-continue")).toBeNull();
  });
  it("lets a granted Flow result proceed without a route-side native permission probe", async (): Promise<void> => {
    mockVoiceStartFlow.mockResolvedValueOnce({ kind: "started" });
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor((): void => {
      expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1);
    });
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
    expect(mockVoiceStartFlow).toHaveBeenCalledWith({
      skipAiProcessingConsent: true,
    });
  });

  it("does not display stale permission recovery after Cancel while a Flow result is pending", async (): Promise<void> => {
    const first = createDeferred<{
      readonly kind: "permission";
      readonly permissionStatus: "denied";
    }>();
    mockVoiceStartFlow.mockReturnValueOnce(first.promise);
    renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("starting");
    fireEvent.press(screen.getByTestId("voice-starting-cancel"));
    await act(async (): Promise<void> => {
      first.resolve({ kind: "permission", permissionStatus: "denied" });
      await first.promise;
    });
    expect(screen.getByTestId("voice-entry-state")).toHaveTextContent("idle");
    expect(screen.queryByTestId("microphone-recovery-modal")).toBeNull();
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
  });

  it("ignores a late permission result from a different account generation", async (): Promise<void> => {
    const old = createDeferred<{
      readonly kind: "permission";
      readonly permissionStatus: "blocked";
    }>();
    mockVoiceStartFlow.mockReturnValueOnce(old.promise);
    const view = renderRoute("voice");
    fireEvent.press(screen.getByTestId("voice-start"));
    await waitFor(() => expect(mockVoiceStartFlow).toHaveBeenCalledTimes(1));
    mockRouteState.mockCurrentUserId = "user-2";
    view.rerender(<AddTransaction />);
    await act(async (): Promise<void> => {
      old.resolve({ kind: "permission", permissionStatus: "blocked" });
      await old.promise;
    });
    expect(screen.getByTestId("voice-entry-state")).not.toHaveTextContent("permission-denied");
    expect(mockVoiceOpenMicrophoneSettings).not.toHaveBeenCalled();
    expect(mockVoicePermissionRefresh).not.toHaveBeenCalled();
  });

});
