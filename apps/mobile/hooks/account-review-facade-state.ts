/**
 * #395 T030 private, per-mounted-hook lifecycle runtime.
 * Commands remain owned by SMS/Voice services; this controls publication only.
 */
import { randomUUID } from "expo-crypto";
import { getAccountReviewAccountCandidates } from "@monyvi/logic";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import { canonicalUuid } from "../../../packages/logic/src/account-review/schema-primitives";
import { mergeAccountReviewLateRows } from "../../../packages/logic/src/account-review/reducer-merge";
import {
  projectAccountReviewSession,
  type AccountReviewReadModel,
} from "../../../packages/logic/src/account-review/read-model";
import type {
  AccountReviewCommandResult,
  ReviewUndoLease,
} from "../../../packages/logic/src/account-review/reducer";
import {
  loadAccountReviewAccountSnapshots,
  type AccountReviewAccountSnapshots,
} from "../services/account-review-read-model-service";
import { loadOrBootstrapOwnedSmsReviewSession } from "../services/account-review-legacy-bootstrap-service";
import { executeSmsAccountReviewCommand } from "../services/account-review-command-service";
import { executeVoiceAccountReviewCommand } from "../services/account-review-voice-command-service";

interface CommonReviewInput {
  readonly ownerId: string | null;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
}

export interface SmsAccountReviewInput extends CommonReviewInput {
  readonly mode: "SMS";
  readonly queueId: string;
}

export interface VoiceAccountReviewInput extends CommonReviewInput {
  readonly mode: "VOICE";
  readonly voiceSession: AccountReviewSession | null;
}

export type UseAccountReviewInput =
  | SmsAccountReviewInput
  | VoiceAccountReviewInput;

/** Minimal current-owner account choices, never a second DB/provider authority. */
export type AccountReviewChoiceAccount = Pick<
  AccountReviewAccountSnapshots["accounts"][number],
  | "id"
  | "name"
  | "currency"
  | "type"
  | "institutionId"
  | "providerDisplayName"
  | "cardLast4"
  | "isDefault"
>;

function presentAccountChoice(
  a: AccountReviewAccountSnapshots["accounts"][number]
): AccountReviewChoiceAccount {
  return {
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
    institutionId: a.institutionId,
    providerDisplayName: a.providerDisplayName,
    cardLast4: a.cardLast4,
    isDefault: a.isDefault,
  };
}

export interface AccountReviewFacadeView {
  readonly choiceAccounts: readonly AccountReviewChoiceAccount[];
  readonly session: AccountReviewSession | null;
  readonly readModel: AccountReviewReadModel | null;
  readonly isBusy: boolean;
  readonly error: Error | null;
  readonly undoToken: string | null;
  /** Only the group of the current transient Undo lease may expose Undo. */
  readonly undoGroupId?:
    | AccountReviewSession["groups"][number]["groupId"]
    | null;
}

export const EMPTY_ACCOUNT_REVIEW_FACADE: AccountReviewFacadeView = {
  choiceAccounts: [],
  session: null,
  readModel: null,
  isBusy: false,
  error: null,
  undoToken: null,
  undoGroupId: null,
};

interface QueuedReviewCommand {
  readonly command: AccountReviewCommand;
  readonly generation: number;
  readonly resolve: (value: AccountReviewCommandResult) => void;
  readonly reject: (reason: Error) => void;
}

function toReviewError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function cancelledError(): Error {
  return new Error("account_review_facade_cancelled");
}

function verifySessionScope(
  session: AccountReviewSession,
  input: UseAccountReviewInput
): AccountReviewSession {
  const parsed = accountReviewSessionSchema.parse(session);
  if (
    parsed.ownerId !== input.ownerId ||
    parsed.source !== input.mode ||
    parsed.sessionId !== input.sessionId ||
    (input.mode === "SMS" && input.queueId !== input.sessionId)
  ) {
    throw new Error("account_review_facade_session_scope_changed");
  }
  return parsed;
}

