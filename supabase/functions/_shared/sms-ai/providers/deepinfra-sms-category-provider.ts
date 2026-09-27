import { z } from "zod";

import { withTimeout as defaultWithTimeout } from "../../promise-timeout.ts";
import {
  buildSmsCategoryPrompt,
  buildSmsCategoryResponseSchema,
  parseSmsCategoryResponse,
  type SmsCategoryRequest,
  type SmsCategoryResponse,
} from "../../sms-category-enrichment-contract.ts";
import type { SmsAiProviderConfig } from "../sms-ai-provider-config.ts";
import { DEEPINFRA_SMS_ENDPOINT } from "./deepinfra-sms-provider.ts";

export const DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS = 8_000;
const DEEPINFRA_SMS_CATEGORY_MAX_RETRIES = 1;
const DEEPINFRA_SMS_CATEGORY_BASE_RETRY_DELAY_MS = 1_000;
const CATEGORY_SYSTEM_INSTRUCTION =
  "Classify each supplied merchant into one supplied system category. Return only the requested JSON fields. Do not invent categories.";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type Sleep = (
  milliseconds: number,
  signal: AbortSignal
) => Promise<void>;

type WithTimeout = <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal
) => Promise<T>;

type ProviderLog = (...values: readonly unknown[]) => void;

export interface DeepInfraSmsCategoryProviderDependencies {
  readonly fetch?: FetchLike;
  readonly sleep?: Sleep;
  readonly withTimeout?: WithTimeout;
  readonly logWarn?: ProviderLog;
  readonly logError?: ProviderLog;
}

const DeepInfraCategoryResponseEnvelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      })
    )
    .min(1),
});

function getSafeErrorType(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

function getProviderFailurePhase(error: unknown): string {
  if (error instanceof SyntaxError) return "json_parse";
  if (!(error instanceof Error)) return "provider_request";
  if (error.name === "TimeoutError") return "timeout";
  if (error.message === "EmptyProviderResponse") return "empty_response";
  if (error.message === "InvalidProviderResponse") {
    return "response_validation";
  }
  return "provider_request";
}

function defaultSleep(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

function buildRequestBody(
  config: SmsAiProviderConfig,
  request: SmsCategoryRequest
): Readonly<Record<string, unknown>> {
  return {
    model: config.model,
    messages: [
      {
        role: "system",
        content: CATEGORY_SYSTEM_INSTRUCTION,
      },
      {
        role: "user",
        content: buildSmsCategoryPrompt(request),
      },
    ],
    temperature: 0,
    reasoning_effort: "none",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "monyvi_sms_category_enrichment",
        strict: true,
        schema: buildSmsCategoryResponseSchema(request.merchants.length),
      },
    },
    ...(config.serviceTier === "default"
      ? {}
      : { service_tier: config.serviceTier }),
  };
}

export class DeepInfraSmsCategoryProvider {
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: Sleep;
  private readonly withTimeoutImpl: WithTimeout;
  private readonly logWarn: ProviderLog;
  private readonly logError: ProviderLog;

  constructor(
    private readonly config: SmsAiProviderConfig,
    dependencies: DeepInfraSmsCategoryProviderDependencies = {}
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.sleepImpl = dependencies.sleep ?? defaultSleep;
    this.withTimeoutImpl = dependencies.withTimeout ?? defaultWithTimeout;
    this.logWarn = dependencies.logWarn ?? (() => undefined);
    this.logError = dependencies.logError ?? (() => undefined);
  }

  async classify(
    request: SmsCategoryRequest,
    requestSignal: AbortSignal
  ): Promise<SmsCategoryResponse | null> {
    const body = buildRequestBody(this.config, request);
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt <= DEEPINFRA_SMS_CATEGORY_MAX_RETRIES;
      attempt++
    ) {
      try {
        if (attempt > 0) {
          await this.sleepImpl(
            DEEPINFRA_SMS_CATEGORY_BASE_RETRY_DELAY_MS *
              Math.pow(2, attempt - 1),
            requestSignal
          );
        }

        const response = await this.withTimeoutImpl(
          (signal) =>
            this.fetchImpl(DEEPINFRA_SMS_ENDPOINT, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.apiKey}`,
              },
              body: JSON.stringify(body),
              signal,
            }),
          DEEPINFRA_SMS_CATEGORY_ATTEMPT_TIMEOUT_MS,
          requestSignal
        );

        if (!response.ok) {
          throw new Error(`DeepInfra category request failed with HTTP ${response.status}`);
        }

        const payload: unknown = await response.json();
        const parsedEnvelope =
          DeepInfraCategoryResponseEnvelopeSchema.safeParse(payload);
        if (!parsedEnvelope.success) {
          throw new Error("InvalidProviderResponse");
        }

        const choice = parsedEnvelope.data.choices[0];
        if (choice.finish_reason !== "stop") {
          throw new Error("InvalidProviderResponse");
        }

        const text = choice.message.content ?? "";
        if (text.length === 0) {
          throw new Error("EmptyProviderResponse");
        }

        const parsed = parseSmsCategoryResponse(JSON.parse(text), request);
        if (parsed === null) {
          throw new Error("InvalidProviderResponse");
        }
        return parsed;
      } catch (error: unknown) {
        if (requestSignal.aborted) throw error;
        lastError = error;
        this.logWarn("[enrich-sms-categories] Provider attempt failed", {
          attempt: attempt + 1,
          errorType: getSafeErrorType(error),
          phase: getProviderFailurePhase(error),
        });
      }
    }

    this.logError("[enrich-sms-categories] Provider retries exhausted", {
      errorType: getSafeErrorType(lastError),
      phase: getProviderFailurePhase(lastError),
    });
    return null;
  }
}
