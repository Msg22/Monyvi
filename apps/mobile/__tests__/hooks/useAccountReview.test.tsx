/**
 * #395 T030 TESTS FIRST — typed lifecycle facade Red (future hook SUT).
 * The hook does not own SMS SQLite writes, reducer business rules or parsing.
 * Mock only the real bootstrap, command and owned-account read services.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AccountReviewSession } from "../../../../packages/logic/src/account-review/review-schemas";
import {
  reduceAccountReviewCommand,
  type AccountReviewCommandResult,
} from "../../../../packages/logic/src/account-review/reducer";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  createDeferred,
  makeAcceptedCommandResult,
  makeCurrencyCommand,
  makeGroupCommand,
  makeSelectCommand,
  makeSmsReviewInput,
  makeSmsReviewSession,
  makeUndoCommand,
  makeVoiceReviewInput,
  makeVoiceReviewSession,
  T030_FOREIGN_OWNER,
  T030_OTHER_QUEUE,
  T030_OWNER,
  T030_QUEUE,
  T030_UNDO_TOKEN,
  T030_VOICE_SESSION,
  type Deferred,
} from "./useAccountReview-test-helpers";
import {
  useAccountReview,
  type UseAccountReviewInput,
} from "@/hooks/useAccountReview";

type BootstrapService =
  typeof import("@/services/account-review-legacy-bootstrap-service").loadOrBootstrapOwnedSmsReviewSession;
type SmsCommandService =
  typeof import("@/services/account-review-command-service").executeSmsAccountReviewCommand;
type ReadAccountsService =
  typeof import("@/services/account-review-read-model-service").loadAccountReviewAccountSnapshots;

const mockLoadOrBootstrap = jest.fn<
  ReturnType<BootstrapService>,
  Parameters<BootstrapService>
>();
const mockExecuteSmsCommand = jest.fn<
  ReturnType<SmsCommandService>,
  Parameters<SmsCommandService>
>();
const mockLoadAccountSnapshots = jest.fn<
  ReturnType<ReadAccountsService>,
  Parameters<ReadAccountsService>
>();
// The real owned-read service has no owner argument; it obtains the current
// authenticated scope itself. This test boundary mirrors that authenticated
// actor at the moment each account snapshot is requested.
let mockAuthenticatedOwnerId: AccountReviewSession["ownerId"] = T030_OWNER;

// jest-expo's generated ExpoCrypto mock leaves randomUUID() undefined.
// This test file needs a real canonical v4 value for the reducer's Undo lease.
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
}));

jest.mock("@/services/account-review-legacy-bootstrap-service", () => ({
  loadOrBootstrapOwnedSmsReviewSession: (
    ...args: Parameters<BootstrapService>
  ): ReturnType<BootstrapService> => mockLoadOrBootstrap(...args),
}));
jest.mock("@/services/account-review-command-service", () => ({
  executeSmsAccountReviewCommand: (
    ...args: Parameters<SmsCommandService>
  ): ReturnType<SmsCommandService> => mockExecuteSmsCommand(...args),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (
    ...args: Parameters<ReadAccountsService>
  ): ReturnType<ReadAccountsService> => mockLoadAccountSnapshots(...args),
}));

function bootstrapSignal(index: number): AbortSignal | undefined {
  return mockLoadOrBootstrap.mock.calls[index]?.[0].signal;
}

async function publish<T>(pending: Deferred<T>, value: T): Promise<void> {
  await act(async (): Promise<void> => {
    pending.resolve(value);
    await pending.promise;
  });
}

async function publishRejection(
  pending: Deferred<AccountReviewSession>,
  failure: Error
): Promise<void> {
  await act(async (): Promise<void> => {
    pending.reject(failure);
    await pending.promise.catch(() => undefined);
  });
}

beforeEach(() => {
  mockLoadOrBootstrap.mockReset();
  mockExecuteSmsCommand.mockReset();
  mockLoadAccountSnapshots.mockReset();
  mockAuthenticatedOwnerId = T030_OWNER;
  mockLoadAccountSnapshots.mockImplementation(
    (): ReturnType<ReadAccountsService> =>
      Promise.resolve({
        ...makeOwnedContext(),
        ownerId: mockAuthenticatedOwnerId,
      })
  );
});

describe("#395 T030 useAccountReview lifecycle facade", () => {
  describe("owned SMS bootstrap and retry", () => {
    it("loads the exact owned queue/session via the existing service and releases busy", async () => {
      const session = makeSmsReviewSession();
      mockLoadOrBootstrap.mockResolvedValue(session);
      const input = makeSmsReviewInput();
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(result.current.session).toEqual(session));
      expect(mockLoadOrBootstrap).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOwnerId: T030_OWNER,
          queueId: T030_QUEUE,
        })
      );
      expect(result.current.isBusy).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("rejects bootstrap failure without publishing a partial session", async () => {
      const failure = new Error("owned SMS load failed");
      mockLoadOrBootstrap.mockRejectedValue(failure);
      const input = makeSmsReviewInput();
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(result.current.error).toBe(failure));
      expect(result.current.session).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it("reload invokes authenticated bootstrap again and clears a prior error", async () => {
      const failure = new Error("temporary bootstrap error");
      const session = makeSmsReviewSession();
      mockLoadOrBootstrap
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(session);
      const input = makeSmsReviewInput();
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(result.current.error).toBe(failure));
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.session).toEqual(session));
      expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it("external abort cancels pending bootstrap and ignores its late success", async () => {
      const pending = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap.mockReturnValue(pending.promise);
      const controller = new AbortController();
      const input = makeSmsReviewInput(
        T030_OWNER,
        T030_QUEUE,
        controller.signal
      );
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      expect(result.current.isBusy).toBe(true);
      await act(async (): Promise<void> => {
        controller.abort();
        await Promise.resolve();
      });
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      await publish(pending, makeSmsReviewSession());
      expect(result.current.session).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it("old bootstrap success cannot overwrite a newer successful reload", async () => {
      const old = createDeferred<AccountReviewSession>();
      const original = makeSmsReviewSession();
      const accepted = makeAcceptedCommandResult(
        original,
        makeGroupCommand(original, "confirm_group")
      ).state;
      mockLoadOrBootstrap
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(accepted);
      const input = makeSmsReviewInput();
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.session).toEqual(accepted));
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      await publish(old, original);
      expect(result.current.session).toEqual(accepted);
      expect(result.current.error).toBeNull();
    });

    it("old bootstrap failure cannot replace a newer accepted reload", async () => {
      const old = createDeferred<AccountReviewSession>();
      const original = makeSmsReviewSession();
      const accepted = makeAcceptedCommandResult(
        original,
        makeGroupCommand(original, "confirm_group")
      ).state;
      mockLoadOrBootstrap
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(accepted);
      const input = makeSmsReviewInput();
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.session).toEqual(accepted));
      await publishRejection(old, new Error("old transport error"));
      expect(result.current.session).toEqual(accepted);
      expect(result.current.error).toBeNull();
    });
  });

  describe("Voice stays memory-only", () => {
    it("uses a genuinely normalized Voice session, never SMS bootstrap/write", async () => {
      const voice = await makeVoiceReviewSession();
      expect(voice.source).toBe("VOICE");
      expect(voice.rows[0]?.source).toBe("VOICE");
      expect(voice.rows[0]?.sourceFingerprint).toBeNull();
      const input = makeVoiceReviewInput(voice);
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(result.current.session).toEqual(voice));
      expect(result.current.error).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("awaits a local Voice command and publishes only its canonical result", async () => {
      const voice = await makeVoiceReviewSession();
      const command = makeCurrencyCommand(voice);
      const accepted = makeAcceptedCommandResult(voice, command);
      expect(accepted.effect).toBe("session_only");
      const input = makeVoiceReviewInput(voice);
      const { result } = renderHook(() => useAccountReview(input));
      await waitFor(() => expect(result.current.session).toEqual(voice));
      await act(async (): Promise<void> => {
        await result.current.dispatch(command);
      });
      expect(result.current.session).toEqual(accepted.state);
      expect(result.current.error).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("a null Voice session remains empty without accessing SMS storage", async () => {
      const input = makeVoiceReviewInput(null);
      expect(input.sessionId).toBe(T030_VOICE_SESSION);
      const { result } = renderHook(() => useAccountReview(input));
      await act(async (): Promise<void> => {
        await Promise.resolve();
      });
      expect(result.current.session).toBeNull();
      expect(result.current.isBusy).toBe(false);
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });
  });

  describe("owner, logout, source and session cancellation", () => {
    it("owner switch revokes old pending bootstrap and rejects its late result", async () => {
      const old = createDeferred<AccountReviewSession>();
      const foreign = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(foreign.promise);
      interface OwnerProps {
        readonly ownerId: string | null;
      }
      const initialProps: OwnerProps = { ownerId: T030_OWNER };
      const { result, rerender } = renderHook(
        (props: OwnerProps) =>
          useAccountReview(makeSmsReviewInput(props.ownerId)),
        { initialProps }
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      // A genuine owner switch changes the authenticated account-read scope,
      // not just the SMS bootstrap session owner. Other stale/foreign negative
      // fixtures continue to use their explicit mismatched contexts.
      mockAuthenticatedOwnerId = T030_FOREIGN_OWNER;
      rerender({ ownerId: T030_FOREIGN_OWNER });
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(mockLoadAccountSnapshots).toHaveBeenCalledTimes(2)
      );
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      expect(mockLoadOrBootstrap).toHaveBeenLastCalledWith(
        expect.objectContaining({
          expectedOwnerId: T030_FOREIGN_OWNER,
          queueId: T030_QUEUE,
        })
      );
      expect(result.current.session).toBeNull();
      await publish(old, makeSmsReviewSession());
      expect(result.current.session).toBeNull();
      await publish(
        foreign,
        makeSmsReviewSession(T030_QUEUE, T030_FOREIGN_OWNER)
      );
      expect(result.current.session?.ownerId).toBe(T030_FOREIGN_OWNER);
    });

    it("logout clears session/errors, aborts work and does not bootstrap null owner", async () => {
      const pending = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap.mockReturnValue(pending.promise);
      interface LogoutProps {
        readonly ownerId: string | null;
      }
      const initialProps: LogoutProps = { ownerId: T030_OWNER };
      const { result, rerender } = renderHook(
        (props: LogoutProps) =>
          useAccountReview(makeSmsReviewInput(props.ownerId)),
        { initialProps }
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      rerender({ ownerId: null });
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      await publish(pending, makeSmsReviewSession());
      expect(result.current.session).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
      expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1);
    });

    it("queue/session replacement invalidates stale load before accepting the new queue", async () => {
      const old = createDeferred<AccountReviewSession>();
      const fresh = makeSmsReviewSession(T030_OTHER_QUEUE);
      mockLoadOrBootstrap
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(fresh);
      interface QueueProps {
        readonly queueId: string;
      }
      const initialProps: QueueProps = { queueId: T030_QUEUE };
      const { result, rerender } = renderHook(
        (props: QueueProps) =>
          useAccountReview(makeSmsReviewInput(T030_OWNER, props.queueId)),
        { initialProps }
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      rerender({ queueId: T030_OTHER_QUEUE });
      await waitFor(() => expect(result.current.session).toEqual(fresh));
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      expect(mockLoadOrBootstrap).toHaveBeenLastCalledWith(
        expect.objectContaining({
          queueId: T030_OTHER_QUEUE,
          expectedOwnerId: T030_OWNER,
        })
      );
      await publish(old, makeSmsReviewSession(T030_QUEUE));
      expect(result.current.session).toEqual(fresh);
    });

    it("source switch to Voice cannot publish a late SMS bootstrap failure", async () => {
      const stale = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap.mockReturnValue(stale.promise);
      const voice = await makeVoiceReviewSession();
      interface ModeProps {
        readonly input: UseAccountReviewInput;
      }
      const initialProps: ModeProps = { input: makeSmsReviewInput() };
      const { result, rerender } = renderHook(
        (props: ModeProps) => useAccountReview(props.input),
        { initialProps }
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      rerender({ input: makeVoiceReviewInput(voice) });
      await waitFor(() => expect(result.current.session).toEqual(voice));
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      await publishRejection(stale, new Error("old SMS source failure"));
      expect(result.current.session).toEqual(voice);
      expect(result.current.error).toBeNull();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("unmount aborts an in-flight authenticated load without publishing", async () => {
      const pending = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap.mockReturnValue(pending.promise);
      const { unmount } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      unmount();
      expect(bootstrapSignal(0)?.aborted).toBe(true);
      await publish(pending, makeSmsReviewSession());
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });
  });

  describe("serialized SMS command service dispatch", () => {
    it("does not enter the SMS command writer while owned bootstrap is pending", async () => {
      const initial = makeSmsReviewSession();
      const command = makeGroupCommand(initial, "confirm_group");
      const pendingBootstrap = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap.mockReturnValue(pendingBootstrap.promise);
      const accepted = makeAcceptedCommandResult(initial, command);
      mockExecuteSmsCommand.mockResolvedValue(accepted);
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      expect(result.current.isBusy).toBe(true);
      let attempted!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        attempted = result.current.dispatch(command);
      });
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
      let dispatched: AccountReviewCommandResult | null = null;
      await act(async (): Promise<void> => {
        pendingBootstrap.resolve(initial);
        await pendingBootstrap.promise;
        dispatched = await attempted;
      });
      expect(mockExecuteSmsCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteSmsCommand).toHaveBeenCalledWith(
        expect.objectContaining({ queueId: T030_QUEUE, command })
      );
      expect(dispatched).toEqual(accepted);
      expect(result.current.session).toEqual(accepted.state);
      expect(result.current.isBusy).toBe(false);
    });

    it("passes exact queue, command and current owned snapshots to the real service boundary", async () => {
      const initial = makeSmsReviewSession();
      const command = makeGroupCommand(initial, "confirm_group");
      const accepted = makeAcceptedCommandResult(initial, command);
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand.mockResolvedValue(accepted);
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      await act(async (): Promise<void> => {
        await result.current.dispatch(command);
      });
      expect(mockExecuteSmsCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          queueId: T030_QUEUE,
          command,
          accountSnapshots: makeOwnedContext(),
        })
      );
      expect(result.current.session).toEqual(accepted.state);
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it("two truly overlapping dispatches use one in-flight service call and commit FIFO", async () => {
      const initial = makeSmsReviewSession();
      const confirm = makeGroupCommand(initial, "confirm_group");
      const first = makeAcceptedCommandResult(initial, confirm);
      const select = makeSelectCommand(first.state);
      const second = makeAcceptedCommandResult(first.state, select);
      const firstDeferred = createDeferred<AccountReviewCommandResult>();
      const secondDeferred = createDeferred<AccountReviewCommandResult>();
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand
        .mockReturnValueOnce(firstDeferred.promise)
        .mockReturnValueOnce(secondDeferred.promise);
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      let firstRequest!: ReturnType<typeof result.current.dispatch>;
      let secondRequest!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        firstRequest = result.current.dispatch(confirm);
        secondRequest = result.current.dispatch(select);
      });
      expect(mockExecuteSmsCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteSmsCommand.mock.calls[0]?.[0].command).toEqual(confirm);
      expect(result.current.isBusy).toBe(true);
      await act(async (): Promise<void> => {
        firstDeferred.resolve(first);
        await firstRequest;
      });
      await waitFor(() =>
        expect(mockExecuteSmsCommand).toHaveBeenCalledTimes(2)
      );
      expect(mockExecuteSmsCommand.mock.calls[1]?.[0].command).toEqual(select);
      expect(result.current.isBusy).toBe(true);
      await act(async (): Promise<void> => {
        secondDeferred.resolve(second);
        await secondRequest;
      });
      expect(result.current.session).toEqual(second.state);
      expect(result.current.isBusy).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("rejected command releases busy without publishing a speculative state", async () => {
      const initial = makeSmsReviewSession();
      const command = makeGroupCommand(initial, "confirm_group");
      const pending = createDeferred<AccountReviewCommandResult>();
      const failure = new Error("SQLite command rolled back");
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(makeAcceptedCommandResult(initial, command));
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      expect(result.current.readModel).not.toBeNull();
      const verifiedReadModel = result.current.readModel;
      const verifiedAccounts = result.current.choiceAccounts;
      let failed!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        failed = result.current.dispatch(command);
      });
      expect(result.current.isBusy).toBe(true);
      const rejection = expect(failed).rejects.toBe(failure);
      await act(async (): Promise<void> => {
        pending.reject(failure);
        await rejection;
      });
      expect(result.current.session).toEqual(initial);
      expect(result.current.isBusy).toBe(false);
      // A recoverable command rejection reaches dispatch, not the fatal view.
      expect(result.current.error).toBeNull();
      expect(result.current.readModel).toEqual(verifiedReadModel);
      expect(result.current.choiceAccounts).toEqual(verifiedAccounts);
      await act(async (): Promise<void> => {
        await result.current.dispatch(command);
      });
      expect(mockExecuteSmsCommand).toHaveBeenCalledTimes(2);
      expect(result.current.session?.revision).toBe("1");
      expect(result.current.error).toBeNull();
    });

    it("a delayed old command success cannot roll back newer accepted reload state", async () => {
      const initial = makeSmsReviewSession();
      const staleCommand = makeGroupCommand(initial, "remove_group");
      const stale = makeAcceptedCommandResult(
        initial,
        staleCommand,
        T030_UNDO_TOKEN
      );
      const newer = makeAcceptedCommandResult(
        initial,
        makeGroupCommand(initial, "confirm_group")
      ).state;
      const pending = createDeferred<AccountReviewCommandResult>();
      mockLoadOrBootstrap
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(newer);
      mockExecuteSmsCommand.mockReturnValue(pending.promise);
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      let request!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        request = result.current.dispatch(staleCommand);
      });
      // Reload rejects the active outward Promise synchronously: attach first.
      const observed = request.catch(() => undefined);
      expect(result.current.isBusy).toBe(true);
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.session).toEqual(newer));
      await act(async (): Promise<void> => {
        pending.resolve(stale);
        await observed;
      });
      expect(result.current.session).toEqual(newer);
      expect(result.current.error).toBeNull();
    });

    it("a delayed old command failure cannot overwrite a newer accepted reload", async () => {
      const initial = makeSmsReviewSession();
      const command = makeGroupCommand(initial, "confirm_group");
      const newer = makeAcceptedCommandResult(initial, command).state;
      const pending = createDeferred<AccountReviewCommandResult>();
      mockLoadOrBootstrap
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(newer);
      mockExecuteSmsCommand.mockReturnValue(pending.promise);
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      let request!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        request = result.current.dispatch(command);
      });
      // Observe the cancellation before reload, not after the late rejection.
      const observed = request.catch(() => undefined);
      act(() => result.current.reload());
      await waitFor(() => expect(result.current.session).toEqual(newer));
      const failure = new Error("old command now rejected");
      await act(async (): Promise<void> => {
        pending.reject(failure);
        await observed;
      });
      expect(result.current.session).toEqual(newer);
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it("a pending SMS command is invalidated by logout without leaking the old row", async () => {
      const initial = makeSmsReviewSession();
      const command = makeGroupCommand(initial, "confirm_group");
      const pending = createDeferred<AccountReviewCommandResult>();
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand.mockReturnValue(pending.promise);
      interface ActorProps {
        readonly ownerId: string | null;
      }
      const initialProps: ActorProps = { ownerId: T030_OWNER };
      const { result, rerender } = renderHook(
        (props: ActorProps) =>
          useAccountReview(makeSmsReviewInput(props.ownerId)),
        { initialProps }
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      let request!: ReturnType<typeof result.current.dispatch>;
      act(() => {
        request = result.current.dispatch(command);
      });
      rerender({ ownerId: null });
      await act(async (): Promise<void> => {
        pending.resolve(makeAcceptedCommandResult(initial, command));
        await request.catch(() => undefined);
      });
      expect(result.current.session).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
      expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1);
    });
  });

  describe("Remove and volatile Undo lease", () => {
    it("passes a real transient removal token and restores through the SMS command service", async () => {
      const initial = makeSmsReviewSession();
      const remove = makeGroupCommand(initial, "remove_group");
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand.mockImplementationOnce((input) =>
        Promise.resolve(
          makeAcceptedCommandResult(
            initial,
            input.command,
            input.nextUndoToken ?? null
          )
        )
      );
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      await act(async (): Promise<void> => {
        await result.current.dispatch(remove);
      });
      const removed = result.current.session;
      const token = result.current.undoToken;
      if (!removed || !token)
        throw new Error("Missing committed volatile Undo lease");
      expect(removed.groups[0]?.status).toBe("removed");
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(mockExecuteSmsCommand.mock.calls[0]?.[0].nextUndoToken).toBe(
        token
      );
      const undo = makeUndoCommand(removed, token);
      mockExecuteSmsCommand.mockImplementationOnce((input) =>
        Promise.resolve(
          makeAcceptedCommandResult(removed, input.command, null, {
            token,
            previousState: initial,
            afterRemovalGeneration: removed.operationGeneration,
          })
        )
      );
      await act(async (): Promise<void> => {
        await result.current.dispatch(undo);
      });
      expect(mockExecuteSmsCommand.mock.calls[1]?.[0].command).toEqual(undo);
      expect(result.current.session?.groups[0]?.status).toBe("pending");
      expect(result.current.undoToken).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("intervening accepted row edit invalidates older Undo without reverting choices", async () => {
      const initial = makeSmsReviewSession();
      const remove = makeGroupCommand(initial, "remove_group");
      mockLoadOrBootstrap.mockResolvedValue(initial);
      mockExecuteSmsCommand.mockImplementationOnce((input) =>
        Promise.resolve(
          makeAcceptedCommandResult(
            initial,
            input.command,
            input.nextUndoToken ?? null
          )
        )
      );
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput())
      );
      await waitFor(() => expect(result.current.session).toEqual(initial));
      await act(async (): Promise<void> => {
        await result.current.dispatch(remove);
      });
      const removed = result.current.session;
      const token = result.current.undoToken;
      if (!removed || !token)
        throw new Error("Missing removal for stale Undo test");
      const edit = makeCurrencyCommand(removed);
      const edited = makeAcceptedCommandResult(removed, edit);
      mockExecuteSmsCommand.mockResolvedValueOnce(edited);
      await act(async (): Promise<void> => {
        await result.current.dispatch(edit);
      });
      expect(result.current.session).toEqual(edited.state);
      expect(result.current.undoToken).toBeNull();
      const staleUndo = makeUndoCommand(edited.state, token);
      const invalidUndo = reduceAccountReviewCommand({
        state: edited.state,
        command: staleUndo,
        accountSnapshots: makeOwnedContext(),
        nextUndoToken: null,
        undo: null,
      });
      expect(invalidUndo.reasonCodes).toEqual(["review_undo_invalid"]);
      mockExecuteSmsCommand.mockResolvedValueOnce(invalidUndo);
      await act(async (): Promise<void> => {
        await result.current.dispatch(staleUndo);
      });
      expect(result.current.session).toEqual(edited.state);
      expect(result.current.session?.groups[0]?.status).toBe("removed");
      expect(result.current.undoToken).toBeNull();
    });
  });
});