/** New authority must be newer than the accepted local Voice generation. */
function hasNewerVoiceRevision(
  incoming: AccountReviewSession,
  current: AccountReviewSession
): boolean {
  const source = BigInt(incoming.sourceRevision);
  const revision = BigInt(incoming.revision);
  const generation = BigInt(incoming.operationGeneration);
  const currentSource = BigInt(current.sourceRevision);
  const currentRevision = BigInt(current.revision);
  const currentGeneration = BigInt(current.operationGeneration);
  return (
    source >= currentSource &&
    revision >= currentRevision &&
    generation >= currentGeneration &&
    (revision > currentRevision || generation > currentGeneration)
  );
}

export class AccountReviewFacadeController {
  constructor(
    private readonly onView: (view: AccountReviewFacadeView) => void
  ) {}

  private generation = 0;
  private input: UseAccountReviewInput | null = null;
  private session: AccountReviewSession | null = null;
  private snapshots: AccountReviewAccountSnapshots | null = null;
  private readModel: AccountReviewReadModel | null = null;
  private error: Error | null = null;
  private undo: ReviewUndoLease | null = null;
  private loading = false;
  private running = false;
  private mounted = false;
  private readonly queue: QueuedReviewCommand[] = [];
  private active: QueuedReviewCommand | null = null;
  private controller: AbortController | null = null;
  private removeAbortListener: (() => void) | null = null;

  mount(): void {
    this.mounted = true;
  }

  dispose(): void {
    this.mounted = false;
    this.cancel();
  }

  /** Do not return previous owner's/session's state during the new render. */
  scopedView(
    expected: UseAccountReviewInput,
    view: AccountReviewFacadeView
  ): AccountReviewFacadeView {
    if (
      !this.mounted ||
      this.input !== expected ||
      expected.ownerId === null ||
      expected.signal?.aborted
    )
      return EMPTY_ACCOUNT_REVIEW_FACADE;
    return view;
  }

  /** Validate nested scope first; retain user choices across stale Voice input. */
  stableVoiceInput(incoming: UseAccountReviewInput): UseAccountReviewInput {
    if (incoming.mode !== "VOICE") return incoming;
    const incomingSession = incoming.voiceSession;
    if (
      incomingSession &&
      incoming.ownerId !== null &&
      !incoming.signal?.aborted
    )
      verifySessionScope(incomingSession, incoming);
    const current = this.input;
    const accepted = this.session;
    if (
      !current ||
      current.mode !== "VOICE" ||
      current.ownerId !== incoming.ownerId ||
      current.sessionId !== incoming.sessionId ||
      current.signal !== incoming.signal ||
      incomingSession === null ||
      accepted === null ||
      accepted.source !== "VOICE"
    )
      return incoming;
    if (hasNewerVoiceRevision(incomingSession, accepted)) return incoming;
    if (
      BigInt(incomingSession.sourceRevision) >
        BigInt(accepted.sourceRevision) &&
      incomingSession.rows.some(
        (row) => !accepted.rows.some((prior) => prior.rowId === row.rowId)
      )
    ) {
      const merged = mergeAccountReviewLateRows({
        current: accepted,
        incoming: incomingSession,
      });
      if (merged.rows.length > accepted.rows.length)
        return { ...incoming, voiceSession: merged };
    }
    return current;
  }

  currentGeneration(): number {
    return this.generation;
  }

  private refreshReadModel(): void {
    const session = this.session;
    const snapshots = this.snapshots;
    const expectedOwner = this.input?.ownerId;
    if (
      !session ||
      !snapshots ||
      !expectedOwner ||
      session.ownerId !== expectedOwner ||
      snapshots.ownerId !== expectedOwner
    ) {
      this.readModel = null;
      return;
    }
    try {
      // The owned account read service is the sole source of context.
      // Eligibility/counts/filtered ready preview belong to pure logic.
      this.readModel = projectAccountReviewSession({
        session,
        accountSnapshots: snapshots,
      });
    } catch {
      this.readModel = null;
      this.error = new Error("account_review_facade_projection_unavailable");
    }
  }

