/**
 * #395 T054 — TESTS FIRST: outward facade readModel authority/cancellation.
 * The actual useAccountReview controller and actual pure
 * projectAccountReviewSession/reducer remain under test. Only the existing
 * authenticated bootstrap, account-read and SMS command service boundaries
 * are mocked. No presentation calculation, second count authority or
 * production test getter is introduced. NOT RUN.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type {
  AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import {
  accountReviewCommandSchema,
} from "../../../../packages/logic/src/account-review/review-schemas";
import {
  projectAccountReviewSession,
} from "../../../../packages/logic/src/account-review/read-model";
import {
  reduceAccountReviewCommand,
} from "../../../../packages/logic/src/account-review/reducer";
import { makeOwnedContext } from
  "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  createDeferred,
  makeCurrencyCommand,
  makeSmsReviewInput,
  makeSmsReviewSession,
  makeVoiceReviewInput,
  makeVoiceReviewSession,
  T030_OWNER,
  T030_FOREIGN_OWNER,
  T030_QUEUE,
} from "./useAccountReview-test-helpers";
import {
  useAccountReview,
  type UseAccountReviewInput,
} from "@/hooks/useAccountReview";

type BootstrapFn =
  typeof import("@/services/account-review-legacy-bootstrap-service")
    .loadOrBootstrapOwnedSmsReviewSession;
type AccountsFn =
  typeof import("@/services/account-review-read-model-service")
    .loadAccountReviewAccountSnapshots;
type SmsFn =
  typeof import("@/services/account-review-command-service")
    .executeSmsAccountReviewCommand;

const mockBootstrap = jest.fn<ReturnType<BootstrapFn>, Parameters<BootstrapFn>>();
const mockAccounts = jest.fn<ReturnType<AccountsFn>, Parameters<AccountsFn>>();
const mockSms = jest.fn<ReturnType<SmsFn>, Parameters<SmsFn>>();

jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest.requireActual<typeof import("node:crypto")>("node:crypto").randomUUID(),
}));
jest.mock("@/services/account-review-legacy-bootstrap-service", () => ({
  loadOrBootstrapOwnedSmsReviewSession: (
    ...args: Parameters<BootstrapFn>
  ): ReturnType<BootstrapFn> => mockBootstrap(...args),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (
    ...args: Parameters<AccountsFn>
  ): ReturnType<AccountsFn> => mockAccounts(...args),
}));
jest.mock("@/services/account-review-command-service", () => ({
  executeSmsAccountReviewCommand: (
    ...args: Parameters<SmsFn>
  ): ReturnType<SmsFn> => mockSms(...args),
}));

function setFilter(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
) {
  return accountReviewCommandSchema.parse({
    kind: "set_filter",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    filter,
  });
}
function actualProjection(session: AccountReviewSession) {
  return projectAccountReviewSession({
    session,
    accountSnapshots: makeOwnedContext(),
  });
}
function exposedProjection(
  view: ReturnType<typeof useAccountReview>
): unknown {
  return "readModel" in view ? view.readModel : undefined;
}
beforeEach(() => {
  mockBootstrap.mockReset();
  mockAccounts.mockReset();
  mockSms.mockReset();
  mockAccounts.mockResolvedValue(makeOwnedContext());
});

describe("#395 T054 useAccountReview canonical readModel view", () => {
  it("H01 publishes the exact existing pure projection after authenticated SMS bootstrap; never a duplicate count formula", async () => {
    const session = makeSmsReviewSession();
    mockBootstrap.mockResolvedValue(session);
    const { result } = renderHook(() => useAccountReview(makeSmsReviewInput()));
    await waitFor(() => expect(result.current.session).toEqual(session));
    const expected = actualProjection(session);
    await waitFor(() =>
      expect(exposedProjection(result.current)).toEqual(expected)
    );
    expect(exposedProjection(result.current)).toMatchObject({
      summary: expected.summary,
      groupSummaries: expected.groupSummaries,
      visibleRowIds: expected.visibleRowIds,
      readyVisibleRowIds: expected.readyVisibleRowIds,
    });
    expect(exposedProjection(result.current)).not.toHaveProperty("providerContext");
    expect(exposedProjection(result.current)).not.toHaveProperty("accounts");
    expect(mockAccounts).toHaveBeenCalled();
  });

  it("H02 waits for BOTH SMS session and current-owner account snapshot before publishing a non-null projection", async () => {
    const pending = createDeferred<Awaited<ReturnType<AccountsFn>>>();
    const session = makeSmsReviewSession();
    mockBootstrap.mockResolvedValue(session);
    mockAccounts.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAccountReview(makeSmsReviewInput()));
    await waitFor(() => expect(mockBootstrap).toHaveBeenCalledTimes(1));
    expect(exposedProjection(result.current)).toBeNull();
    await act(async () => {
      pending.resolve(makeOwnedContext());
      await pending.promise;
    });
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(session)));
    expect(result.current.error).toBeNull();
  });

  it("H03 Voice must load authenticated owned account snapshots before any READY projection; remains memory-only", async () => {
    const voice = await makeVoiceReviewSession();
    const pending = createDeferred<Awaited<ReturnType<AccountsFn>>>();
    mockAccounts.mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useAccountReview(makeVoiceReviewInput(voice))
    );
    expect(exposedProjection(result.current)).toBeNull();
    await waitFor(() => expect(mockAccounts).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending.resolve(makeOwnedContext());
      await pending.promise;
    });
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockSms).not.toHaveBeenCalled();
  });

  it("H04 Voice owner logout while account read is pending never publishes a stale projection or previous owner session", async () => {
    const voice = await makeVoiceReviewSession();
    const pending = createDeferred<Awaited<ReturnType<AccountsFn>>>();
    mockAccounts.mockReturnValue(pending.promise);
    interface Props { readonly input: UseAccountReviewInput }
    const captures: Array<{
      readonly ownerId: string | null;
      readonly projection: unknown;
      readonly sessionOwner: string | null;
    }> = [];
    const { result, rerender } = renderHook((props: Props) => {
      const view = useAccountReview(props.input);
      captures.push({
        ownerId: props.input.ownerId,
        projection: exposedProjection(view),
        sessionOwner: view.session?.ownerId ?? null,
      });
      return view;
    }, { initialProps: { input: makeVoiceReviewInput(voice) } });
    await waitFor(() => expect(mockAccounts).toHaveBeenCalledTimes(1));
    rerender({ input: makeVoiceReviewInput(null, null) });
    await act(async () => {
      pending.resolve(makeOwnedContext());
      await pending.promise;
    });
    expect(result.current.session).toBeNull();
    expect(exposedProjection(result.current)).toBeNull();
    expect(captures.filter((row) => row.ownerId === null).every((row) =>
      row.sessionOwner === null && row.projection === null
    )).toBe(true);
  });

  it("H05 a foreign account-read result cannot publish an owned SMS or Voice projection", async () => {
    const session = makeSmsReviewSession();
    mockBootstrap.mockResolvedValue(session);
    mockAccounts.mockResolvedValue({
      ...makeOwnedContext(), ownerId: T030_FOREIGN_OWNER,
    });
    const { result } = renderHook(() => useAccountReview(makeSmsReviewInput()));
    await waitFor(() => expect(mockAccounts).toHaveBeenCalledTimes(1));
    expect(exposedProjection(result.current)).toBeNull();
    // The facade must not silently treat a foreign context as the current
    // owner, even if the provider account list is structurally well formed.
    expect(result.current.isBusy).toBe(false);
  });

  it("H06 changed Voice filter uses the canonical reducer and publishes fresh shaped projection, not a copied session", async () => {
    const voice = await makeVoiceReviewSession();
    const input = makeVoiceReviewInput(voice);
    const { result } = renderHook(() => useAccountReview(input));
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
    const filter = setFilter(voice, "needs_review");
    await act(async () => { await result.current.dispatch(filter); });
    const state = result.current.session;
    if (!state) throw new Error("missing_accepted_voice_filter");
    expect(state.filter).toBe("needs_review");
    expect(state.operationGeneration).toBe(voice.operationGeneration);
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(state)));
    expect(mockAccounts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockSms).not.toHaveBeenCalled();
  });

  it("H07 SMS filter response projects only the returned canonical state with a refreshed owner snapshot", async () => {
    const original = makeSmsReviewSession();
    mockBootstrap.mockResolvedValue(original);
    mockSms.mockImplementation(async ({ command }) =>
      reduceAccountReviewCommand({
        state: original,
        command,
        accountSnapshots: makeOwnedContext(),
        nextUndoToken: null,
        undo: null,
      })
    );
    const { result } = renderHook(() => useAccountReview(makeSmsReviewInput()));
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(original)));
    const next = setFilter(original, "selected");
    await act(async () => { await result.current.dispatch(next); });
    const updated = result.current.session;
    if (!updated) throw new Error("missing_real_reducer_filter_state");
    expect(updated.filter).toBe("selected");
    expect(exposedProjection(result.current)).toEqual(actualProjection(updated));
    expect(mockSms).toHaveBeenCalledWith(expect.objectContaining({
      queueId: T030_QUEUE, command: next,
    }));
    expect(mockAccounts.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("H08 failed/reloaded SMS bootstrap clears projection, then publishes new owned projection only after fresh account-read", async () => {
    const session = makeSmsReviewSession();
    const failed = new Error("temporary_owned_read_unavailable");
    mockBootstrap
      .mockRejectedValueOnce(failed)
      .mockResolvedValueOnce(session);
    const { result } = renderHook(() => useAccountReview(makeSmsReviewInput()));
    await waitFor(() => expect(result.current.error).toBe(failed));
    expect(exposedProjection(result.current)).toBeNull();
    act(() => result.current.reload());
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(session)));
    expect(mockBootstrap).toHaveBeenCalledTimes(2);
    expect(mockAccounts.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("H09 fresh Voice reload rechecks owner snapshots and clears the previous projection while pending", async () => {
    const voice = await makeVoiceReviewSession();
    const second = createDeferred<Awaited<ReturnType<AccountsFn>>>();
    mockAccounts
      .mockResolvedValueOnce(makeOwnedContext())
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useAccountReview(makeVoiceReviewInput(voice))
    );
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
    act(() => result.current.reload());
    expect(exposedProjection(result.current)).toBeNull();
    await waitFor(() => expect(mockAccounts.mock.calls.length)
      .toBeGreaterThanOrEqual(2));
    await act(async () => {
      second.resolve(makeOwnedContext());
      await second.promise;
    });
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
  });

  it("H10 a canonical non-filter business edit recomputes the same pure projection after async owned reads", async () => {
    const voice = await makeVoiceReviewSession();
    const { result } = renderHook(() =>
      useAccountReview(makeVoiceReviewInput(voice))
    );
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
    const command = makeCurrencyCommand(voice);
    const expected = reduceAccountReviewCommand({
      state: voice, command,
      accountSnapshots: makeOwnedContext(),
      nextUndoToken: null, undo: null,
    });
    expect(expected.reasonCodes).toEqual([]);
    await act(async () => { await result.current.dispatch(command); });
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(expected.state)));
    expect(result.current.session).toEqual(expected.state);
  });

  it("H11 a Voice Remove Undo lease survives filter-only navigation and Undo retains the CURRENT filter", async () => {
    const voice = await makeVoiceReviewSession();
    const group = voice.groups[0];
    if (!group) throw new Error("missing_genuine_voice_group");
    const { result } = renderHook(() =>
      useAccountReview(makeVoiceReviewInput(voice))
    );
    await waitFor(() => expect(exposedProjection(result.current))
      .toEqual(actualProjection(voice)));
    const remove = accountReviewCommandSchema.parse({
      kind: "remove_group", ownerId: voice.ownerId,
      sessionId: voice.sessionId, expectedReviewRevision: voice.revision,
      expectedOperationGeneration: voice.operationGeneration,
      groupId: group.groupId, expectedGroupRevision: group.revision,
    });
    await act(async () => { await result.current.dispatch(remove); });
    const removed = result.current.session;
    const token = result.current.undoToken;
    if (!removed || !token) throw new Error("missing_real_remove_undo_lease");
    expect(removed.groups[0]?.status).toBe("removed");
    await act(async () => {
      await result.current.dispatch(setFilter(removed, "selected"));
    });
    expect(result.current.undoToken).toBe(token);
    expect(result.current.session?.filter).toBe("selected");
    await act(async () => { await result.current.undoRemoval(); });
    expect(result.current.session?.groups[0]?.status).toBe(group.status);
    expect(result.current.session?.filter).toBe("selected");
    expect(result.current.undoToken).toBeNull();
    const final = result.current.session;
    if (!final) throw new Error("missing_undone_voice_session");
    expect(exposedProjection(result.current)).toEqual(actualProjection(final));
  });
});
