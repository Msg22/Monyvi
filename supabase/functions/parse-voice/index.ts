/**
 * parse-voice Edge Function
 *
 * Receives an audio recording (or transcribed text), processes it through
 * Gemini 2.5 Flash-Lite (native multimodal), and returns structured
 * transaction data with category assignments.
 *
 * Supports Arabic (MSA + Egyptian dialect), English, and code-switching.
 *
 * Architecture & Design Rationale:
 * - Pattern: Gateway + Retry (exponential backoff)
 * - Why: Gemini rate limits cause 429/500 errors under load.
 *   Retry with backoff absorbs transient failures without pushing
 *   complexity to the mobile client.
 * - SOLID: SRP — only handles AI interaction, no DB access.
 *
 * @module parse-voice
 */

import "edge-runtime";
import { GoogleGenAI, type ContentListUnion } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Maximum audio size in bytes (~1 minute of compressed audio). */
const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Max retries for Gemini API calls. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms). Retries: 2s, 4s, 8s. */
const BASE_RETRY_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Category tree — mirrors parse-sms L1/L2 hierarchy.
// Used as fallback when client doesn't provide one.
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORY_TREE = `
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
// Gemini response JSON schema
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript: {
      type: "string",
      description:
        "Full text interpretation of the user's voice recording. Translated to English if the user spoke in other language.",
    },
    original_transcript: {
      type: "string",
      description:
        "Original verbatim transcript of the user's voice recording in the language they spoke, without translation. If the user spoke in English, this will be the same as 'transcript'.",
    },
    detected_language: {
      type: "string",
      description:
        "ISO 639-1 language code of the primary language detected in the voice recording (e.g., 'ar' for Arabic, 'en' for English). If code-switching is detected, return the dominant language.",
    },
    transactions: {
      type: "array",
      description: "Array of extracted transactions from the voice input.",
      items: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Transaction amount as a positive number.",
          },
          type: {
            type: "string",
            description:
              "Transaction type: EXPENSE for spending, INCOME for receiving money.",
            enum: ["EXPENSE", "INCOME"],
          },
          counterparty: {
            type: ["string", "null"],
            description:
              "The counterparty name (merchant, vendor, person, or entity). Translate to English if originally in Arabic. Return null if not mentioned.",
          },
          categorySystemName: {
            type: "string",
            description:
              "Exactly ONE system_name from the category tree. Use a specific L2 ONLY when confident. If uncertain about which L2 fits, use the L1 parent instead. NEVER use *_other L2 categories — use the L1 parent. Fall back to 'other' only as last resort.",
          },
          description: {
            type: "string",
            description:
              "Short description of the transaction. Translate to English if originally in Arabic.",
          },
          accountId: {
            type: ["string", "null"],
            description:
              "The matched account ID from the provided account list. Return null if no account was mentioned or no match found. IMPORTANT: only assign an account if its currency matches the transaction's currency.",
          },
          currency: {
            type: ["string", "null"],
            description:
              "ISO 4217 currency code detected from the user's speech (e.g., 'SAR', 'EGP', 'USD'). Return null if no currency was explicitly mentioned or implied.",
          },
          date: {
            type: "string",
            description:
              "ISO 8601 date string (YYYY-MM-DD). If the user mentioned a date or time (e.g., 'yesterday', 'last Friday'), resolve it relative to today's date. If no date was mentioned, default to today's date.",
          },
          confidenceScore: {
            type: "number",
            description:
              "Your confidence in the accuracy of this extraction (0.0 to 1.0). 1.0 = all fields are perfectly clear. 0.5 = some fields required guessing.",
          },
        },
        required: [
          "amount",
          "type",
          "counterparty",
          "categorySystemName",
          "description",
          "accountId",
          "currency",
          "date",
          "confidenceScore",
        ],
      },
    },
  },
  required: [
    "transcript",
    "original_transcript",
    "detected_language",
    "transactions",
  ],
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

interface AccountInfo {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

function buildSystemPrompt(
  categoryTree: string,
  accounts: readonly AccountInfo[]
): string {
  const accountSection =
    accounts.length > 0
      ? `
AVAILABLE ACCOUNTS:
${accounts.map((a) => `  - Name: "${a.name}" (${a.currency}) → ID: "${a.id}"`).join("\n")}