  /** Tie the one-use lease to its real removed group, never every tombstone. */
  private currentUndoGroupId():
    | AccountReviewSession["groups"][number]["groupId"]
    | null {
    const current = this.session;
    const lease = this.undo;
    if (
      !current ||
      !lease ||
      current.operationGeneration !== lease.afterRemovalGeneration ||
      current.ownerId !== lease.previousState.ownerId ||
      current.sessionId !== lease.previousState.sessionId ||
      current.source !== lease.previousState.source
    )
      return null;
    const previous = lease.previousState;
    const removed = previous.groups.filter(
      (group) =>
        group.status !== "removed" &&
        !previous.removedEvidenceKeys.includes(group.evidenceKey) &&
        current.removedEvidenceKeys.includes(group.evidenceKey) &&
        current.groups.some(
          (now) =>
            now.groupId === group.groupId &&
            now.status === "removed" &&
            now.evidenceKey === group.evidenceKey
        )
    );
    return removed.length === 1 ? (removed[0]?.groupId ?? null) : null;
  }

  private publish(): void {
    if (!this.mounted) return;
    const scopedAccounts =
      !this.error &&
      !this.loading &&
      this.session &&
      this.input?.ownerId &&
      this.session.ownerId === this.input.ownerId &&
      this.snapshots?.ownerId === this.input.ownerId
        ? this.snapshots.accounts
        : [];
    this.onView({
      session: this.session,
      choiceAccounts: scopedAccounts.map(presentAccountChoice),
      readModel: this.error || this.loading ? null : this.readModel,
      isBusy: this.loading || this.running || this.queue.length > 0,
      error: this.error,
      undoToken: this.undo?.token ?? null,
      undoGroupId: this.currentUndoGroupId(),
    });
  }

  private isCurrent(generation: number): boolean {
    return (
      this.mounted &&
      this.generation === generation &&
      this.input !== null &&
      this.input.ownerId !== null &&
      !this.input.signal?.aborted
    );
  }

  /** Approved pure manual eligibility, over the SAME live scoped snapshot. */
  getChoiceCandidates(
    rowId: AccountReviewRow["rowId"],
    role: "source" | "destination",
    expectedInput: UseAccountReviewInput,
    expectedGeneration: number
  ): readonly AccountReviewChoiceAccount[] {
    const session = this.session;
    const snapshots = this.snapshots;
    if (
      !session ||
      !snapshots ||
      this.error ||
      this.loading ||
      this.input !== expectedInput ||
      expectedGeneration !== this.generation ||
      !this.isCurrent(expectedGeneration) ||
      session.ownerId !== snapshots.ownerId
    )
      return [];
    return getAccountReviewAccountCandidates({
      session,
      rowId,
      role,
      accountSnapshots: snapshots,
    }).map(presentAccountChoice);
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.removeAbortListener?.();
    this.removeAbortListener = null;
    this.active?.reject(cancelledError());
    this.active = null;
    this.queue.splice(0).forEach((task) => task.reject(cancelledError()));
    this.input = null;
    this.session = null;
    this.snapshots = null;
    this.readModel = null;
    this.error = null;
    this.undo = null;
    this.loading = false;
    this.running = false;
    this.publish();
  }

  private attachAbort(signal: AbortSignal | undefined): void {
    if (!signal) return;
    const onAbort = (): void => this.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    this.removeAbortListener = () =>
      signal.removeEventListener("abort", onAbort);
  }

  configure(input: UseAccountReviewInput): void {
    this.cancel();
    if (input.ownerId === null || input.signal?.aborted) return;
    canonicalUuid.parse(input.ownerId);
    canonicalUuid.parse(input.sessionId);
    if (input.mode === "SMS") {
      canonicalUuid.parse(input.queueId);
      if (input.queueId !== input.sessionId)
        throw new Error("account_review_facade_queue_session_changed");
    }
    this.input = input;
    this.attachAbort(input.signal);
    if (input.mode === "VOICE") {
      this.session = input.voiceSession
        ? verifySessionScope(input.voiceSession, input)
        : null;
      if (this.session) {
        this.beginVoiceBootstrap(input);
      } else {
        this.publish();
      }
      return;
    }
    this.beginSmsBootstrap(input);
  }

  reload(
    expectedInput: UseAccountReviewInput | null = this.input,
    expectedGeneration = this.generation
  ): void {
    const input = this.input;
    if (
      !input ||
      input !== expectedInput ||
      expectedGeneration !== this.generation
    )
      return;
    if (input.mode === "SMS") {
      this.configure(input);
      return;
    }
    const session = this.session;
    this.configure(input);
    if (session && this.input === input) {
      this.session = verifySessionScope(session, input);
      this.publish();
    }
  }

