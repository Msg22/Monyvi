import { z } from "zod";

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
export const DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS = 25_000;
const DEEPINFRA_SMS_MAX_RETRIES = 3;
const DEEPINFRA_SMS_BASE_RETRY_DELAY_MS = 2_000;
const DEEPINFRA_SMS_MAX_OUTPUT_TOKENS = 8_192;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type Sleep = (milliseconds: number) => Promise<void>;
type CreateTimeoutSignal = (milliseconds: number) => AbortSignal;
type ResponseOutputCapture = (content: string) => void;
type ProviderLogger = (
  event: string,
  metadata: SmsAiProviderOperationalMetadata
) => void;

export interface DeepInfraSmsProviderDependencies {
  readonly fetch?: FetchLike;
  readonly sleep?: Sleep;
  readonly createTimeoutSignal?: CreateTimeoutSignal;
  readonly log?: ProviderLogger;
  readonly onResponseOutput?: ResponseOutputCapture;
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
  constructor(
    readonly status: number,
    readonly isRetryable: boolean
  ) {
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultTimeoutSignal(milliseconds: number): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
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
  private readonly sleep: Sleep;
  private readonly createTimeoutSignal: CreateTimeoutSignal;
  private readonly log?: ProviderLogger;
  private readonly onResponseOutput?: ResponseOutputCapture;

  constructor(
    private readonly config: SmsAiProviderConfig,
    dependencies: DeepInfraSmsProviderDependencies = {}
  ) {
    if (!isSupportedServiceTier(config.serviceTier)) {
      throw new Error("Unsupported DeepInfra SMS service tier");
    }
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.createTimeoutSignal =
      dependencies.createTimeoutSignal ?? defaultTimeoutSignal;
    this.log = dependencies.log;
    this.onResponseOutput = dependencies.onResponseOutput;
  }

  async execute(
    request: SmsAiProviderRequest
  ): Promise<SmsAiProviderRawResult> {
    const body = buildRequestBody(this.config, request);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= DEEPINFRA_SMS_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.sleep(
          DEEPINFRA_SMS_BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        );
      }

      try {
        const response = await this.fetchImpl(DEEPINFRA_SMS_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: this.createTimeoutSignal(DEEPINFRA_SMS_ATTEMPT_TIMEOUT_MS),
        });

        if (!response.ok) {
          const error = new DeepInfraSmsHttpError(
            response.status,
            isRetryableHttpStatus(response.status)
          );
          if (!error.isRetryable) throw error;
          lastError = error;
          if (attempt < DEEPINFRA_SMS_MAX_RETRIES) continue;
          throw error;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new DeepInfraSmsInvalidResponseError();
        }

        const parsed = DeepInfraResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new DeepInfraSmsInvalidResponseError();
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
        if (
          error instanceof DeepInfraSmsInvalidResponseError ||
          (error instanceof DeepInfraSmsHttpError && !error.isRetryable)
        ) {
          throw error;
        }

        lastError = error;
        if (attempt >= DEEPINFRA_SMS_MAX_RETRIES) {
          break;
        }
      }
    }

    if (lastError instanceof DeepInfraSmsHttpError) {
      throw lastError;
    }

    throw new Error("DeepInfra SMS request failed after retries", {
      cause: lastError,
    });
  }
}
