/**
 * T061 test-first contract for a new service/hook not yet implemented.
 * Missing-module imports at this snapshot are STRUCTURAL, not behavioral Red.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useVoiceExamplesPreference } from "@/hooks/useVoiceExamplesPreference";

const mockReadVoiceExamplesDismissed = jest.fn<Promise<boolean>, [string]>();
const mockDismissVoiceExamples = jest.fn<Promise<void>, [string]>();
const mockLogPreferenceFailure = jest.fn<void, unknown[]>();

jest.mock("@/services/voice-examples-preference-service", () => ({
  readVoiceExamplesDismissed: (userId: string): Promise<boolean> =>
    mockReadVoiceExamplesDismissed(userId),
  dismissVoiceExamples: (userId: string): Promise<void> =>
    mockDismissVoiceExamples(userId),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    warn: (...args: unknown[]): void => {
      mockLogPreferenceFailure(...args);
    },
    error: (...args: unknown[]): void => {
      mockLogPreferenceFailure(...args);
    },
  },
}));

const accountA = "authenticated-account-a";
const accountB = "authenticated-account-b";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let fulfill: (value: T) => void = () => {
    throw new Error("Deferred promise not initialized");
  };
  let rejectPromise: (reason?: unknown) => void = () => {
    throw new Error("Deferred promise not initialized");
  };
  const promise = new Promise<T>((resolve, reject) => {
    fulfill = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T): void => fulfill(value),
    reject: (reason: unknown): void => rejectPromise(reason),
  };
}

interface HookProps {
  readonly userId: string | null;
  readonly language: "en" | "ar";
  readonly theme: "light" | "dark";
}

function renderPreference(
  userId: string | null = accountA
): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceExamplesPreference>, HookProps>
> {
  const initialProps: HookProps = {
    userId,
    language: "en",
    theme: "light",
  };
  return renderHook(
    (props: HookProps) => useVoiceExamplesPreference(props.userId),
    { initialProps }
  );
}

beforeEach((): void => {
  jest.clearAllMocks();
  mockReadVoiceExamplesDismissed.mockReset().mockResolvedValue(false);
  mockDismissVoiceExamples.mockReset().mockResolvedValue(undefined);
  mockLogPreferenceFailure.mockReset();
});

describe("useVoiceExamplesPreference (FR-038, T061)", () => {
  it("unknown auth remains unready", async (): Promise<void> => {
    const { result } = renderPreference(null);

    expect(result.current.isReady).toBe(false);
    expect(result.current.hasDismissed).toBe(false);
    expect(mockReadVoiceExamplesDismissed).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.dismissExamples();
    });

    expect(mockDismissVoiceExamples).not.toHaveBeenCalled();
    expect(result.current.hasDismissed).toBe(false);
  });

  it("pending account read stays unready", async (): Promise<void> => {
    const deferredRead = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockReturnValueOnce(deferredRead.promise);
    const { result } = renderPreference(accountA);

    expect(result.current.isReady).toBe(false);
    expect(result.current.hasDismissed).toBe(false);
    expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledWith(accountA);

    await act(async () => {
      deferredRead.resolve(true);
      await deferredRead.promise;
    });

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(true);
  });

  it("absent account preference shows examples", async (): Promise<void> => {
    const { result } = renderPreference(accountA);

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(false);
    expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledWith(accountA);
  });

  it("read failure resolves visible", async (): Promise<void> => {
    mockReadVoiceExamplesDismissed.mockRejectedValueOnce(
      new Error("local preference unreadable")
    );
    const { result } = renderPreference(accountA);

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(false);
    expect(mockLogPreferenceFailure).toHaveBeenCalled();
  });

  it("dismiss hides before persistence", async (): Promise<void> => {
    const pendingWrite = createDeferred<void>();
    mockDismissVoiceExamples.mockReturnValueOnce(pendingWrite.promise);
    const { result } = renderPreference(accountA);
    await waitFor(() => expect(result.current.isReady).toBe(true));

    let finishWrite: Promise<void> = Promise.resolve();
    act(() => {
      finishWrite = result.current.dismissExamples();
    });

    expect(result.current.hasDismissed).toBe(true);
    expect(mockDismissVoiceExamples).toHaveBeenCalledWith(accountA);

    await act(async () => {
      pendingWrite.resolve(undefined);
      await finishWrite;
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.hasDismissed).toBe(true);
  });

  it("repeated dismiss taps persist once", async (): Promise<void> => {
    const pendingWrite = createDeferred<void>();
    mockDismissVoiceExamples.mockReturnValueOnce(pendingWrite.promise);
    const { result } = renderPreference(accountA);
    await waitFor(() => expect(result.current.isReady).toBe(true));

    let firstWrite: Promise<void> = Promise.resolve();
    act(() => {
      firstWrite = result.current.dismissExamples();
      void result.current.dismissExamples();
      void result.current.dismissExamples();
    });

    expect(result.current.hasDismissed).toBe(true);
    expect(mockDismissVoiceExamples).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingWrite.resolve(undefined);
      await firstWrite;
    });
    expect(result.current.hasDismissed).toBe(true);
  });

  it("A's dismissal cannot flash into pending B", async (): Promise<void> => {
    const pendingB = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockImplementation(
      (userId: string): Promise<boolean> =>
        userId === accountA ? Promise.resolve(true) : pendingB.promise
    );
    const { result, rerender } = renderPreference(accountA);
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(true);

    rerender({ userId: accountB, language: "en", theme: "light" });
    expect(result.current.isReady).toBe(false);
    expect(result.current.hasDismissed).toBe(false);

    await act(async () => {
      pendingB.resolve(false);
      await pendingB.promise;
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(false);
  });

  it("late A read cannot overwrite B", async (): Promise<void> => {
    const pendingA = createDeferred<boolean>();
    const pendingB = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockImplementation(
      (userId: string): Promise<boolean> =>
        userId === accountA ? pendingA.promise : pendingB.promise
    );

    const { result, rerender } = renderPreference(accountA);
    expect(result.current.isReady).toBe(false);

    rerender({ userId: accountB, language: "ar", theme: "dark" });
    expect(result.current.isReady).toBe(false);
    expect(result.current.hasDismissed).toBe(false);

    await act(async () => {
      pendingA.resolve(true);
      await pendingA.promise;
    });
    expect(result.current.isReady).toBe(false);
    expect(result.current.hasDismissed).toBe(false);

    await act(async () => {
      pendingB.resolve(false);
      await pendingB.promise;
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(false);
  });

  it("late A write cannot hide B", async (): Promise<void> => {
    const pendingAWrite = createDeferred<void>();
    mockDismissVoiceExamples.mockReturnValueOnce(pendingAWrite.promise);
    const { result, rerender } = renderPreference(accountA);
    await waitFor(() => expect(result.current.isReady).toBe(true));

    let finishWrite: Promise<void> = Promise.resolve();
    act(() => {
      finishWrite = result.current.dismissExamples();
    });
    expect(result.current.hasDismissed).toBe(true);

    rerender({ userId: accountB, language: "en", theme: "light" });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.hasDismissed).toBe(false);

    await act(async () => {
      pendingAWrite.resolve(undefined);
      await finishWrite;
    });
    expect(result.current.isReady).toBe(true);
    expect(result.current.hasDismissed).toBe(false);
    expect(mockDismissVoiceExamples).toHaveBeenCalledWith(accountA);
    expect(mockDismissVoiceExamples).not.toHaveBeenCalledWith(accountB);
  });

  it("stale read cannot undo optimistic dismissal", async (): Promise<void> => {
    const pendingRead = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockReturnValueOnce(pendingRead.promise);
    const { result } = renderPreference(accountA);
    expect(result.current.isReady).toBe(false);

    let finishWrite: Promise<void> = Promise.resolve();
    act(() => {
      finishWrite = result.current.dismissExamples();
    });
    expect(result.current.hasDismissed).toBe(true);

    await act(async () => {
      pendingRead.resolve(false);
      await pendingRead.promise;
      await finishWrite;
    });
    expect(result.current.hasDismissed).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it("remount preserves account scope", async (): Promise<void> => {
    const storedDismissals = new Map<string, boolean>();
    mockReadVoiceExamplesDismissed.mockImplementation(
      async (userId: string): Promise<boolean> =>
        storedDismissals.get(userId) ?? false
    );
    mockDismissVoiceExamples.mockImplementation(
      async (userId: string): Promise<void> => {
        storedDismissals.set(userId, true);
      }
    );

    const first = renderPreference(accountA);
    await waitFor(() => expect(first.result.current.isReady).toBe(true));
    expect(first.result.current.hasDismissed).toBe(false);

    await act(async () => {
      await first.result.current.dismissExamples();
    });
    expect(first.result.current.hasDismissed).toBe(true);

    first.rerender({ userId: accountA, language: "ar", theme: "dark" });
    expect(first.result.current.hasDismissed).toBe(true);
    first.unmount();

    const afterRestart = renderPreference(accountA);
    await waitFor(() => expect(afterRestart.result.current.isReady).toBe(true));
    expect(afterRestart.result.current.hasDismissed).toBe(true);

    afterRestart.rerender({
      userId: null,
      language: "ar",
      theme: "dark",
    });
    expect(afterRestart.result.current.isReady).toBe(false);
    expect(afterRestart.result.current.hasDismissed).toBe(false);

    afterRestart.rerender({
      userId: accountB,
      language: "ar",
      theme: "dark",
    });
    await waitFor(() => expect(afterRestart.result.current.isReady).toBe(true));
    expect(afterRestart.result.current.hasDismissed).toBe(false);

    afterRestart.rerender({
      userId: accountA,
      language: "en",
      theme: "light",
    });
    await waitFor(() => expect(afterRestart.result.current.isReady).toBe(true));
    expect(afterRestart.result.current.hasDismissed).toBe(true);
    expect(mockReadVoiceExamplesDismissed).toHaveBeenCalledWith(accountB);
  });

  it("write failure logs without freezing UI", async (): Promise<void> => {
    mockDismissVoiceExamples.mockRejectedValueOnce(
      new Error("device storage full")
    );
    const first = renderPreference(accountA);
    await waitFor(() => expect(first.result.current.isReady).toBe(true));

    let finishWrite: Promise<void> = Promise.resolve();
    act(() => {
      finishWrite = first.result.current.dismissExamples();
    });
    expect(first.result.current.hasDismissed).toBe(true);

    await act(async () => {
      await finishWrite;
    });
    expect(mockLogPreferenceFailure).toHaveBeenCalled();
    expect(first.result.current.isReady).toBe(true);
    expect(first.result.current.hasDismissed).toBe(true);

    first.unmount();
    const afterRestart = renderPreference(accountA);
    await waitFor(() => expect(afterRestart.result.current.isReady).toBe(true));
    expect(afterRestart.result.current.hasDismissed).toBe(false);
  });

  it("unmount ignores a late read", async (): Promise<void> => {
    const pendingRead = createDeferred<boolean>();
    mockReadVoiceExamplesDismissed.mockReturnValueOnce(pendingRead.promise);
    const mounted = renderPreference(accountA);
    expect(mounted.result.current.isReady).toBe(false);

    mounted.unmount();
    const nextAccount = renderPreference(accountB);
    await waitFor(() => expect(nextAccount.result.current.isReady).toBe(true));
    expect(nextAccount.result.current.hasDismissed).toBe(false);

    await act(async () => {
      pendingRead.resolve(true);
      await pendingRead.promise;
    });

    expect(nextAccount.result.current.isReady).toBe(true);
    expect(nextAccount.result.current.hasDismissed).toBe(false);
    expect(mockDismissVoiceExamples).not.toHaveBeenCalled();
  });
});