  /** Voice never persists its review; it still needs an owned read model
   * before publishing readiness. Abort, actor and generation changes revoke
   * any late asynchronous account read. */
  private beginVoiceBootstrap(input: VoiceAccountReviewInput): void {
    const generation = this.generation;
    this.loading = true;
    this.publish();
    void this.loadVoice(input, generation);
  }

  private async loadVoice(
    input: VoiceAccountReviewInput,
    generation: number
  ): Promise<void> {
    try {
      const snapshots = await loadAccountReviewAccountSnapshots();
      if (!this.isCurrent(generation) || this.input !== input) return;
      if (snapshots.ownerId !== input.ownerId)
        throw new Error("account_review_facade_account_scope_changed");
      this.snapshots = snapshots;
      this.error = null;
      this.loading = false;
      this.refreshReadModel();
      this.publish();
      this.pump();
    } catch (reason) {
      this.failBootstrap(generation, reason);
    }
  }

  private beginSmsBootstrap(input: SmsAccountReviewInput): void {
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    this.publish();
    void this.loadSms(input, generation, controller.signal);
  }

  private async loadSms(
    input: SmsAccountReviewInput,
    generation: number,
    signal: AbortSignal
  ): Promise<void> {
    try {
      if (input.ownerId === null)
        throw new Error("account_review_facade_owner_missing");
      const [session, snapshots] = await Promise.all([
        loadOrBootstrapOwnedSmsReviewSession({
          expectedOwnerId: input.ownerId,
          queueId: input.queueId,
          signal,
        }),
        loadAccountReviewAccountSnapshots(),
      ]);
      if (!this.isCurrent(generation) || this.input !== input) return;
      if (snapshots.ownerId !== input.ownerId)
        throw new Error("account_review_facade_account_scope_changed");
      this.session = verifySessionScope(session, input);
      this.snapshots = snapshots;
      this.loading = false;
      this.error = null;
      this.refreshReadModel();
      this.publish();
      this.pump();
    } catch (reason) {
      this.failBootstrap(generation, reason);
    }
  }

  private failBootstrap(generation: number, reason: unknown): void {
    if (!this.isCurrent(generation)) return;
    this.loading = false;
    this.session = null;
    this.snapshots = null;
    this.readModel = null;
    this.error = toReviewError(reason);
    this.queue
      .splice(0)
      .forEach((task) => task.reject(this.error ?? cancelledError()));
    this.publish();
  }

  dispatch(
    command: AccountReviewCommand,
    expectedInput: UseAccountReviewInput | null = this.input,
    expectedGeneration = this.generation
  ): Promise<AccountReviewCommandResult> {
    const input = this.input;
    if (
      !input ||
      input !== expectedInput ||
      expectedGeneration !== this.generation ||
      input.ownerId === null ||
      input.signal?.aborted ||
      command.ownerId !== input.ownerId ||
      command.sessionId !== input.sessionId
    )
      return Promise.reject(
        new Error("account_review_facade_command_scope_changed")
      );
    return new Promise<AccountReviewCommandResult>((resolve, reject) => {
      let settled = false;
      const task: QueuedReviewCommand = {
        command,
        generation: this.generation,
        resolve: (value): void => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        reject: (reason): void => {
          if (settled) return;
          settled = true;
          reject(reason);
        },
      };
      this.queue.push(task);
      this.publish();
      this.pump();
    });
  }

  private pump(): void {
    if (this.loading || this.running || this.queue.length === 0) return;
    const task = this.queue.shift();
    if (!task) return;
    this.active = task;
    this.running = true;
    this.publish();
    void this.runCommand(task);
  }

