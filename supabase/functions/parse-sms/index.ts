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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

interface SmsInput {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string;
}

interface ParseSmsRequest {
  readonly messages: ReadonlyArray<SmsInput>;
  readonly categories?: string;
  readonly supportedCurrencies?: ReadonlyArray<string>;
}

interface AiTransaction {
  readonly messageId: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: string;
  readonly counterparty: string;
  readonly date: string;
  readonly categorySystemName: string;
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly confidenceScore: number;
  readonly isTrusted: boolean;
}

interface AiResponse {
  readonly transactions: ReadonlyArray<AiTransaction>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message, code: status }, status);
}

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) return null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return { userId: data.user.id };
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
async function processWithRetry(
  ai: GoogleGenAI,
  messages: ReadonlyArray<SmsInput>,
  systemPrompt: string,
  responseSchema: Record<string, unknown>
): Promise<AiResponse> {
  const userPrompt = `Parse the following ${messages.length} SMS messages into transactions:

${messages
  .map(
    (m) =>
      `--- MESSAGE ID: ${m.id} ---
Sender: ${m.sender}
Date: ${m.date}
Body: ${m.body}
`
  )
  .join("\n")}`;

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

      const text = response.text ?? "";
      if (!text) return { transactions: [] };

      const parsed: AiResponse = JSON.parse(text);
      return {
        transactions: parsed.transactions ?? [],
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
  return { transactions: [] };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // 1. Auth
    const auth = await verifyAuth(req.headers.get("authorization"));
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }
    if (!(await hasActiveAiProcessingConsent(auth.userId))) {
      return errorResponse("AI processing consent required", 403);
    }

    // 2. Parse input
    const body: ParseSmsRequest = await req.json();
    if (!body.messages || !Array.isArray(body.messages)) {
      return errorResponse("'messages' array is required");
    }
    if (body.messages.length === 0) {
      return jsonResponse({ transactions: [] });
    }

    const processableMessages = body.messages.filter(
      (message) =>
        !isExcludedBeforeSmsParsingAtEdge(message.body) &&
        !isLikelyCorruptedSmsText(message.body)
    );
    const hardExcludedMessageCount = body.messages.filter((message) =>
      isExcludedBeforeSmsParsingAtEdge(message.body)
    ).length;
    const corruptedMessageCount =
      body.messages.length -
      hardExcludedMessageCount -
      processableMessages.length;

    if (hardExcludedMessageCount > 0) {
      console.info("[parse-sms] Skipped hard-excluded SMS input", {
        hardExcludedMessageCount,
      });
    }

    if (corruptedMessageCount > 0) {
      console.warn("[parse-sms] Skipped corrupted SMS input", {
        corruptedMessageCount,
      });
    }

    if (processableMessages.length === 0) {
      return jsonResponse({ transactions: [] });
    }

    // 3. Init Gemini
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return errorResponse("GEMINI_API_KEY not configured", 500);
    }
    const ai = new GoogleGenAI({ apiKey });

    // 4. Build dynamic schema and prompt from client context.
    const categoryTree = body.categories ?? CATEGORY_TREE;
    const currencies = body.supportedCurrencies ?? [];
    const responseSchema = buildResponseSchema(currencies);
    const systemPrompt = buildSystemPrompt(categoryTree);

    // 5. Process all messages in a single Gemini call (with retry).
    //    Client-side chunking ensures each call stays under the ~150s limit.
    const result = await processWithRetry(
      ai,
      processableMessages,
      systemPrompt,
      responseSchema
    );

    console.log(
      `[parse-sms] Parsed ${result.transactions.length} transactions from ${processableMessages.length} messages`
    );

    // 6. Return results
    return jsonResponse({
      transactions: result.transactions,
    });
  } catch (error: unknown) {
    console.error("[parse-sms] Error", {
      errorType: getSafeErrorType(error),
    });
    return errorResponse("Internal server error", 500);
  }
});
