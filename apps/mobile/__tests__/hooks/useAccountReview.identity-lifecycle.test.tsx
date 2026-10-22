/**
 * #395 T030 TESTS FIRST — typed lifecycle facade Red (future hook SUT).
 * The hook does not own SMS SQLite writes, reducer business rules or parsing.
 * Mock only the real bootstrap, command and owned-account read services.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import { mergeAccountReviewLateRows } from "../../../../packages/logic/src/account-review/reducer-merge";
import {
  autoSelectReadyReviewSession,
  type AccountReviewCommandResult,
} from "../../../../packages/logic/src/account-review/reducer";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  cloneCanonicalReviewSession,
  createDeferred,
  makeAcceptedCommandResult,
  makeCurrencyCommand,
  makeGroupCommand,
  makeSmsReviewInput,
  makeSmsReviewSession,
  makeVoiceReviewInput,
  makeVoiceReviewSession,
  T030_FOREIGN_OWNER,
  T030_OTHER_QUEUE,
  T030_OWNER,
  T030_QUEUE,
  type Deferred,
} from "./useAccountReview-test-helpers";
import {
  useAccountReview,
  type UseAccountReviewInput,
  type UseAccountReviewResult,
} from "@/hooks/useAccountReview";

type BootstrapService =
  typeof import("@/services/account-review-legacy-bootstrap-service").loadOrBootstrapOwnedSmsReviewSession;
type SmsCommandService =
  typeof import("@/services/account-review-command-service").executeSmsAccountReviewCommand;
type SmsReadyService =
  typeof import("@/services/account-review-command-service").initializeSmsAccountReviewReadySelection;
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
const mockInitializeSmsReady = jest.fn<
  ReturnType<SmsReadyService>,
  Parameters<SmsReadyService>
>();
const mockLoadAccountSnapshots = jest.fn<
  ReturnType<ReadAccountsService>,
  Parameters<ReadAccountsService>
>();

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
  initializeSmsAccountReviewReadySelection: (
    ...args: Parameters<SmsReadyService>
  ): ReturnType<SmsReadyService> => mockInitializeSmsReady(...args),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (
    ...args: Parameters<ReadAccountsService>
  ): ReturnType<ReadAccountsService> => mockLoadAccountSnapshots(...args),
}));

interface FacadeRenderCapture {
  readonly identity: string;
  readonly session: AccountReviewSession | null;
  readonly isBusy: boolean;
  readonly error: Error | null;
  readonly undoToken: string | null;
}

/** The replacement owner has its own empty snapshot, not A's reused account IDs. */
function foreignAccountSnapshots(): Awaited<ReturnType<ReadAccountsService>> {
  const original = makeOwnedContext();
  return {
    ...original,
    ownerId: T030_FOREIGN_OWNER,
    accounts: [],
    providerContext: { ...original.providerContext, accounts: [] },
  };
}

/** The render callback runs BEFORE identity-sensitive useEffect cleanup. */
function captureFacadeRender(
  identity: string,
  view: UseAccountReviewResult
): FacadeRenderCapture {
  return {
    identity,
    session: view.session,
    isBusy: view.isBusy,
    error: view.error,
    undoToken: view.undoToken,
  };
}

async function publish<T>(pending: Deferred<T>, value: T): Promise<void> {
  await act(async (): Promise<void> => {
    pending.resolve(value);
    await pending.promise;
  });
}

beforeEach(() => {
  mockLoadOrBootstrap.mockReset();
  mockExecuteSmsCommand.mockReset();
  mockInitializeSmsReady.mockReset();
  mockInitializeSmsReady.mockImplementation(
    ({ ownerId, queueId, expectedSession }): ReturnType<SmsReadyService> => {
      if (
        expectedSession.ownerId !== ownerId ||
        expectedSession.sessionId !== queueId
      ) {
        throw new Error("invalid_sms_bootstrap_expected_session");
      }
      const owned =
        ownerId === T030_FOREIGN_OWNER
          ? foreignAccountSnapshots()
          : makeOwnedContext();
      if (owned.ownerId !== ownerId)
        throw new Error("invalid_sms_bootstrap_account_scope");
      // Simulate the separate authenticated writer boundary through the real
      // pure readiness transition, never fabricated selected rows/revisions.
      return Promise.resolve(
        autoSelectReadyReviewSession(expectedSession, owned, new Set<string>())
          .state
      );
    }
  );
  mockLoadAccountSnapshots.mockReset();
  mockLoadAccountSnapshots.mockResolvedValue(makeOwnedContext());
});

