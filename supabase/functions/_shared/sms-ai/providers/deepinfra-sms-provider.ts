import { z } from "zod";

import { SmsAiProviderCallerAbortError } from "../sms-ai-provider.ts";
import type {
  SmsAiProvider,
  SmsAiProviderOperationalMetadata,
  SmsAiProviderRawResult,
  SmsAiProviderRequest,
} from "../sms-ai-provider.ts";
import type {
  SmsAiProviderConfig,
  SmsAiServiceTier,
} from "../sms-ai-provider-config.ts";

export const DEEPINFRA_SMS_ENDPOINT =
  "https://api.deepinfra.com/v1/openai/chat/completions";
export const DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS = 60_000;
const DEEPINFRA_SMS_TOTAL_ATTEMPTS = 1;
const DEEPINFRA_SMS_MAX_OUTPUT_TOKENS = 8_192;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type Sleep = (milliseconds: number) => Promise<void>;
type CreateTimeoutSignal = (milliseconds: number) => AbortSignal;
type ResponseOutputCapture = (content: string) => void;

export type DeepInfraSmsAttemptFailurePhase = "fetch" | "response_body";

export interface DeepInfraSmsAttemptFailureMetadata {
  readonly attempt: number;
  readonly totalAttempts: number;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
  readonly errorName: string;
  readonly upstreamStatus?: number;
  readonly willRetry: boolean;
  readonly phase: DeepInfraSmsAttemptFailurePhase;
}

type AttemptFailureCapture = (
  metadata: DeepInfraSmsAttemptFailureMetadata
) => void;
type ProviderLogger = (
  event: string,
  metadata: SmsAiProviderOperationalMetadata
) => void;

export interface DeepInfraSmsProviderDependencies {
  readonly fetch?: FetchLike;
  /** Retained as an injected compatibility seam; automatic retries are disabled. */
  readonly sleep?: Sleep;
  readonly createTimeoutSignal?: CreateTimeoutSignal;
  readonly log?: ProviderLogger;
  readonly onResponseOutput?: ResponseOutputCapture;
  readonly onAttemptFailure?: AttemptFailureCapture;
}

const DeepInfraResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  service_tier: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          role: z.string().optional(),
          content: z.string().nullable().optional(),
        }),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      completion_tokens: z.number().nonnegative().optional(),
      total_tokens: z.number().nonnegative().optional(),
      prompt_tokens_details: z
        .object({
          cached_tokens: z.number().nonnegative().optional(),
        })
        .optional(),
      estimated_cost: z.number().nonnegative().optional(),
    })
    .optional(),
});

class DeepInfraSmsHttpError extends Error {
  constructor(readonly status: number) {
    super(`DeepInfra SMS request failed with HTTP ${status}`);
    this.name = "DeepInfraSmsHttpError";
  }
}

class DeepInfraSmsInvalidResponseError extends Error {
  constructor() {
    super("Invalid DeepInfra SMS response");
    this.name = "DeepInfraSmsInvalidResponseError";
  }
}

interface AttemptTimeout {
  readonly signal: AbortSignal;
  readonly cleanup: () => void;
}

function createAttemptTimeout(
  injectedFactory: CreateTimeoutSignal | undefined
): AttemptTimeout {
  if (injectedFactory !== undefined) {
    return {
      signal: injectedFactory(DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS),
      cleanup: () => undefined,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("DeepInfra SMS request timed out", "TimeoutError")
      ),
    DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS
  );
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

interface AttemptAbortContext {
  readonly signal: AbortSignal;
  readonly callerAborted: () => boolean;
  readonly cleanup: () => void;
}

function createAttemptAbortContext(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal
): AttemptAbortContext {
  if (callerSignal?.aborted) {
    throw new SmsAiProviderCallerAbortError();
  }
  const controller = new AbortController();
  let source: "caller" | "timeout" | null = null;
  const abortFrom = (
    nextSource: "caller" | "timeout",
    reason: unknown
  ): void => {
    if (source !== null) return;
    source = nextSource;
    controller.abort(reason);
  };
  const onCallerAbort = (): void =>
    abortFrom("caller", callerSignal?.reason);
  const onTimeoutAbort = (): void => abortFrom("timeout", timeoutSignal.reason);

  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  timeoutSignal.addEventListener("abort", onTimeoutAbort, { once: true });
  if (timeoutSignal.aborted) onTimeoutAbort();

  return {
    signal: controller.signal,
    callerAborted: () => source === "caller",
    cleanup: () => {
      callerSignal?.removeEventListener("abort", onCallerAbort);
      timeoutSignal.removeEventListener("abort", onTimeoutAbort);
    },
  };
}

function getSafeErrorName(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return typeof error;
}

function mapCompletionStatus(
  finishReason: string | null | undefined
): SmsAiProviderRawResult["completionStatus"] {
  if (finishReason === "stop") return "complete";
  if (finishReason === "length") return "truncated";
  if (
    finishReason === "content_filter" ||
    finishReason === "safety" ||
    finishReason === "prohibited_content"
  ) {
    return "safety_stopped";
  }
  return "failed";
}

function buildOperationalMetadata(
  value: z.infer<typeof DeepInfraResponseSchema>
): SmsAiProviderOperationalMetadata | undefined {
  const usage = value.usage;
  const metadata: SmsAiProviderOperationalMetadata = {
    ...(value.service_tier === undefined
      ? {}
      : { serviceTier: value.service_tier }),
    ...(usage?.prompt_tokens === undefined
      ? {}
      : { promptTokens: usage.prompt_tokens }),
    ...(usage?.completion_tokens === undefined
      ? {}
      : { completionTokens: usage.completion_tokens }),
    ...(usage?.prompt_tokens_details?.cached_tokens === undefined
      ? {}
      : { cachedTokens: usage.prompt_tokens_details.cached_tokens }),
    ...(usage?.estimated_cost === undefined
      ? {}
      : { estimatedCost: usage.estimated_cost }),
  };

  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function buildRequestBody(
  config: SmsAiProviderConfig,
  request: SmsAiProviderRequest
): Readonly<Record<string, unknown>> {
  return {
    model: config.model,
    messages: request.messages,
    temperature: 0,
    max_tokens: DEEPINFRA_SMS_MAX_OUTPUT_TOKENS,
    reasoning_effort: "none",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "monyvi_sms_transactions",
        strict: true,
        schema: request.responseSchema,
      },
    },
    ...(config.serviceTier === "default"
      ? {}
      : { service_tier: config.serviceTier }),
  };
}

