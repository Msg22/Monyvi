import type {
  SmsProviderCompletionEnvelope,
  SmsProviderCompletionStatus,
} from "@monyvi/logic";

export type SimulatedProviderOutcome =
  | "trusted-success"
  | "low-confidence-success"
  | "explicit-negative"
  | "omission"
  | "retryable-failure"
  | "permanent-failure"
  | "malformed"
  | "incomplete"
  | "invalid-identity"
  | "delay"
  | "cancelled";

export interface SimulatedProviderStep {
  readonly outcome: SimulatedProviderOutcome;
  readonly delayMs?: number;
}

export interface SimulatedProviderRequest {
  readonly requestId: string;
  readonly messageIds: readonly string[];
  readonly startedAtMs: number;
  readonly signal?: AbortSignal;
}

export type SmsSafeguardProviderSimulationResult =
  | {
      readonly kind: "completion";
      readonly envelope: SmsProviderCompletionEnvelope;
      readonly delayMs: number;
      readonly isLowConfidence: boolean;
    }
  | {
      readonly kind: "retryable" | "permanent" | "malformed" | "incomplete";
      readonly delayMs: number;
    }
  | {
      readonly kind: "cancelled";
      readonly delayMs: number;
    };

export interface SmsSafeguardProviderSimulatorOptions {
  readonly sleep?: (delayMs: number) => Promise<void>;
}

const DEFAULT_SLEEP = (): Promise<void> => Promise.resolve();

function clampDelay(delayMs: number | undefined): number {
  if (delayMs === undefined || !Number.isFinite(delayMs)) return 0;
  return Math.max(0, Math.floor(delayMs));
}

function completionStatusForOutcome(
  outcome: SimulatedProviderOutcome
): SmsProviderCompletionStatus {
  return outcome === "incomplete" ? "truncated" : "complete";
}

export class SmsSafeguardProviderSimulator {
  public constructor(
    steps: readonly SimulatedProviderStep[],
    options: SmsSafeguardProviderSimulatorOptions = {}
  ) {
    this.steps = steps.length > 0 ? [...steps] : [{ outcome: "omission" }];
    this.sleep = options.sleep ?? DEFAULT_SLEEP;
  }

  private readonly steps: readonly SimulatedProviderStep[];
  private readonly sleep: (delayMs: number) => Promise<void>;
  private nextStepIndex = 0;
  private _simulatedCallCount = 0;

  public readonly productionProviderCallCount = 0;

  public get simulatedCallCount(): number {
    return this._simulatedCallCount;
  }

  public async complete(
    request: SimulatedProviderRequest
  ): Promise<SmsSafeguardProviderSimulationResult> {
    const step =
      this.steps[Math.min(this.nextStepIndex++, this.steps.length - 1)];
    const delayMs = clampDelay(step.delayMs);
    this._simulatedCallCount += 1;

    if (request.signal?.aborted || step.outcome === "cancelled") {
      return { kind: "cancelled", delayMs };
    }

    if (delayMs > 0) {
      await this.sleep(delayMs);
      if (request.signal?.aborted) {
        return { kind: "cancelled", delayMs };
      }
    }

    if (step.outcome === "retryable-failure") {
      return { kind: "retryable", delayMs };
    }
    if (step.outcome === "permanent-failure") {
      return { kind: "permanent", delayMs };
    }
    if (step.outcome === "malformed") {
      return { kind: "malformed", delayMs };
    }

    const transactions = this.buildTransactions(
      step.outcome,
      request.messageIds
    );
    return {
      kind: step.outcome === "incomplete" ? "incomplete" : "completion",
      envelope: {
        requestId: request.requestId,
        completionStatus: completionStatusForOutcome(step.outcome),
        transactions,
      },
      delayMs,
      isLowConfidence: step.outcome === "low-confidence-success",
    };
  }

  private buildTransactions(
    outcome: SimulatedProviderOutcome,
    messageIds: readonly string[]
  ): SmsProviderCompletionEnvelope["transactions"] {
    if (outcome === "omission") return [];

    if (outcome === "invalid-identity") {
      return [{ messageId: "unknown-simulated-message", isTrusted: true }];
    }

    const isTrusted =
      outcome === "trusted-success" || outcome === "low-confidence-success";
    return messageIds.map((messageId) => ({ messageId, isTrusted }));
  }
}
