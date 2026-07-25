/**
 * parse-sms Edge Function
 *
 * Receives a batch of SMS messages from a single client chunk,
 * parses them through Gemini 2.5 Flash-Lite with retry/backoff,
 * and returns structured transaction data.
 *
 * Architecture & Design Rationale:
 * - Pattern: Gateway + Retry (exponential backoff)
 * - Why: Gemini rate limits cause 429/500 errors under load.
 *   Retry with backoff absorbs transient failures without pushing
 *   complexity to the mobile client.
 * - SOLID: SRP — only handles AI interaction, no filtering.
 *
 * @module parse-sms
 */

import "edge-runtime";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { buildSmsParserSpecialCaseRules } from "../_shared/sms-parser-special-cases.ts";
import { isLikelyCorruptedSmsText } from "../_shared/sms-text-quality.ts";
import { isExcludedBeforeSmsParsingAtEdge } from "../_shared/sms-hard-exclusions.ts";
import { buildSmsProviderUserPromptAtEdge } from "../_shared/sms-input-estimator.ts";
import {
  createParseSmsHandler,
  type ExecuteSmsProviderInput,
  type ParseSmsMessage,
  type SmsProviderExecutionResult,
} from "../_shared/parse-sms-handler.ts";
import {
  completeSmsAiWork,
  markSmsAiProviderStarted,
  resolveSmsScanWindowStart,
  releaseSmsAiWork,
  reserveSmsAiWork,
} from "../_shared/sms-ai-safeguard-service.ts";
import { logSmsAiOperationalResponse } from "../_shared/sms-ai-operational-telemetry.ts";
import { reconcileSmsNegativeOutcomes } from "../_shared/sms-negative-outcome-handler.ts";
import { readSmsSafeguardPolicyFromEnvironment } from "../_shared/sms-safeguard-policy.ts";
import { parseSmsProviderTransactions } from "../_shared/sms-provider-transaction-validator.ts";
import {
  computeRequestDigestAtEdge,
  computeSmsFingerprintAtEdge,
} from "../_shared/sms-fingerprint-at-edge.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max retries for Gemini API calls. */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms). Retries: 2s, 4s, 8s. */
const BASE_RETRY_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Category tree — embedded to avoid DB round-trips.
// Mirrors the L1/L2 hierarchy from migration 004_update_categories.sql.
// The AI MUST return one of these exact system_name values.
// ---------------------------------------------------------------------------

const CATEGORY_TREE = `
EXPENSE categories (return the system_name value):
  L1: food_drinks
    L2: groceries, restaurant, coffee_tea, snacks, drinks, food_other
  L1: transportation
    L2: public_transport, private_transport, transport_other
  L1: vehicle
    L2: fuel, parking, rental, license_fees, vehicle_tax, traffic_fine, vehicle_buy, vehicle_sell, vehicle_maintenance, vehicle_other
  L1: shopping
    L2: clothes, electronics_appliances, accessories, footwear, bags, kids_baby, beauty, home_garden, pets, sports_fitness, toys_games, wedding, detergents, decorations, personal_care, shopping_other
  L1: health_medical
    L2: doctor, medicine, surgery, dental, health_other
  L1: utilities_bills
    L2: electricity, water, internet, phone, gas, trash, online_subscription, streaming, taxes, utilities_other
  L1: entertainment
    L2: events, tickets, trips_holidays, entertainment_other
  L1: charity
    L2: donations, fundraising, charity_gifts, charity_other
  L1: education
    L2: books, tuition, education_fees, education_other
  L1: housing
    L2: rent, housing_maintenance, housing_tax, housing_buy, housing_sell, housing_other
  L1: travel
    L2: vacation, business_travel, holiday, travel_other
  L1: debt_loans
    L2: lent_money, debt_repayment_paid, debt_other
  L1: asset_purchase
  L1: other
    L2: uncategorized

INCOME categories:
  L1: income
    L2: salary, bonus, commission, refund, loan_income, gift_income, check, rental_income, freelance, business_income, income_other
  L1: asset_sale
  L1: debt_loans
    L2: borrowed_money, debt_repayment_received
`;

// ---------------------------------------------------------------------------
// Gemini response JSON schema factory
// ---------------------------------------------------------------------------

/** Default currency enum fallback when client doesn't provide supported currencies. */
const DEFAULT_CURRENCY_ENUM: readonly string[] = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "KWD",
];

/**
 * Builds the Gemini response JSON schema with dynamic currency enum.
 *
 * @param currencies - Supported currencies from the client (falls back to DEFAULT_CURRENCY_ENUM)
 */
