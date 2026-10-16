/**
 * #395 T030 private, per-mounted-hook lifecycle runtime.
 * Commands remain owned by SMS/Voice services; this controls publication only.
 */
import { randomUUID } from "expo-crypto";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import { canonicalUuid } from
  "../../../packages/logic/src/account-review/schema-primitives";
import { mergeAccountReviewLateRows } from
  "../../../packages/logic/src/account-review/reducer-merge";
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
import { loadOrBootstrapOwnedSmsReviewSession } from
  "../services/account-review-legacy-bootstrap-service";
import { executeSmsAccountReviewCommand } from
  "../services/account-review-command-service";
import { executeVoiceAccountReviewCommand } from
  "../services/account-review-voice-command-service";

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

export interface AccountReviewFacadeView {
  readonly session: AccountReviewSession | null;
  readonly readModel: AccountReviewReadModel | null;
  readonly isBusy: boolean;
  readonly error: Error | null;
  readonly undoToken: string | null;
}

export const EMPTY_ACCOUNT_REVIEW_FACADE: AccountReviewFacadeView = {
  session: null,
  readModel: null,
  isBusy: false,
  error: null,
  undoToken: null,
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
    if (incomingSession && incoming.ownerId !== null &&
        !incoming.signal?.aborted)
      verifySessionScope(incomingSession, incoming);
    const current = this.input;
    const accepted = this.session;
    if (
      !current || current.mode !== "VOICE" ||
      current.ownerId !== incoming.ownerId ||
      current.sessionId !== incoming.sessionId ||
      current.signal !== incoming.signal ||
      incomingSession === null || accepted === null ||
      accepted.source !== "VOICE"
    )
      return incoming;
    if (hasNewerVoiceRevision(incomingSession, accepted)) return incoming;
    if (BigInt(incomingSession.sourceRevision) >
        BigInt(accepted.sourceRevision) &&
        incomingSession.rows.some(
          (row) => !accepted.rows.some((prior) => prior.rowId === row.rowId)
        )) {
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
    if (!session || !snapshots || !expectedOwner ||
        session.ownerId !== expectedOwner ||
        snapshots.ownerId !== expectedOwner) {
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

  private publish(): void {
    if (!this.mounted) return;
    this.onView({
      session: this.session,
      readModel: this.error || this.loading ? null : this.readModel,
      isBusy: this.loading || this.running || this.queue.length > 0,
      error: this.error,
      undoToken: this.undo?.token ?? null,
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
    if (!input || input !== expectedInput ||
        expectedGeneration !== this.generation) return;
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
    this.queue.splice(0).forEach((task) => task.reject(this.error ?? cancelledError()));
    this.publish();
  }

  dispatch(
    command: AccountReviewCommand,
    expectedInput: UseAccountReviewInput | null = this.input,
    expectedGeneration = this.generation
  ): Promise<AccountReviewCommandResult> {
    const input = this.input;
    if (
      !input || input !== expectedInput ||
      expectedGeneration !== this.generation ||
      input.ownerId === null || input.signal?.aborted ||
      command.ownerId !== input.ownerId ||
      command.sessionId !== input.sessionId
    )
      return Promise.reject(new Error("account_review_facade_command_scope_changed"));
    return new Promise<AccountReviewCommandResult>((resolve, reject) => {
      let settled = false;
      const task: QueuedReviewCommand = {
        command, generation: this.generation,
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
      const result = await executeSmsAccountReviewCommand({
        queueId: input.queueId,
        command: task.command,
        accountSnapshots: snapshots,
        nextUndoToken,
      });
      if (!this.isCurrent(task.generation)) throw cancelledError();
      // The service uses fresh owned DB authority internally. Refresh the
      // outward projection once after an accepted mutation, never trust a
      // screen's old account list for newly accepted account choices.
      const current = result.reasonCodes.length === 0 &&
        result.effect !== "none"
        ? await loadAccountReviewAccountSnapshots()
        : snapshots;
      if (!this.isCurrent(task.generation) ||
          current.ownerId !== input.ownerId)
        throw cancelledError();
      return { result, snapshots: current };
    }
    const snapshots = await loadAccountReviewAccountSnapshots();
    if (!this.isCurrent(task.generation) ||
        snapshots.ownerId !== input.ownerId) throw cancelledError();
    const result = await executeVoiceAccountReviewCommand({
      session: prior,
      command: task.command,
      accountSnapshots: snapshots,
      nextUndoToken,
      undo: this.undo,
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
    if (result.reasonCodes.length === 0 && result.effect !== "none" &&
        task.command.kind !== "set_filter") {
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
        task, prior, token
      );
      if (!this.isCurrent(task.generation) || this.active !== task)
        return;
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
    expectedGeneration = this.generation
  ): Promise<AccountReviewCommandResult> {
    const session = this.session;
    const undo = this.undo;
    if (!session || !undo) {
      return Promise.reject(new Error("account_review_facade_undo_unavailable"));
    }
    const command = accountReviewCommandSchema.parse({
      kind: "undo_removal",
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      expectedReviewRevision: session.revision,
      expectedOperationGeneration: session.operationGeneration,
      undoToken: undo.token,
    });
    return this.dispatch(command, expectedInput, expectedGeneration);
  }
}