ACCOUNT MATCHING:
If the user mentions an account by name (e.g., "from my CIB account"), match it to the closest account name above and return the corresponding ID in the accountId field.
If no account is mentioned or no match found, return null for accountId.

STRICT CURRENCY MATCHING (CRITICAL):
- Each account has a currency shown in parentheses.
- You MUST only assign an accountId if the currency mentioned/implied by the user matches that account's currency.
- If the user says "100 riyals from CIB" but CIB is (EGP), return accountId: null because the currencies don't match.
- If multiple accounts share a name but differ in currency, pick the one whose currency matches.
- Return the detected currency code in the "currency" field (e.g., "SAR", "EGP", "USD").
- If the user does NOT explicitly mention or imply a currency, return currency: null.
- Common currency hints: "riyals/ريال" → SAR, "dollars/دولار" → USD, "pounds/جنيه" → EGP, "dirhams/درهم" → AED, "euros/يورو" → EUR.
`
      : `
ACCOUNT MATCHING:
No accounts provided. Always return null for accountId.
Return the detected currency code in the "currency" field if mentioned, otherwise null.
`;

  return `You are Monyvi AI, a voice-to-transaction parser for an Egyptian personal finance app.

YOUR TASK:
Listen to the user's voice input (or read their transcribed text) and extract financial transactions.
The user might speak in English, Arabic (MSA or Egyptian dialect), a mix, or Franco-Arab.

Also provide a full text transcript of what the user said, translated to English.
Additionally, provide the original untranslated transcript (original_transcript) in exactly the language the user spoke.
Detect the primary language of the recording and return its ISO 639-1 code (e.g., "ar", "en") in detected_language.

PARSING RULES:
1. A user may describe one or more transactions in a single recording.
2. Amount: Extract numerical amounts. Handle spoken numbers in Arabic or English.
3. Type: EXPENSE for spending (bought, paid, etc.), INCOME for receiving (salary, gift, received, etc.).
4. Counterparty: The entity or person involved. Translate Arabic names to English where reasonable. If the user does NOT mention a merchant or counterparty, return null.
5. Category: return EXACTLY ONE system_name from the CATEGORY TREE below.
   You MUST NOT invent, combine, or modify category names.
   Valid values are ONLY the exact strings listed in the tree.
   Use a specific L2 when confident (e.g. groceries, restaurant).
   If uncertain which L2 fits, use the L1 parent (e.g. food_drinks, shopping).
   NEVER use *_other L2 categories (food_other, shopping_other, etc.) — always prefer the L1 parent.
   Only use 'other' as an absolute last resort.
6. Description: A brief English summary of the transaction.
7. Date: ALWAYS return a date in ISO 8601 format (YYYY-MM-DD). If the user mentions a date or time reference (e.g., "yesterday", "last Friday", "two days ago"), calculate the actual date relative to today's date. If no date is mentioned, default to today's date.
8. confidenceScore: your confidence in the accuracy of this extraction (0.0 to 1.0).

${accountSection}

EXAMPLES:
- "اشتريت قهوة من ستاربكس بـ ٨٠ جنيه" → { amount: 80, type: "EXPENSE", counterparty: "Starbucks", categorySystemName: "coffee_tea", description: "Coffee from Starbucks", accountId: null, date: "<today's date>", confidenceScore: 0.95 }
- "Paid 200 pounds for Uber" → { amount: 200, type: "EXPENSE", counterparty: "Uber", categorySystemName: "private_transport", description: "Uber ride", accountId: null, date: "<today's date>", confidenceScore: 0.9 }
- "I received my salary, 15000" → { amount: 15000, type: "INCOME", counterparty: "Employer", categorySystemName: "salary", description: "Monthly salary", accountId: null, date: "<today's date>", confidenceScore: 0.85 }
- "yesterday I spent 50 on groceries" → { amount: 50, type: "EXPENSE", counterparty: null, categorySystemName: "groceries", description: "Groceries", accountId: null, date: "<yesterday's date>", confidenceScore: 0.9 }
- "دفعت ١٥٠ اوبر و ٣٠٠ كارفور" (Two transactions in one recording) → [
    { amount: 150, type: "EXPENSE", counterparty: "Uber", categorySystemName: "private_transport", description: "Uber ride", accountId: null, date: "<today's date>", confidenceScore: 0.9 },
    { amount: 300, type: "EXPENSE", counterparty: "Carrefour", categorySystemName: "groceries", description: "Groceries from Carrefour", accountId: null, date: "<today's date>", confidenceScore: 0.9 }
  ]