describe("#395 T030 independent identity, authority and outward cancellation regressions", () => {
  describe("Voice external authority lifecycle", () => {
    it("equivalent cloned original Voice input cannot overwrite a newer local decision", async () => {
      const original = await makeVoiceReviewSession();
      const command = makeCurrencyCommand(original);
      const accepted = makeAcceptedCommandResult(original, command);
      interface Props {
        readonly input: UseAccountReviewInput;
      }
      const { result, rerender } = renderHook(
        (props: Props) => useAccountReview(props.input),
        { initialProps: { input: makeVoiceReviewInput(original) } }
      );
      await waitFor(() => expect(result.current.session).toEqual(original));
      await act(async (): Promise<void> => {
        await result.current.dispatch(command);
      });
      expect(result.current.session).toEqual(accepted.state);

      const equivalentOriginal = cloneCanonicalReviewSession(original);
      expect(equivalentOriginal).not.toBe(original);
      expect(equivalentOriginal).toEqual(original);
      expect(equivalentOriginal.revision).toBe(original.revision);
      expect(equivalentOriginal.sessionId).toBe(accepted.state.sessionId);
      rerender({ input: makeVoiceReviewInput(equivalentOriginal) });
      expect(result.current.session).toEqual(accepted.state);
      expect(result.current.session?.revision).toBe(accepted.state.revision);
      expect(result.current.error).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("honors a genuinely newer authoritative Voice revision and a replacement session", async () => {
      const original = await makeVoiceReviewSession();
      const localCommand = makeCurrencyCommand(original);
      const accepted = makeAcceptedCommandResult(original, localCommand);
      const newerAuthority = makeAcceptedCommandResult(
        accepted.state,
        makeCurrencyCommand(accepted.state)
      ).state;
      const replacement = await makeVoiceReviewSession(T030_OTHER_QUEUE);
      interface Props {
        readonly input: UseAccountReviewInput;
      }
      const { result, rerender } = renderHook(
        (props: Props) => useAccountReview(props.input),
        { initialProps: { input: makeVoiceReviewInput(original) } }
      );
      await waitFor(() => expect(result.current.session).toEqual(original));
      await act(async (): Promise<void> => {
        await result.current.dispatch(localCommand);
      });
      expect(result.current.session).toEqual(accepted.state);

      expect(newerAuthority.revision).not.toBe(accepted.state.revision);
      rerender({ input: makeVoiceReviewInput(newerAuthority) });
      await waitFor(() =>
        expect(result.current.session).toEqual(newerAuthority)
      );
      expect(result.current.error).toBeNull();

      expect(replacement.sessionId).not.toBe(newerAuthority.sessionId);
      rerender({ input: makeVoiceReviewInput(replacement) });
      await waitFor(() => expect(result.current.session).toEqual(replacement));
      expect(result.current.undoToken).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("preserves accepted Voice choice when incoming source revision advances but review authority regresses", async () => {
      const original = accountReviewSessionSchema.parse({
        ...(await makeVoiceReviewSession()),
        sourceRevision: "1",
        revision: "4",
        operationGeneration: "4",
      });
      const command = makeCurrencyCommand(original);
      const accepted = makeAcceptedCommandResult(original, command);
      expect(accepted.state).toMatchObject({
        sourceRevision: "1",
        revision: "5",
        operationGeneration: "5",
      });
      expect(accepted.state.rows).not.toEqual(original.rows);
      const incoming = accountReviewSessionSchema.parse({
        ...cloneCanonicalReviewSession(original),
        sourceRevision: "2",
      });
      expect(incoming).toMatchObject({
        sourceRevision: "2",
        revision: "4",
        operationGeneration: "4",
      });
      // Canonical late-evidence merge preserves already accepted user choices.
      expect(
        mergeAccountReviewLateRows({
          current: accepted.state,
          incoming,
        })
      ).toEqual(accepted.state);

      interface Props {
        readonly input: UseAccountReviewInput;
      }
      const { result, rerender } = renderHook(
        (props: Props) => useAccountReview(props.input),
        { initialProps: { input: makeVoiceReviewInput(original) } }
      );
      await waitFor(() => expect(result.current.session).toEqual(original));
      await act(async (): Promise<void> => {
        await result.current.dispatch(command);
      });
      expect(result.current.session).toEqual(accepted.state);
      rerender({ input: makeVoiceReviewInput(incoming) });
      expect(result.current.session).toEqual(accepted.state);
      expect(result.current.session?.rows).toEqual(accepted.state.rows);
      expect(result.current.undoToken).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it("still adopts genuinely newer Voice source evidence with monotonic review authority", async () => {
      const original = accountReviewSessionSchema.parse({
        ...(await makeVoiceReviewSession()),
        sourceRevision: "1",
        revision: "4",
        operationGeneration: "4",
      });
      const firstCommand = makeCurrencyCommand(original);
      const accepted = makeAcceptedCommandResult(original, firstCommand);
      const latest = makeAcceptedCommandResult(
        accepted.state,
        makeCurrencyCommand(accepted.state)
      ).state;
      const newer = accountReviewSessionSchema.parse({
        ...latest,
        sourceRevision: "2",
      });
      expect(newer).toMatchObject({
        sourceRevision: "2",
        revision: "6",
        operationGeneration: "6",
      });

      interface Props {
        readonly input: UseAccountReviewInput;
      }
      const { result, rerender } = renderHook(
        (props: Props) => useAccountReview(props.input),
        { initialProps: { input: makeVoiceReviewInput(original) } }
      );
      await waitFor(() => expect(result.current.session).toEqual(original));
      await act(async (): Promise<void> => {
        await result.current.dispatch(firstCommand);
      });
      expect(result.current.session).toEqual(accepted.state);
      rerender({ input: makeVoiceReviewInput(newer) });
      await waitFor(() => expect(result.current.session).toEqual(newer));
      expect(result.current.error).toBeNull();
      expect(mockLoadOrBootstrap).not.toHaveBeenCalled();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });

    it.each(["owner", "source", "session"] as const)(
      "rejects canonical but nested-%s-invalid Voice data before suppressing stale external input",
      async (mismatch) => {
        const original = await makeVoiceReviewSession();
        const command = makeCurrencyCommand(original);
        const accepted = makeAcceptedCommandResult(original, command);
        const nested: AccountReviewSession =
          mismatch === "owner"
            ? accountReviewSessionSchema.parse({
                ...cloneCanonicalReviewSession(original),
                ownerId: T030_FOREIGN_OWNER,
              })
            : mismatch === "source"
              ? makeSmsReviewSession(original.sessionId)
              : await makeVoiceReviewSession(T030_OTHER_QUEUE);
        expect(accountReviewSessionSchema.parse(nested)).toEqual(nested);
        expect(nested.revision).toBe(original.revision);
        const malformed: UseAccountReviewInput = {
          mode: "VOICE",
          ownerId: original.ownerId,
          sessionId: original.sessionId,
          voiceSession: nested,
        };
        let leakedPreviousSession = false;
        interface Props {
          readonly input: UseAccountReviewInput;
        }
        const { result, rerender } = renderHook(
          (props: Props) => {
            const view = useAccountReview(props.input);
            if (props.input === malformed && view.session !== null) {
              leakedPreviousSession = true;
            }
            return view;
          },
          { initialProps: { input: makeVoiceReviewInput(original) } }
        );
        await waitFor(() => expect(result.current.session).toEqual(original));
        await act(async (): Promise<void> => {
          await result.current.dispatch(command);
        });
        expect(result.current.session).toEqual(accepted.state);
        // An otherwise valid nested snapshot cannot impersonate the outer
        // owner/source/session simply by carrying a stale or equal revision.
        expect(() => rerender({ input: malformed })).toThrow(
          /account_review_.*(scope|owner|source)/
        );
        expect(leakedPreviousSession).toBe(false);
      }
    );
  });

  describe("P1 render-time identity isolation (before any effect cleanup)", () => {
    it("never renders the old owner's accepted rows or Undo token for a new owner", async () => {
      const original = makeSmsReviewSession();
      const foreign = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap
        .mockResolvedValueOnce(original)
        .mockReturnValueOnce(foreign.promise);
      mockExecuteSmsCommand.mockImplementationOnce((input) =>
        Promise.resolve(
          makeAcceptedCommandResult(
            original,
            input.command,
            input.nextUndoToken ?? null
          )
        )
      );
      const captures: FacadeRenderCapture[] = [];
      interface Props {
        readonly ownerId: string;
      }
      const { result, rerender } = renderHook(
        (props: Props) => {
          const view = useAccountReview(makeSmsReviewInput(props.ownerId));
          captures.push(captureFacadeRender(props.ownerId, view));
          return view;
        },
        { initialProps: { ownerId: T030_OWNER } }
      );
      await waitFor(() => expect(result.current.session).toEqual(original));
      await act(async (): Promise<void> => {
        await result.current.dispatch(
          makeGroupCommand(original, "remove_group")
        );
      });
      expect(result.current.session?.groups[0]?.status).toBe("removed");
      expect(result.current.undoToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );

      mockLoadAccountSnapshots.mockResolvedValue(foreignAccountSnapshots());
      rerender({ ownerId: T030_FOREIGN_OWNER });
      const firstForeignRender = captures.find(
        (capture) => capture.identity === T030_FOREIGN_OWNER
      );
      expect(firstForeignRender).toMatchObject({
        session: null,
        isBusy: false,
        error: null,
        undoToken: null,
      });
      await publish(
        foreign,
        makeSmsReviewSession(T030_QUEUE, T030_FOREIGN_OWNER)
      );
      expect(result.current.session?.ownerId).toBe(T030_FOREIGN_OWNER);
      expect(mockInitializeSmsReady).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: T030_FOREIGN_OWNER,
          queueId: T030_QUEUE,
          expectedSession: makeSmsReviewSession(T030_QUEUE, T030_FOREIGN_OWNER),
        })
      );
    });

    it("does not render a previous pending queue's busy state in the new session", async () => {
      const pendingFirst = createDeferred<AccountReviewSession>();
      const pendingSecond = createDeferred<AccountReviewSession>();
      mockLoadOrBootstrap
        .mockReturnValueOnce(pendingFirst.promise)
        .mockReturnValueOnce(pendingSecond.promise);
      const captures: FacadeRenderCapture[] = [];
      interface Props {
        readonly queueId: string;
      }
      const { result, rerender } = renderHook(
        (props: Props) => {
          const view = useAccountReview(
            makeSmsReviewInput(T030_OWNER, props.queueId)
          );
          captures.push(captureFacadeRender(props.queueId, view));
          return view;
        },
        { initialProps: { queueId: T030_QUEUE } }
      );
      await waitFor(() => expect(mockLoadOrBootstrap).toHaveBeenCalledTimes(1));
      expect(result.current.isBusy).toBe(true);

      rerender({ queueId: T030_OTHER_QUEUE });
      const firstReplacementRender = captures.find(
        (capture) => capture.identity === T030_OTHER_QUEUE
      );
      expect(firstReplacementRender).toMatchObject({
        session: null,
        isBusy: false,
        error: null,
        undoToken: null,
      });
      await publish(pendingSecond, makeSmsReviewSession(T030_OTHER_QUEUE));
      await publish(pendingFirst, makeSmsReviewSession(T030_QUEUE));
      expect(result.current.session?.sessionId).toBe(T030_OTHER_QUEUE);
    });

    it("does not render a prior SMS bootstrap error during a Voice source switch", async () => {
      const failure = new Error("stale SMS bootstrap error");
      const voice = await makeVoiceReviewSession();
      mockLoadOrBootstrap.mockRejectedValue(failure);
      const captures: FacadeRenderCapture[] = [];
      interface Props {
        readonly input: UseAccountReviewInput;
      }
      const { result, rerender } = renderHook(
        (props: Props) => {
          const view = useAccountReview(props.input);
          captures.push(captureFacadeRender(props.input.mode, view));
          return view;
        },
        { initialProps: { input: makeSmsReviewInput() } }
      );
      await waitFor(() => expect(result.current.error).toBe(failure));

      rerender({ input: makeVoiceReviewInput(voice) });
      const firstVoiceRender = captures.find(
        (capture) => capture.identity === "VOICE"
      );
      expect(firstVoiceRender).toBeDefined();
      expect(firstVoiceRender?.error).toBeNull();
      expect(firstVoiceRender?.isBusy).toBe(false);
      expect(firstVoiceRender?.undoToken).toBeNull();
      if (firstVoiceRender?.session) {
        expect(firstVoiceRender.session).toEqual(voice);
      }
      await waitFor(() => expect(result.current.session).toEqual(voice));
    });

    it("still refuses a foreign account snapshot instead of publishing its matching-session owner", async () => {
      mockLoadOrBootstrap.mockResolvedValue(
        makeSmsReviewSession(T030_QUEUE, T030_FOREIGN_OWNER)
      );
      // Deliberately retain A's snapshot; a coherent B bootstrap cannot bless it.
      mockLoadAccountSnapshots.mockResolvedValue(makeOwnedContext());
      const { result } = renderHook(() =>
        useAccountReview(makeSmsReviewInput(T030_FOREIGN_OWNER))
      );
      await waitFor(() =>
        expect(result.current.error?.message).toBe(
          "account_review_facade_account_scope_changed"
        )
      );
      expect(result.current.session).toBeNull();
      expect(result.current.readModel).toBeNull();
      expect(result.current.undoToken).toBeNull();
      expect(mockExecuteSmsCommand).not.toHaveBeenCalled();
    });
  });

  describe("P2 active SMS dispatch outward cancellation", () => {
    it.each(["owner", "session", "reload", "unmount"])(
      "rejects the outward Promise once on %s before delayed backend success",
      async (boundary: string) => {
        const original = makeSmsReviewSession();
        const command = makeGroupCommand(original, "confirm_group");
        const eventualCommitted = makeAcceptedCommandResult(original, command);
        const backend = createDeferred<AccountReviewCommandResult>();
        mockLoadOrBootstrap.mockImplementation(({ expectedOwnerId, queueId }) =>
          Promise.resolve(makeSmsReviewSession(queueId, expectedOwnerId))
        );
        mockExecuteSmsCommand.mockReturnValue(backend.promise);
        interface Props {
          readonly input: UseAccountReviewInput;
        }
        const { result, rerender, unmount } = renderHook(
          (props: Props) => useAccountReview(props.input),
          { initialProps: { input: makeSmsReviewInput() } }
        );
        await waitFor(() => expect(result.current.session).toEqual(original));

        let request!: ReturnType<typeof result.current.dispatch>;
        act(() => {
          request = result.current.dispatch(command);
        });
        expect(mockExecuteSmsCommand).toHaveBeenCalledTimes(1);
        const settlements: Array<"resolved" | "rejected"> = [];
        let cancellationReason: unknown;
        const observed = request.then(
          (): void => {
            settlements.push("resolved");
          },
          (reason: unknown): void => {
            cancellationReason = reason;
            settlements.push("rejected");
          }
        );

        if (boundary === "owner") {
          mockLoadAccountSnapshots.mockResolvedValue(foreignAccountSnapshots());
          rerender({ input: makeSmsReviewInput(T030_FOREIGN_OWNER) });
        } else if (boundary === "session") {
          rerender({
            input: makeSmsReviewInput(T030_OWNER, T030_OTHER_QUEUE),
          });
        } else if (boundary === "reload") {
          act(() => result.current.reload());
        } else {
          unmount();
        }
        await act(async (): Promise<void> => {
          await Promise.resolve();
          await Promise.resolve();
        });
        // Must settle outward NOW, not only after the already-running writer
        // eventually resolves. The facade never undoes a durable DB commit.
        expect(settlements).toEqual(["rejected"]);
        expect(cancellationReason).toBeInstanceOf(Error);
        if (cancellationReason instanceof Error) {
          expect(cancellationReason.message).toMatch(/cancel|invalid/i);
        }

        await act(async (): Promise<void> => {
          backend.resolve(eventualCommitted);
          await backend.promise;
          await Promise.resolve();
        });
        await observed;
        expect(settlements).toEqual(["rejected"]);
        if (boundary !== "unmount") {
          const expected =
            boundary === "owner"
              ? makeSmsReviewSession(T030_QUEUE, T030_FOREIGN_OWNER)
              : boundary === "session"
                ? makeSmsReviewSession(T030_OTHER_QUEUE)
                : original;
          await waitFor(() => expect(result.current.session).toEqual(expected));
          expect(result.current.error).toBeNull();
        }
      }
    );
  });
});
