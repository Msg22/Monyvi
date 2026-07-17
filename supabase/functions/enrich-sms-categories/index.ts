import "edge-runtime";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { withTimeout } from "../_shared/promise-timeout.ts";
import { handleSmsCategoryEnrichmentRequest } from "../_shared/sms-category-enrichment-handler.ts";
import {
  buildSmsCategoryResponseSchema,
  buildSmsCategoryPrompt,
  parseSmsCategoryResponse,
  type SmsCategoryRequest,
  type SmsCategoryResponse,
} from "../_shared/sms-category-enrichment-contract.ts";

const MAX_RETRIES = 1;
const BASE_RETRY_DELAY_MS = 1000;
const PROVIDER_TIMEOUT_MS = 8000;

function getSafeErrorType(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

async function verifyAuth(
  authHeader: string | null
): Promise<{ readonly userId: string } | null> {
  if (!authHeader) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  const supabase = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : { userId: data.user.id };
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
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

async function classifyWithRetry(
  ai: GoogleGenAI,
  request: SmsCategoryRequest,
  requestSignal: AbortSignal
): Promise<SmsCategoryResponse | null> {
  const prompt = buildSmsCategoryPrompt(request);
  const responseSchema = buildSmsCategoryResponseSchema(
    request.merchants.length
  );
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
          requestSignal
        );
      }
      const response = await withTimeout(
        (signal) =>
          ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt,
            config: {
              abortSignal: signal,
              systemInstruction:
                "Classify each supplied merchant into one supplied system category. Return only the requested JSON fields. Do not invent categories.",
              responseMimeType: "application/json",
              responseJsonSchema: responseSchema,
              temperature: 0,
            },
          }),
        PROVIDER_TIMEOUT_MS,
        requestSignal
      );
      const text = response.text ?? "";
      if (text.length === 0) throw new Error("EmptyProviderResponse");
      const parsed = parseSmsCategoryResponse(JSON.parse(text), request);
      if (parsed === null) throw new Error("InvalidProviderResponse");
      return parsed;
    } catch (error: unknown) {
      if (requestSignal.aborted) throw error;
      lastError = error;
      console.warn("[enrich-sms-categories] Provider attempt failed", {
        attempt: attempt + 1,
        errorType: getSafeErrorType(error),
      });
    }
  }

  console.error("[enrich-sms-categories] Provider retries exhausted", {
    errorType: getSafeErrorType(lastError),
  });
  return null;
}

Deno.serve((request: Request): Promise<Response> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  return handleSmsCategoryEnrichmentRequest(request, {
    authenticate: verifyAuth,
    hasConsent: hasActiveAiProcessingConsent,
    isProviderConfigured: Boolean(apiKey),
    classify: (body, signal) =>
      apiKey
        ? classifyWithRetry(new GoogleGenAI({ apiKey }), body, signal)
        : Promise.resolve(null),
    logInfo: (...values) => console.log(...values),
    logError: (...values) => console.error(...values),
  });
});