function buildResponseSchema(
  currencies: readonly string[]
): Record<string, unknown> {
  const currencyEnum =
    currencies.length > 0 ? currencies : DEFAULT_CURRENCY_ENUM;

  return {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        description:
          "Array of parsed transactions. Only include CLEARLY financial transactions.",
        items: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "Original SMS message ID.",
            },
            amount: {
              type: "number",
              description: "Transaction amount as positive number.",
            },
            currency: {
              type: "string",
              enum: currencyEnum,
            },
            type: {
              type: "string",
              enum: ["EXPENSE", "INCOME"],
            },
            counterparty: {
              type: "string",
              description:
                "Counterparty name (merchant, vendor, person, or entity).",
            },
            date: {
              type: "string",
              description: "YYYY-MM-DD format.",
            },
            categorySystemName: {
              type: "string",
              description:
                "Exactly ONE system_name from the category tree. Use a specific L2 ONLY when confident. If uncertain about which L2 fits, use the L1 parent instead. NEVER use *_other L2 categories (e.g. food_other, shopping_other) — use the L1 parent. Fall back to 'other' only as last resort.",
            },
            isAtmWithdrawal: {
              type: "boolean",
              description: "True for ATM/Bank cash withdrawals only.",
            },
            cardLast4: {
              type: "string",
              description: "Last 4 digits of card if mentioned.",
            },
            confidenceScore: {
              type: "number",
              description:
                "Your confidence in the accuracy of this extraction (0.0 to 1.0). 1.0 = all fields are perfectly clear in the SMS. 0.5 = some fields required guessing. 0.0 = mostly guessing.",
            },
            isTrusted: {
              type: "boolean",
              description:
                "True if you are confident this is a REAL completed transaction (money actually moved). False if the message is ambiguous, promotional with amounts, or you are not 100% sure it represents actual money movement.",
            },
          },
          required: [
            "messageId",
            "amount",
            "currency",
            "type",
            "counterparty",
            "date",
            "categorySystemName",
            "confidenceScore",
            "isTrusted",
          ],
        },
      },
    },
    required: ["transactions"],
  };
}

/**
 * Builds the system prompt for Gemini SMS parsing.
 *
 * @param categoryTree - Category hierarchy (falls back to embedded CATEGORY_TREE)
 */