function isSupportedServiceTier(
  value: SmsAiServiceTier
): value is SmsAiServiceTier {
  return value === "default" || value === "priority";
}

export class DeepInfraSmsProvider implements SmsAiProvider {
  private readonly fetchImpl: FetchLike;
  private readonly createTimeoutSignal?: CreateTimeoutSignal;
  private readonly log?: ProviderLogger;
  private readonly onResponseOutput?: ResponseOutputCapture;
  private readonly onAttemptFailure?: AttemptFailureCapture;

  constructor(
    private readonly config: SmsAiProviderConfig,
    dependencies: DeepInfraSmsProviderDependencies = {}
  ) {
    if (!isSupportedServiceTier(config.serviceTier)) {
      throw new Error("Unsupported DeepInfra SMS service tier");
    }
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.createTimeoutSignal = dependencies.createTimeoutSignal;
    this.log = dependencies.log;
    this.onResponseOutput = dependencies.onResponseOutput;
    this.onAttemptFailure = dependencies.onAttemptFailure;
  }

  private emitAttemptFailure(
    metadata: DeepInfraSmsAttemptFailureMetadata
  ): void {
    try {
      this.onAttemptFailure?.(metadata);
    } catch {
      // Development-only diagnostics must never alter provider behavior.
    }
  }

  async execute(
    request: SmsAiProviderRequest
  ): Promise<SmsAiProviderRawResult> {
    if (request.signal?.aborted) {
      throw new SmsAiProviderCallerAbortError();
    }
    const body = buildRequestBody(this.config, request);
    const timeout = createAttemptTimeout(this.createTimeoutSignal);
    const attempt = createAttemptAbortContext(request.signal, timeout.signal);
    const attemptStartedAtMs = Date.now();

    try {
        const response = await this.fetchImpl(DEEPINFRA_SMS_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: attempt.signal,
        });

        if (!response.ok) {
          const error = new DeepInfraSmsHttpError(response.status);
          const willRetry = false;
          this.emitAttemptFailure({
            attempt: 1,
            totalAttempts: DEEPINFRA_SMS_TOTAL_ATTEMPTS,
            elapsedMs: Date.now() - attemptStartedAtMs,
            timeoutMs: DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS,
            errorName: error.name,
            upstreamStatus: response.status,
            willRetry,
            phase: "fetch",
          });
          throw error;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error: unknown) {
          if (attempt.callerAborted()) {
            throw new SmsAiProviderCallerAbortError();
          }
          this.emitAttemptFailure({
            attempt: 1,
            totalAttempts: DEEPINFRA_SMS_TOTAL_ATTEMPTS,
            elapsedMs: Date.now() - attemptStartedAtMs,
            timeoutMs: DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS,
            errorName: getSafeErrorName(error),
            upstreamStatus: response.status,
            willRetry: false,
            phase: "response_body",
          });
          throw new DeepInfraSmsInvalidResponseError();
        }

        const parsed = DeepInfraResponseSchema.safeParse(payload);
        if (!parsed.success) {
          const error = new DeepInfraSmsInvalidResponseError();
          this.emitAttemptFailure({
            attempt: 1,
            totalAttempts: DEEPINFRA_SMS_TOTAL_ATTEMPTS,
            elapsedMs: Date.now() - attemptStartedAtMs,
            timeoutMs: DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS,
            errorName: error.name,
            upstreamStatus: response.status,
            willRetry: false,
            phase: "response_body",
          });
          throw error;
        }

        if (attempt.callerAborted()) {
          throw new SmsAiProviderCallerAbortError();
        }

        const choice = parsed.data.choices[0];
        const responseContent = choice.message.content ?? "";
        try {
          this.onResponseOutput?.(responseContent);
        } catch {
          // Development-only diagnostics must never alter provider behavior.
        }
        const operationalMetadata = buildOperationalMetadata(parsed.data);
        if (operationalMetadata !== undefined) {
          this.log?.("smsAi.providerUsage", operationalMetadata);
        }

        return {
          completionStatus: mapCompletionStatus(choice.finish_reason),
          content: responseContent,
          ...(operationalMetadata === undefined ? {} : { operationalMetadata }),
        };
      } catch (error: unknown) {
        if (attempt.callerAborted()) {
          throw new SmsAiProviderCallerAbortError();
        }
        if (
          error instanceof DeepInfraSmsInvalidResponseError ||
          error instanceof DeepInfraSmsHttpError
        ) {
          throw error;
        }
        this.emitAttemptFailure({
          attempt: 1,
          totalAttempts: DEEPINFRA_SMS_TOTAL_ATTEMPTS,
          elapsedMs: Date.now() - attemptStartedAtMs,
          timeoutMs: DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS,
          errorName: getSafeErrorName(error),
          willRetry: false,
          phase: "fetch",
        });
        throw new Error("DeepInfra SMS request failed", { cause: error });
      } finally {
        attempt.cleanup();
        timeout.cleanup();
      }
  }
}
