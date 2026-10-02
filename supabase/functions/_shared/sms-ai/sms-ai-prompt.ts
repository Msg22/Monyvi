import { buildSmsProviderUserPromptAtEdge } from "../sms-input-estimator.ts";
import { buildSmsParserSpecialCaseRules } from "../sms-parser-special-cases.ts";
import type {
  ExecuteSmsProviderInput,
  SmsAiProviderMessage,
} from "./sms-ai-provider.ts";

export const BUILT_IN_SMS_CATEGORY_TREE = `
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

export const DEFAULT_SMS_CURRENCIES: readonly string[] = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "KWD",
];

function resolveCurrencies(currencies: readonly string[]): readonly string[] {
  return currencies.length > 0 ? currencies : DEFAULT_SMS_CURRENCIES;
}

export function buildSmsAiStableSystemPrompt(
  currencies: readonly string[]
): string {
  const supportedCurrencies = resolveCurrencies(currencies).join(", ");

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
6. Category: return EXACTLY ONE system_name from the category context.
   You MUST NOT invent, combine, or modify category names.
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

SUPPORTED CURRENCIES:
${supportedCurrencies}

BUILT-IN CATEGORY TREE:
${BUILT_IN_SMS_CATEGORY_TREE.trim()}

Handle Arabic naturally. InstaPay: تحويل الى = sent (EXPENSE), تحويل من = received (INCOME).
If the message contains "IPN transfer" and you can't extract the counterparty from the message, set counterparty to "Instapay".
`;
}

export function buildSmsAiDynamicCategoryContext(categories: string): string {
  const trimmed = categories.trim();
  if (!trimmed || trimmed === BUILT_IN_SMS_CATEGORY_TREE.trim()) {
    return "";
  }

  const builtInNames = extractSmsCategoryNames(BUILT_IN_SMS_CATEGORY_TREE);
  const requestNames = extractSmsCategoryNames(trimmed);
  if (requestNames.size === 0) {
    return `CURRENT ACCESSIBLE CATEGORY CONTEXT:
The raw request-scoped category tree below is authoritative. Choose only categories listed in it.
${trimmed}`;
  }

  const missingNames = [...builtInNames]
    .filter((name) => !requestNames.has(name))
    .sort();
  const customNames = [...requestNames]
    .filter((name) => !builtInNames.has(name))
    .sort();
  if (missingNames.length === 0 && customNames.length === 0) {
    return "";
  }

  const sections = [
    "CURRENT ACCESSIBLE CATEGORY CONTEXT:",
    missingNames.length > 0
      ? "The request-scoped list below is authoritative. Choose from the stable built-in tree above EXCEPT the names in the Not accessible list below, plus the custom categories below."
      : "The request-scoped list below is authoritative. All stable built-in categories remain accessible, plus the custom categories below.",
  ];
  if (missingNames.length > 0) {
    sections.push(
      `Not accessible in this request (do NOT choose): ${missingNames.join(", ")}`
    );
  }
  const customStructureLines = extractCustomStructureLines(
    trimmed,
    new Set(customNames)
  );
  if (customStructureLines.length > 0) {
    sections.push(
      `Additional custom categories accessible in this request:\n${customStructureLines.join("\n")}`
    );
  } else if (customNames.length > 0) {
    sections.push(
      `Additional custom categories accessible in this request: ${customNames.join(", ")}`
    );
  }
  return sections.join("\n");
}

function extractSmsCategoryNames(value: string): Set<string> {
  const names = new Set<string>();
  for (const line of value.split("\n")) {
    const match = line.match(/L[12]:\s*(.+)$/);
    if (!match) {
      continue;
    }
    for (const name of splitSmsCategoryNames(match[1])) {
      names.add(name);
    }
  }
  return names;
}

function splitSmsCategoryNames(value: string): readonly string[] {
  return value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function extractCustomStructureLines(
  categories: string,
  customNames: ReadonlySet<string>
): readonly string[] {
  const output: string[] = [];
  const state: CustomStructureState = {
    pendingHeader: null,
    parentCandidate: null,
    emittedParent: null,
  };

  for (const line of categories.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }
    if (/^(EXPENSE|INCOME)\b/i.test(trimmedLine)) {
      state.pendingHeader = trimmedLine;
      state.parentCandidate = null;
      state.emittedParent = null;
      continue;
    }
    const l1Match = line.match(/L1:\s*(.+)$/);
    if (l1Match) {
      const customInLine = customNamesInLine(l1Match[1], customNames);
      if (customInLine.length > 0) {
        appendCustomL1(output, state, customInLine);
      } else {
        state.parentCandidate = trimmedLine;
      }
      continue;
    }
    const l2Match = line.match(/L2:\s*(.+)$/);
    if (l2Match) {
      const customInLine = customNamesInLine(l2Match[1], customNames);
      if (customInLine.length > 0) {
        appendCustomL2(output, state, customInLine);
      }
    }
  }
  return output;
}

interface CustomStructureState {
  pendingHeader: string | null;
  parentCandidate: string | null;
  emittedParent: string | null;
}

function flushCustomSectionHeader(
  output: string[],
  state: CustomStructureState
): void {
  if (state.pendingHeader) {
    output.push(state.pendingHeader);
    state.pendingHeader = null;
  }
}

function customNamesInLine(
  lineBody: string,
  customNames: ReadonlySet<string>
): readonly string[] {
  return splitSmsCategoryNames(lineBody).filter((name) =>
    customNames.has(name)
  );
}

function appendCustomL1(
  output: string[],
  state: CustomStructureState,
  customInLine: readonly string[]
): void {
  flushCustomSectionHeader(output, state);
  const customL1 = `  L1: ${customInLine.join(", ")}`;
  output.push(customL1);
  state.parentCandidate = customL1;
  state.emittedParent = customL1;
}

function appendCustomL2(
  output: string[],
  state: CustomStructureState,
  customInLine: readonly string[]
): void {
  flushCustomSectionHeader(output, state);
  if (state.parentCandidate && state.parentCandidate !== state.emittedParent) {
    output.push(state.parentCandidate);
    state.emittedParent = state.parentCandidate;
  }
  output.push(`    L2: ${customInLine.join(", ")}`);
}

export function buildSmsAiResponseSchema(
  currencies: readonly string[]
): Record<string, unknown> {
  const currencyEnum = [...resolveCurrencies(currencies)];

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      transactions: {
        type: "array",
        description:
          "Array of parsed transactions. Only include CLEARLY financial transactions.",
        items: {
          type: "object",
          additionalProperties: false,
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
                "Exactly one allowed category system_name from the supplied category context.",
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
                "Confidence in the extraction accuracy from 0.0 to 1.0.",
            },
            isTrusted: {
              type: "boolean",
              description:
                "True only when this is confidently a real completed transaction.",
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

export function buildSmsAiProviderMessages(
  input: ExecuteSmsProviderInput
): readonly SmsAiProviderMessage[] {
  const messages: SmsAiProviderMessage[] = [
    {
      role: "system",
      content: buildSmsAiStableSystemPrompt(input.supportedCurrencies),
    },
  ];
  const dynamicCategories = buildSmsAiDynamicCategoryContext(input.categories);
  if (dynamicCategories) {
    messages.push({ role: "system", content: dynamicCategories });
  }
  messages.push({
    role: "user",
    content: buildSmsProviderUserPromptAtEdge(input.messages),
  });
  return messages;
}
