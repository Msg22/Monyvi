/**
 * T030 creation-Red facade fixtures. Every row/session/command is canonical.
 * Voice is normalized from genuine Voice provider + mapped financial evidence.
 * No hook business logic, Watermelon writer or fabricated financial receipts.
 */
import { act } from "@testing-library/react-native";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import { normalizeAccountReviewParserResult } from "../../../../packages/logic/src/account-review/normalization";
import { canonicalUuid } from "../../../../packages/logic/src/account-review/schema-primitives";
import {
  reduceAccountReviewCommand,
  autoSelectReadyReviewSession,
  type AccountReviewCommandResult,
  type ReviewUndoLease,
} from "../../../../packages/logic/src/account-review/reducer";
import {
  makeOwnedContext,
  makeVoiceInput,
  NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import type { UseAccountReviewInput } from "@/hooks/useAccountReview";

type SmsFacadeInput = Extract<UseAccountReviewInput, { mode: "SMS" }>;
type VoiceFacadeInput = Extract<UseAccountReviewInput, { mode: "VOICE" }>;
type EditorCategoriesService =
  typeof import("@/services/account-review-transaction-edit-category-service").loadCurrentAccountReviewEditorCategories;
type CurrentOwnerGuard =
  typeof import("@/services/user-data-access").assertExpectedCurrentUser;

// These three facade suites exercise non-editor lifecycle/commands. Keep the
// actual Voice bridge, reducer and projection, but isolate its newly imported
// editor read/auth boundary rather than initializing the app's native DB.
// Unexpected editor work fails; no category or owner authority is fabricated.
// Dedicated Voice edit and real SMS SQLite suites retain their own fixtures.
jest.mock(
  "@/services/account-review-transaction-edit-category-service",
  () => ({
    loadCurrentAccountReviewEditorCategories: jest.fn<
      ReturnType<EditorCategoriesService>,
      Parameters<EditorCategoriesService>
    >(() =>
      Promise.reject(new Error("unexpected_facade_editor_category_read"))
    ),
  })
);
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn<
    ReturnType<CurrentOwnerGuard>,
    Parameters<CurrentOwnerGuard>
  >(() => Promise.reject(new Error("unexpected_facade_editor_owner_read"))),
}));

afterEach(() => {
  const categories = jest.requireMock<{
    readonly loadCurrentAccountReviewEditorCategories: jest.MockedFunction<EditorCategoriesService>;
  }>("@/services/account-review-transaction-edit-category-service");
  const auth = jest.requireMock<{
    readonly assertExpectedCurrentUser: jest.MockedFunction<CurrentOwnerGuard>;
  }>("@/services/user-data-access");
  expect(
    categories.loadCurrentAccountReviewEditorCategories
  ).not.toHaveBeenCalled();
  expect(auth.assertExpectedCurrentUser).not.toHaveBeenCalled();
  categories.loadCurrentAccountReviewEditorCategories.mockClear();
  auth.assertExpectedCurrentUser.mockClear();
});

export const T030_OWNER = T025_IDS.owner;
export const T030_FOREIGN_OWNER = T025_IDS.foreignOwner;
export const T030_QUEUE = T025_IDS.queue;
export const T030_OTHER_QUEUE = T025_IDS.alternateQueue;
export const T030_VOICE_SESSION = NORMALIZATION_IDS.session;
export const T030_UNDO_TOKEN = T025_IDS.undoToken;

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Same owned canonical readiness rule used at authenticated SMS bootstrap. */
export function makeReadyBootstrapReviewSession(
  session: AccountReviewSession
): AccountReviewSession {
  return autoSelectReadyReviewSession(
    session,
    makeOwnedContext(),
    new Set<string>()
  ).state;
}

/** Resolve genuine in-flight service promises within React's update boundary. */
export async function publish<T>(
  pending: Deferred<T>,
  value: T
): Promise<void> {
  await act(async (): Promise<void> => {
    pending.resolve(value);
    await pending.promise;
  });
}

export async function publishRejection(
  pending: Deferred<AccountReviewSession>,
  failure: Error
): Promise<void> {
  await act(async (): Promise<void> => {
    pending.reject(failure);
    await pending.promise.catch(() => undefined);
  });
}

export function makeSmsReviewInput(
  ownerId: string | null = T030_OWNER,
  queueId: string = T030_QUEUE,
  signal?: AbortSignal
): SmsFacadeInput {
  if (ownerId !== null) canonicalUuid.parse(ownerId);
  canonicalUuid.parse(queueId);
  return {
    mode: "SMS",
    ownerId,
    sessionId: queueId,
    queueId,
    ...(signal ? { signal } : {}),
  };
}