- "last Friday I paid 500 rent from my CIB account" → { amount: 500, type: "EXPENSE", counterparty: null, categorySystemName: "rent", description: "Rent payment", accountId: "<CIB account ID>", date: "<last Friday's date>", confidenceScore: 0.85 }
- "5adet 100 gnih taxi" (Franco-Arab) → { amount: 100, type: "EXPENSE", counterparty: null, categorySystemName: "private_transport", description: "Taxi ride", accountId: null, date: "<today's date>", confidenceScore: 0.8 }
- "Someone sent me 2000 as a gift two days ago" → { amount: 2000, type: "INCOME", counterparty: null, categorySystemName: "gift_income", description: "Gift received", accountId: null, date: "<two days ago date>", confidenceScore: 0.85 }
- "I paid exactly 1250 pounds to the dentist on March 15th" → { amount: 1250, type: "EXPENSE", counterparty: "Dentist", categorySystemName: "dental", description: "Dentist visit", accountId: null, date: "2026-03-15", confidenceScore: 1.0 }

CATEGORY TREE:
${categoryTree}

ANTI-HALLUCINATION RULES (CRITICAL — YOU MUST FOLLOW THESE):
- You are STRICTLY FORBIDDEN from fabricating, inventing, or guessing transactions.
- Every transaction you return MUST correspond to something the user EXPLICITLY said in the recording.
- If the audio contains only silence, background noise, breathing, music, or non-speech sounds, you MUST return an empty transactions array.
- If the audio contains speech but NO financial information (e.g., greetings, questions, unrelated conversation), you MUST return an empty transactions array.
- If you are unsure whether the user mentioned a transaction, DO NOT include it. Err on the side of returning fewer transactions.
- NEVER generate example or placeholder transactions. Only extract what was clearly spoken.
- The transcript field should reflect ONLY what was actually said. If nothing was said, return an empty string.
- When in doubt, return { "transcript": "", "original_transcript": "", "detected_language": "en", "transactions": [] }.