function buildSystemPrompt(categoryTree: string): string {
  return `You are Monyvi AI, a financial SMS parser for an Egyptian personal finance app.

YOUR TASK:
Parse each SMS and extract structured transaction data.
Only include messages that are CLEARLY completed financial transactions where money has ACTUALLY moved.

TRANSACTION CRITERIA — A real transaction SMS MUST have ALL of these:
1. ACTUAL MONEY MOVEMENT: Money was debited, credited, sent, received, withdrawn, or paid. The SMS confirms a completed action, not a future/conditional one.
2. SPECIFIC AMOUNT: A concrete amount that was actually transacted (not a promotional offer, reward, or incentive amount).
3. PAST TENSE / CONFIRMATION: The message confirms something that already happened (e.g., "تم خصم", "تم تحويل", "paid", "debited", "credited", "received").
4. BANK/WALLET NOTIFICATION: The SMS is a system notification from a bank, wallet, or payment provider about an actual account activity.

RED FLAGS — Do NOT include if ANY of these are true:
- The message uses FUTURE/CONDITIONAL language ("enjoy", "get", "استمتع", "هتاخد", "افتح", "ارجع")
- The amount is a PROMOTIONAL OFFER, cashback incentive, or reward (e.g., "enjoy up to 100 EGP cashback")
- The message is INVITING the user to do something (open a wallet, visit a branch, subscribe)
- The message mentions a DATE IN THE FUTURE as a deadline ("before 2026-02-19")
- There is NO confirmation of actual money movement — just an offer or advertisement
- The message is about account activation, deactivation, or security (OTP, PIN reset)

${buildSmsParserSpecialCaseRules()}

EXAMPLES OF NON-TRANSACTIONS (DO NOT INCLUDE):
- "افتح محفظة فودافون كاش وإستمتع بكاش باك مضمون لحد 100 جنيه" → promotional offer, NOT a transaction
- "ارجع افتح محفظة وإستمتع ب 200 جنيه" → incentive to open wallet, NOT a transaction
- "زور أقرب فرع لتنشيط حسابكم" → account activation request, NOT a transaction
- "الرقم المؤقت لإعادة انشاء رقم سري جديد هو 98764" → PIN/OTP reset, NOT a transaction

INCLUDE ONLY:
- Card purchases / POS payments
- ATM withdrawals
- Bank withdrawals
- Bank transfers (sent/received, including InstaPay)
- Mobile wallet payments and transfers
- Salary credits
- Loan disbursements / repayments
- Bill payments through banking apps
- Refunds to bank account

DO NOT INCLUDE:
- OTP / verification codes
- Marketing / promotional SMS (even if they mention amounts)
- Balance inquiry responses
- Telecom recharges / top-ups / data bundles
- SIM subscriptions
- Loyalty / reward points
- Card activation / deactivation notices
- Password reset or security alerts
- App download links
- Cashback offers / incentive messages
- Account activation requests
- Any message where you are uncertain

WHEN IN DOUBT, SKIP. Precision > recall.

isTrusted FIELD:
- Set isTrusted to true ONLY when you are highly confident this is a real, completed transaction with actual money movement.
- Set isTrusted to false when: the message is ambiguous, you're unsure if money actually moved, the amount could be promotional, or the SMS format is unusual.
- When in doubt, set isTrusted to false — the user will review these.

PARSING RULES:
1. Amount: positive number, remove separators, handle Arabic numerals.
2. Currency: the default currency is EGP, but it can be different based on the SMS content.
3. Type: EXPENSE = money out, INCOME = money in.
4. Counterparty: the merchant, vendor, person, or entity the user transacted WITH.
   Counterparty MUST NEVER be the same as the sender.
   The sender is the bank/wallet that SENT the SMS.
   If no distinct counterparty can be extracted, set counterparty to empty string "".
5. Date: from SMS body or use provided date.
6. Category: return EXACTLY ONE system_name from the CATEGORY TREE below.
   You MUST NOT invent, combine, or modify category names.
   Valid values are ONLY the exact strings listed in the tree.
   Use a specific L2 when confident (e.g. groceries, restaurant).
   If uncertain which L2 fits, use the L1 parent (e.g. food_drinks, shopping).
   NEVER use *_other L2 categories (food_other, shopping_other, etc.) — always prefer the L1 parent.
   Only use 'other' as an absolute last resort.
7. isAtmWithdrawal: true only for ATM withdrawals.
8. cardLast4: last 4 card digits if mentioned.
9. confidenceScore: your confidence in the accuracy of this extraction (0.0 to 1.0).
    1.0 = all fields are perfectly clear in the SMS.
    0.5 = some fields required guessing (e.g., category, counterparty).
    Below 0.3 = most fields are uncertain — consider skipping instead.

CATEGORY TREE:
${categoryTree}

Handle Arabic naturally. InstaPay: \u062a\u062d\u0648\u064a\u0644 \u0627\u0644\u0649 = sent (EXPENSE), \u062a\u062d\u0648\u064a\u0644 \u0645\u0646 = received (INCOME).
If the message contains "IPN transfer" and you can't extract the counterparty from the message, set counterparty to "Instapay".
`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSafeErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  return typeof error;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Verify the JWT from the Authorization header using Supabase client.
 */
async function verifyAuth(
  authHeader: string | null
): Promise<{ userId: string } | null> {
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return { userId: data.user.id };
}

function createServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment is not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getProcessingOutcomes(
  userId: string,
  fingerprints: readonly string[],
  lookbackDays: number,
  referenceNowMs: number
): Promise<
  readonly { readonly smsFingerprint: string; readonly isTerminal: boolean }[]
> {
  if (fingerprints.length === 0) return [];

  const { data, error } = await createServiceClient()
    .from("sms_ai_negative_outcomes")
    .select("sms_fingerprint,is_terminal")
    .eq("user_id", userId)
    .eq("deleted", false)
    .or(
      `is_terminal.eq.true,original_received_at.gte.${new Date(
        referenceNowMs - lookbackDays * 24 * 60 * 60 * 1000
      ).toISOString()}`
    )
    .in("sms_fingerprint", [...new Set(fingerprints)]);

  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    typeof row.sms_fingerprint === "string" &&
    typeof row.is_terminal === "boolean"
      ? [
          {
            smsFingerprint: row.sms_fingerprint,
            isTerminal: row.is_terminal,
          },
        ]
      : []
  );
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process messages through Gemini with retry and exponential backoff.
 * Retries up to MAX_RETRIES times on failure (2s → 4s → 8s delays).
 */
function getCompletionStatus(response: {
  readonly candidates?: readonly { readonly finishReason?: unknown }[];
  readonly promptFeedback?: { readonly blockReason?: unknown };
}): SmsProviderExecutionResult["completionStatus"] {
  const finishReason = String(response.candidates?.[0]?.finishReason ?? "");
  if (finishReason === "STOP") return "complete";
  if (finishReason === "MAX_TOKENS") return "truncated";
  if (
    finishReason === "SAFETY" ||
    finishReason === "RECITATION" ||
    finishReason === "PROHIBITED_CONTENT" ||
    response.promptFeedback?.blockReason !== undefined
  ) {
    return "safety_stopped";
  }
  return "failed";
}

async function processWithRetry(
  ai: GoogleGenAI,
  messages: readonly ParseSmsMessage[],
  systemPrompt: string,
  responseSchema: Record<string, unknown>,
  validationContext: {
    readonly supportedCurrencies: readonly string[];
    readonly categoryTree: string;
  }
): Promise<SmsProviderExecutionResult> {
  const userPrompt = buildSmsProviderUserPromptAtEdge(messages);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `[parse-sms] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`
        );
        await sleep(delay);
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
          temperature: 0,
        },
      });

      const completionStatus = getCompletionStatus(response);
      const text = response.text ?? "";
      if (text.length === 0) {
        return {
          completionStatus,
          isResponseSchemaValid: false,
          transactions: [],
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          completionStatus,
          isResponseSchemaValid: false,
          transactions: [],
        };
      }
      const parsedTransactions = parseSmsProviderTransactions(
        parsed,
        validationContext
      );
      return {
        completionStatus,
        isResponseSchemaValid: parsedTransactions.isValid,
        transactions: parsedTransactions.transactions,
      };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = getErrorMessage(err);
      console.error("[parse-sms] Gemini attempt failed", {
        attempt: attempt + 1,
        errorType: getSafeErrorType(err),
      });

      // Don't retry on non-retryable errors (auth, bad request)
      if (
        errMsg.includes("401") ||
        errMsg.includes("403") ||
        errMsg.includes("INVALID")
      ) {
        break;
      }
    }
  }

  // All retries exhausted
  console.error("[parse-sms] All retries exhausted", {
    errorType: getSafeErrorType(lastError),
  });
  throw lastError instanceof Error
    ? lastError
    : new Error("SMS provider execution failed");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const parseSmsHandler = createParseSmsHandler({
  authenticate: async (request) => {
    const auth = await verifyAuth(request.headers.get("authorization"));
    return auth?.userId ?? null;
  },
  hasConsent: hasActiveAiProcessingConsent,
  getPolicy: () => readSmsSafeguardPolicyFromEnvironment(Deno.env.get),
  fixedPrompt: buildSystemPrompt(""),
  buildResponseSchema: (supportedCurrencies) =>
    JSON.stringify(buildResponseSchema(supportedCurrencies)),
  shouldExclude: (message) =>
    isExcludedBeforeSmsParsingAtEdge(message.body) ||
    isLikelyCorruptedSmsText(message.body),
  computeFingerprint: (message) =>
    computeSmsFingerprintAtEdge({
      sender: message.sender,
      body: message.body,
      receivedAtMs: Date.parse(message.date),
    }),
  computeRequestDigest: computeRequestDigestAtEdge,
  getServerNowMs: Date.now,
  resolveScanWindowStart: (input) =>
    resolveSmsScanWindowStart(createServiceClient(), input),
  getProcessingOutcomes,
  reserveWork: (input) => reserveSmsAiWork(createServiceClient(), input),
  markProviderStarted: (requestId, candidateFingerprints) =>
    markSmsAiProviderStarted(
      createServiceClient(),
      requestId,
      candidateFingerprints
    ),
  executeProvider: async (
    input: ExecuteSmsProviderInput
  ): Promise<SmsProviderExecutionResult> => {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const ai = new GoogleGenAI({ apiKey });
    const categoryTree = input.categories || CATEGORY_TREE;
    return processWithRetry(
      ai,
      input.messages,
      buildSystemPrompt(categoryTree),
      buildResponseSchema(input.supportedCurrencies),
      {
        supportedCurrencies:
          input.supportedCurrencies.length > 0
            ? input.supportedCurrencies
            : DEFAULT_CURRENCY_ENUM,
        categoryTree,
      }
    );
  },
  completeWork: (input) => completeSmsAiWork(createServiceClient(), input),
  releaseWork: (requestId, decisionCode) =>
    releaseSmsAiWork(createServiceClient(), requestId, decisionCode),
  reconcileOutcomes: (input) =>
    reconcileSmsNegativeOutcomes({
      client: createServiceClient(),
      userId: input.userId,
      submittedCandidates: input.submittedCandidates,
      envelope: {
        requestId: input.requestId,
        completionStatus: input.completionStatus,
        transactions: input.transactions,
      },
    }),
});

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    const response = await parseSmsHandler(request);
    await logSmsAiOperationalResponse("sms_full_parse", response, (...values) =>
      console.log(...values)
    );
    return response;
  } catch (error: unknown) {
    console.error("[parse-sms] Error", {
      errorType: getSafeErrorType(error),
    });
    return new Response(
      JSON.stringify({
        transactions: [],
        reason: "dependency_unavailable",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