export function makeVoiceReviewInput(
  voiceSession: AccountReviewSession | null,
  ownerId: string | null = T030_OWNER,
  signal?: AbortSignal
): VoiceFacadeInput {
  if (ownerId !== null) canonicalUuid.parse(ownerId);
  if (
    voiceSession !== null &&
    (voiceSession.source !== "VOICE" || voiceSession.ownerId !== ownerId)
  ) {
    throw new Error("Cross-source or foreign Voice fixture");
  }
  const sessionId = voiceSession?.sessionId ?? T030_VOICE_SESSION;
  canonicalUuid.parse(sessionId);
  return {
    mode: "VOICE",
    ownerId,
    sessionId,
    voiceSession,
    ...(signal ? { signal } : {}),
  };
}

export function makeSmsReviewSession(
  queueId: string = T030_QUEUE,
  ownerId: string = T030_OWNER
): AccountReviewSession {
  const source = makeT025ReviewSession(
    queueId,
    [makeT025SmsOriginal(0)],
    [T025_IDS.rowOne]
  );
  const session = accountReviewSessionSchema.parse({
    ...source,
    ownerId,
  });
  if (session.source !== "SMS" || session.sessionId !== queueId) {
    throw new Error("Invalid T030 SMS queue/session fixture");
  }
  return session;
}

export async function makeVoiceReviewSession(
  sessionId: string = T030_VOICE_SESSION
): Promise<AccountReviewSession> {
  const normalized = await normalizeAccountReviewParserResult({
    ...makeVoiceInput(),
    sessionId,
  });
  const session = accountReviewSessionSchema.parse(normalized);
  if (
    session.source !== "VOICE" ||
    session.sessionId !== sessionId ||
    session.rows.length === 0 ||
    session.rows.some(
      (row) =>
        row.source !== "VOICE" ||
        row.transaction.source !== "VOICE" ||
        row.sourceFingerprint !== null
    )
  ) {
    throw new Error("Invalid T030 Voice normalization fixture");
  }
  return session;
}

export function makeGroupCommand(
  session: AccountReviewSession,
  kind: "confirm_group" | "remove_group"
): AccountReviewCommand {
  const group = session.groups[0];
  if (!group) throw new Error("Missing canonical review group");
  return accountReviewCommandSchema.parse({
    kind,
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}

export function makeSelectCommand(
  session: AccountReviewSession
): AccountReviewCommand {
  const row = session.rows[0];
  if (!row || row.assignment.state !== "suggested") {
    throw new Error("Missing canonical suggested review row");
  }
  return accountReviewCommandSchema.parse({
    kind: "select_row",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    rowId: row.rowId,
    expectedRowRevision: row.revision,
    groupId: row.assignment.groupId,
    expectedGroupRevision: row.assignment.groupRevision,
    hasSharedConfirmationDisclosure: true,
  });
}

export function makeCurrencyCommand(
  session: AccountReviewSession
): AccountReviewCommand {
  const row = session.rows[0];
  if (!row) throw new Error("Missing canonical financial review row");
  return accountReviewCommandSchema.parse({
    kind: "confirm_row_currency",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    rowId: row.rowId,
    expectedRowRevision: row.revision,
    currency: row.transaction.currency,
  });
}

export function makeUndoCommand(
  session: AccountReviewSession,
  token: string = T030_UNDO_TOKEN
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    kind: "undo_removal",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    undoToken: token,
  });
}

/** Actual pure reduction, not hand-authored fake accepted session data. */
export function makeAcceptedCommandResult(
  session: AccountReviewSession,
  command: AccountReviewCommand,
  nextUndoToken: string | null = null,
  undo: ReviewUndoLease | null = null
): AccountReviewCommandResult {
  const result = reduceAccountReviewCommand({
    state: session,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken,
    undo,
  });
  if (result.reasonCodes.length !== 0 || result.state === session) {
    throw new Error(
      "Expected canonical accepted T030 command: " +
        result.reasonCodes.join(",")
    );
  }
  return result;
}

/** Reparse a structurally independent but semantically identical canonical input. */
export function cloneCanonicalReviewSession(
  session: AccountReviewSession
): AccountReviewSession {
  return accountReviewSessionSchema.parse({
    ...session,
    rows: session.rows.map((row) => ({
      ...row,
      transaction: { ...row.transaction },
    })),
    groups: session.groups.map((group) => ({
      ...group,
      linkedRowIds: [...group.linkedRowIds],
    })),
  });
}