ADDITIONAL RULES:
- Multiple transactions in one recording should each be a separate item in the array.
- Always provide a transcript even if no transactions are found (unless the audio is pure silence/noise).
- IMPORTANT: Return transcripts as clean, continuous PLAIN TEXT ONLY. Do NOT include ANY timestamps, speaker labels, or timing tags (e.g., "00:02", "[Speaker 1]") inside the transcript or original_transcript fields. The UI depends on these strings being clean.
`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceTransaction {
  readonly amount: number;
  readonly type: string;
  readonly counterparty: string | null;
  readonly categorySystemName: string;
  readonly description: string;
  readonly accountId: string | null;
  readonly currency: string | null;
  readonly date: string;
  readonly confidenceScore: number;
}

interface AiResponse {
  readonly transcript: string;
  readonly original_transcript: string;
  readonly detected_language: string;
  readonly transactions: ReadonlyArray<VoiceTransaction>;
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
 * Verify the JWT from the Authorization header.
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
 * Detect audio MIME type from the first bytes of the file.
 */
function detectAudioMimeType(bytes: Uint8Array): string {
  // Check for common audio file signatures
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67)
    return "audio/ogg";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  )
    return "audio/wav";
  // M4A/AAC: check for ftyp box (ISO base media file format)
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return "audio/mp4";
  // Default to webm for most mobile recordings
  return "audio/webm";
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process audio/text through Gemini with retry and exponential backoff.
 * Retries up to MAX_RETRIES times on failure (2s → 4s → 8s delays).
 */
async function processWithRetry(
  ai: GoogleGenAI,
  contents: ContentListUnion,
  systemPrompt: string
): Promise<AiResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `[parse-voice] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`
        );
        await sleep(delay);
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const text = response.text;
      if (!text) {
        // Throw so the retry/backoff loop retries the Gemini call.
        // A genuinely silent recording will still produce a transcript
        // (e.g., "[silence]") from the model — an empty string indicates
        // a transient upstream failure, not valid silence.
        throw new Error(
          "Empty model response — Gemini returned no text. Retrying."
        );
      }

      const parsed: AiResponse = JSON.parse(text);
      return {
        transcript: parsed.transcript ?? "",
        original_transcript:
          parsed.original_transcript ?? parsed.transcript ?? "",
        detected_language: parsed.detected_language ?? "en",
        transactions: parsed.transactions ?? [],
      };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = getErrorMessage(err);
      console.error("[parse-voice] Gemini attempt failed", {
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

  // All retries exhausted — propagate the failure
  const finalMsg = getErrorMessage(lastError);
  console.error("[parse-voice] All retries exhausted", {
    errorType: getSafeErrorType(lastError),
  });
  throw lastError instanceof Error ? lastError : new Error(finalMsg);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

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

    // 2. Parse input — supports both multipart form data and JSON (text query)
    const contentType = req.headers.get("content-type");
    let audioBytes: Uint8Array | null = null;
    let categoriesInput: string | null = null;
    let accountsInput: AccountInfo[] = [];
    let callerLocalDate: string | null = null;

    if (contentType?.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio");
      categoriesInput = formData.get("categories") as string | null;
      callerLocalDate = formData.get("callerLocalDate") as string | null;

      // Parse accounts from form data
      const accountsRaw = formData.get("accounts") as string | null;
      if (accountsRaw) {
        try {
          const parsed = JSON.parse(accountsRaw);
          if (Array.isArray(parsed)) {
            accountsInput = parsed.filter(
              (a: unknown): a is AccountInfo =>
                typeof a === "object" &&
                a !== null &&
                typeof (a as AccountInfo).id === "string" &&
                typeof (a as AccountInfo).name === "string" &&
                typeof (a as AccountInfo).currency === "string"
            );
          }
        } catch {
          console.warn("[parse-voice] Failed to parse accounts JSON");
        }
      }

      if (audioFile instanceof File) {
        if (audioFile.size === 0) {
          return errorResponse("Audio file is empty.", 400);
        }
        if (audioFile.size > MAX_AUDIO_SIZE_BYTES) {
          return errorResponse(
            `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024} MB.`,
            413
          );
        }
        const buffer = await audioFile.arrayBuffer();
        audioBytes = new Uint8Array(buffer);
      }
    }

    if (!audioBytes) {
      return errorResponse("Audio file is required.");
    }

    // 3. Init Gemini
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return errorResponse("GEMINI_API_KEY not configured", 500);
    }
    const ai = new GoogleGenAI({ apiKey });

    // 4. Build system prompt with dynamic category tree and accounts
    const categoryTree =
      typeof categoriesInput === "string" && categoriesInput.trim().length > 0
        ? categoriesInput
        : DEFAULT_CATEGORY_TREE;
    const systemPrompt = buildSystemPrompt(categoryTree, accountsInput);

    // 5. Build content parts

    // Resolve today's date: prefer client-supplied local date over UTC server time
    const isValidIsoLocalDate = (value: string): boolean => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
    };

    if (callerLocalDate && !isValidIsoLocalDate(callerLocalDate)) {
      return errorResponse(
        "`callerLocalDate` must be a valid YYYY-MM-DD date.",
        400
      );
    }

    const todayDate =
      callerLocalDate && isValidIsoLocalDate(callerLocalDate)
        ? callerLocalDate
        : new Date().toISOString().split("T")[0];

    // 5. Build Gemini multimodal content (audio + text prompt)
    const mimeType = detectAudioMimeType(audioBytes);
    // Encode in chunks to avoid call-stack limits on large buffers
    const CHUNK_SIZE = 8192;
    let binaryString = "";
    for (let i = 0; i < audioBytes.length; i += CHUNK_SIZE) {
      const chunk = audioBytes.subarray(i, i + CHUNK_SIZE);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Audio = btoa(binaryString);

    const contents: Array<Record<string, unknown>> = [
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      {
        text: `Parse the financial transactions from this voice recording. Today's date is ${todayDate}.`,
      },
    ];

    // 6. Call Gemini with retry
    const result = await processWithRetry(ai, contents, systemPrompt);

    console.log(
      `[parse-voice] Parsed ${result.transactions.length} transactions`
    );

    // 7. Return results (no currency — set client-side)
    return jsonResponse({
      transcript: result.transcript,
      original_transcript: result.original_transcript,
      detected_language: result.detected_language,
      transactions: result.transactions,
    });
  } catch (error: unknown) {
    console.error("[parse-voice] Error", {
      errorType: getSafeErrorType(error),
    });
    return errorResponse("Internal server error", 500);
  }
});
