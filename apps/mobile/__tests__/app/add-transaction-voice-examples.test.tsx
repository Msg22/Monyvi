import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import {
  AddTransaction,
  createDeferred,
  mockDismissVoiceExamples,
  mockExamplesStore,
  mockReadVoiceExamplesDismissed,
  mockRouteState,
  renderRoute,
  resetRouteMocks,
} from "./add-transaction-route-fixtures";

describe("Add Transaction account-local Voice examples", () => {
  beforeEach(resetRouteMocks);

  it("hides the complete examples card while the actor's preference is pending", async (): Promise<void> => {
    const read = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockReturnValueOnce(read.promise);
    renderRoute("voice");
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    await act(async (): Promise<void> => {
      read.resolve(false);
      await read.promise;
    });
    expect(screen.getByTestId("voice-examples-card")).toBeTruthy();
  });

  it("dismisses the whole card immediately and retains dismissal after a route remount", async (): Promise<void> => {
    const first = renderRoute("voice");
    await waitFor((): void => {
      expect(screen.getByTestId("voice-examples-card")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("voice-examples-dismiss"));
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    await waitFor((): void => {
      expect(mockDismissVoiceExamples).toHaveBeenCalledWith("user-1");
    });
    first.unmount();
    renderRoute("voice");
    await waitFor((): void => {
      expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    expect(screen.queryByTestId("voice-examples-dismiss")).toBeNull();
  });

  it("gates an account switch until the new account's stored dismissal resolves", async (): Promise<void> => {
    const route = renderRoute("voice");
    await waitFor((): void => {
      expect(screen.getByTestId("voice-examples-card")).toBeTruthy();
    });
    const next = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockReturnValueOnce(next.promise);
    mockRouteState.mockCurrentUserId = "user-2";
    route.rerender(<AddTransaction />);
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    await act(async (): Promise<void> => {
      next.resolve(true);
      await next.promise;
    });
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    expect(mockReadVoiceExamplesDismissed).toHaveBeenLastCalledWith("user-2");
  });

  it("does not carry another account's dismissal into the current account", async (): Promise<void> => {
    mockExamplesStore.add("user-1");
    const route = renderRoute("voice");
    await waitFor((): void => {
      expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledWith("user-1");
    });
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    mockRouteState.mockCurrentUserId = "user-2";
    route.rerender(<AddTransaction />);
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    await waitFor((): void => {
      expect(screen.getByTestId("voice-examples-card")).toBeTruthy();
    });
  });

  it.each([
    [null, false],
    ["user-1", true],
  ] as const)(
    "shows no examples for unresolved auth user=%s resolving=%s",
    (userId, isResolving): void => {
      mockRouteState.mockCurrentUserId = userId;
      mockRouteState.mockIsResolvingUser = isResolving;
      renderRoute("voice");
      expect(screen.queryByTestId("voice-examples-card")).toBeNull();
      expect(mockReadVoiceExamplesDismissed).not.toHaveBeenCalled();
    }
  );

  it("keeps every Voice examples surface absent from Manual", (): void => {
    renderRoute("manual");
    expect(screen.queryByTestId("voice-examples-card")).toBeNull();
    expect(screen.queryByTestId("voice-examples-dismiss")).toBeNull();
    expect(mockDismissVoiceExamples).not.toHaveBeenCalled();
  });
});