  private async executeCommand(
    task: QueuedReviewCommand,
    prior: AccountReviewSession,
    nextUndoToken: string | null
  ): Promise<{
    readonly result: AccountReviewCommandResult;
    readonly snapshots: AccountReviewAccountSnapshots;
  }> {
    const input = this.input;
    if (!input || !this.isCurrent(task.generation)) throw cancelledError();
    if (input.mode === "SMS") {
      const snapshots = this.snapshots;
      if (!snapshots || snapshots.ownerId !== input.ownerId)
        throw new Error("account_review_facade_account_scope_changed");
      // The SMS bootstrap controller also guards admitted SQLite writers.
      // Facade promise rejection alone cannot cancel a queued database.write.
      const signal = this.controller?.signal;
      if (!signal || signal.aborted) throw cancelledError();
      const result = await executeSmsAccountReviewCommand({
        queueId: input.queueId,
        command: task.command,
        accountSnapshots: snapshots,
        nextUndoToken,
        signal,
      });
      if (!this.isCurrent(task.generation)) throw cancelledError();
      // The service uses fresh owned DB authority internally. Refresh the
      // outward projection once after an accepted mutation, never trust a
      // screen's old account list for newly accepted account choices.
      const current =
        result.reasonCodes.length === 0 && result.effect !== "none"
          ? await loadAccountReviewAccountSnapshots()
          : snapshots;
      if (!this.isCurrent(task.generation) || current.ownerId !== input.ownerId)
        throw cancelledError();
      return { result, snapshots: current };
    }
    const snapshots = await loadAccountReviewAccountSnapshots();
    if (!this.isCurrent(task.generation) || snapshots.ownerId !== input.ownerId)
      throw cancelledError();
    const result = await executeVoiceAccountReviewCommand({
      session: prior,
      command: task.command,
      accountSnapshots: snapshots,
      nextUndoToken,
      undo: this.undo,
      signal: input.signal,
    });
    if (!this.isCurrent(task.generation)) throw cancelledError();
    return { result, snapshots };
  }

  private acceptCommand(
    task: QueuedReviewCommand,
    prior: AccountReviewSession,
    result: AccountReviewCommandResult,
    snapshots: AccountReviewAccountSnapshots
  ): void {
    const input = this.input;
    if (!input) throw cancelledError();
    const accepted = verifySessionScope(result.state, input);
    if (snapshots.ownerId !== input.ownerId)
      throw new Error("account_review_facade_account_scope_changed");
    if (
      result.reasonCodes.length === 0 &&
      result.effect !== "none" &&
      task.command.kind !== "set_filter"
    ) {
      this.undo =
        task.command.kind === "remove_group" && result.undoToken
          ? {
              token: result.undoToken,
              previousState: prior,
              afterRemovalGeneration: accepted.operationGeneration,
            }
          : null;
    }
    this.session = accepted;
    this.snapshots = snapshots;
    this.error = null;
    this.refreshReadModel();
    this.publish();
  }

  private async runCommand(task: QueuedReviewCommand): Promise<void> {
    try {
      if (!this.isCurrent(task.generation) || !this.session)
        throw cancelledError();
      const prior = this.session;
      const token = task.command.kind === "remove_group" ? randomUUID() : null;
      const { result, snapshots } = await this.executeCommand(
        task,
        prior,
        token
      );
      if (!this.isCurrent(task.generation) || this.active !== task) return;
      this.acceptCommand(task, prior, result, snapshots);
      task.resolve(result);
    } catch (reason) {
      const error = toReviewError(reason);
      if (this.isCurrent(task.generation)) {
        this.error = error;
        this.publish();
      }
      task.reject(error);
    } finally {
      if (this.active === task) {
        this.active = null;
        this.running = false;
        if (this.isCurrent(task.generation)) {
          this.pump();
          this.publish();
        }
      }
    }
  }

  undoRemoval(
    expectedInput: UseAccountReviewInput | null = this.input,
    expectedGeneration = this.generation,
    expectedUndoToken: string | null = this.undo?.token ?? null
  ): Promise<AccountReviewCommandResult> {
    const session = this.session;
    const undo = this.undo;
    if (
      !session ||
      !undo ||
      expectedUndoToken === null ||
      undo.token !== expectedUndoToken
    ) {
      return Promise.reject(
        new Error("account_review_facade_undo_unavailable")
      );
    }
    const command = accountReviewCommandSchema.parse({
      kind: "undo_removal",
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      undoToken: expectedUndoToken,
    });
    return this.dispatch(command, expectedInput, expectedGeneration);
  }
}
