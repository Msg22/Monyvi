import {
  EGYPTIAN_FINANCIAL_INSTITUTIONS,
  type EgyptianFinancialInstitution,
  type EgyptianInstitutionType,
} from "./egyptian-bank-registry";
import type {
  LocalSmsFixture,
  LocalSmsFixtureExpectedOutcome,
  LocalSmsFixtureScenario,
} from "./local-sms-parser-types";

const BASE_RECEIVED_AT_MS = new Date(2026, 3, 8, 12, 0).getTime();
const HOUR_MS = 60 * 60 * 1000;

const BANK_SCENARIOS: readonly LocalSmsFixtureScenario[] = [
  "bank_purchase",
  "bank_transfer_in",
  "bank_transfer_out",
];
const WALLET_SCENARIOS: readonly LocalSmsFixtureScenario[] = [
  "wallet_transfer_in",
  "wallet_transfer_out",
  "wallet_cash_in",
  "wallet_cash_out",
  "wallet_bill_payment",
  "wallet_merchant_payment",
];
const EXTRA_ATM_PROVIDER_IDS = new Set([
  "nbe",
  "qnb-egypt",
  "cib",
  "banque-misr",
  "alexbank",
  "banque-du-caire",
  "hsbc-egypt",
  "credit-agricole-egypt",
  "nbk-egypt",
  "the-united-bank",
]);

const providerPublishedEvidenceNotes = [
  "Provider pages commonly confirm SMS alerts or confirmation messages, but do not publish exact full transaction bodies.",
  "These generated samples are dev/test fixtures inspired by public behavior descriptions, not trusted production templates.",
];

function normalizeFixtureId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPrimarySender(institution: EgyptianFinancialInstitution): string {
  return institution.senderPatterns[0]?.toUpperCase() ?? institution.shortName;
}

function amountFor(index: number, scenario: LocalSmsFixtureScenario): number {
  const baseByScenario: Record<LocalSmsFixtureScenario, number> = {
    bank_purchase: 100,
    bank_atm_withdrawal: 500,
    bank_transfer_in: 1200,
    bank_transfer_out: 650,
    wallet_transfer_in: 75,
    wallet_transfer_out: 90,
    wallet_cash_in: 250,
    wallet_cash_out: 180,
    wallet_bill_payment: 55,
    wallet_merchant_payment: 42,
    payment_reference: 135,
    non_transactional: 0,
  };

  return baseByScenario[scenario] + index * 7;
}

function removeUndefinedValues<T extends object>(
  value: Partial<T>
): Partial<T> {
  const result: Partial<T> = {};

  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  }

  return result;
}

function expected(
  scenario: LocalSmsFixtureScenario,
  amount: number,
  counterparty: string,
  patternId: string,
  overrides: Partial<LocalSmsFixtureExpectedOutcome> = {}
): LocalSmsFixtureExpectedOutcome {
  const isIncome =
    scenario === "bank_transfer_in" ||
    scenario === "wallet_transfer_in" ||
    scenario === "wallet_cash_in";
  const isAtmWithdrawal = scenario === "bank_atm_withdrawal";
  const hasCardHint = scenario.startsWith("bank_");

  const base: LocalSmsFixtureExpectedOutcome = {
    amount,
    currency: "EGP",
    type: isIncome ? "INCOME" : "EXPENSE",
    counterparty,
    categorySystemName: isIncome ? "salary" : "shopping",
    confidence: 0.96,
    reviewStatus: isAtmWithdrawal ? "needs_review" : "auto_selectable",
    reviewReasons: isAtmWithdrawal ? ["cash_transfer_review"] : [],
    isAtmWithdrawal: isAtmWithdrawal || undefined,
    cardLast4: hasCardHint ? "4321" : undefined,
    patternId,
  };

  return {
    ...base,
    ...removeUndefinedValues(overrides),
  };
}

function bodyFor(
  institution: EgyptianFinancialInstitution,
  sender: string,
  scenario: LocalSmsFixtureScenario,
  amount: number,
  index: number
): string {
  const merchant = `${institution.shortName} TEST MART ${index}`;
  const counterparty = `${institution.shortName} TEST USER ${index}`;

  switch (scenario) {
    case "bank_purchase":
      return `${sender}: Purchase EGP ${amount.toFixed(2)} on card **** 4321 at ${merchant} on 08/04 14:${String(index % 60).padStart(2, "0")}. Avail bal EGP 12,000.00`;
    case "bank_atm_withdrawal":
      return `${sender}: ATM cash withdrawal EGP ${amount.toFixed(2)} from card **** 4321 on 08/04/2026 15:${String(index % 60).padStart(2, "0")}. Avail bal EGP 8,000.00`;
    case "bank_transfer_in":
      return `${sender}: Credit EGP ${amount.toFixed(2)} to account **** 4321 via transfer from ${counterparty} on 08/04. New bal EGP 15,000.00`;
    case "bank_transfer_out":
      return `${sender}: Transfer EGP ${amount.toFixed(2)} from account **** 4321 to ${counterparty} on 08/04. Avail bal EGP 9,000.00`;
    case "wallet_transfer_in":
      return `${sender}: You received EGP ${amount.toFixed(2)} from 0100000${String(index).padStart(4, "0")} to your wallet. Balance EGP 900.00`;
    case "wallet_transfer_out":
      return `${sender}: You sent EGP ${amount.toFixed(2)} to 0100000${String(index).padStart(4, "0")} from your wallet. Balance EGP 750.00`;
    case "wallet_cash_in":
      return `${sender}: Cash in EGP ${amount.toFixed(2)} to your wallet at ${institution.shortName} agent. Balance EGP 1,200.00`;
    case "wallet_cash_out":
      return `${sender}: Cash out EGP ${amount.toFixed(2)} from your wallet at ${institution.shortName} agent. Balance EGP 700.00`;
    case "wallet_bill_payment":
      return `${sender}: Bill payment EGP ${amount.toFixed(2)} for TEST UTILITY from your wallet. Balance EGP 650.00`;
    case "wallet_merchant_payment":
      return `${sender}: Payment EGP ${amount.toFixed(2)} to ${merchant} from your wallet. Balance EGP 600.00`;
    case "payment_reference":
      return `${sender}: Fawry Pay reference 9${String(index).padStart(5, "0")} amount EGP ${amount.toFixed(2)} for TEST BILL. Pay before 09/04/2026`;
    case "non_transactional":
      return `${sender}: OTP 123456 for wallet payment verification. Do not share this code.`;
  }
}

function patternIdFor(scenario: LocalSmsFixtureScenario): string {
  const patternByScenario: Record<LocalSmsFixtureScenario, string> = {
    bank_purchase: "egypt-bank-card-purchase",
    bank_atm_withdrawal: "egypt-bank-atm-withdrawal",
    bank_transfer_in: "egypt-bank-transfer-in",
    bank_transfer_out: "egypt-bank-transfer-out",
    wallet_transfer_in: "egypt-wallet-transfer-in",
    wallet_transfer_out: "egypt-wallet-transfer-out",
    wallet_cash_in: "egypt-wallet-cash-in",
    wallet_cash_out: "egypt-wallet-cash-out",
    wallet_bill_payment: "egypt-wallet-bill-payment",
    wallet_merchant_payment: "egypt-wallet-merchant-payment",
    payment_reference: "fawry-payment-reference",
    non_transactional: "unsupported",
  };

  return patternByScenario[scenario];
}

function counterpartyFor(
  institution: EgyptianFinancialInstitution,
  scenario: LocalSmsFixtureScenario,
  index: number
): string {
  if (scenario === "bank_atm_withdrawal") return "ATM Withdrawal";
  if (scenario === "wallet_cash_in") return `${institution.shortName} agent`;
  if (scenario === "wallet_cash_out") return `${institution.shortName} agent`;
  if (scenario === "wallet_bill_payment") return "TEST UTILITY";
  if (scenario === "payment_reference") return "TEST BILL";
  if (scenario === "wallet_transfer_in" || scenario === "wallet_transfer_out") {
    return `0100000${String(index).padStart(4, "0")}`;
  }
  if (scenario === "bank_transfer_in" || scenario === "bank_transfer_out") {
    return `${institution.shortName} TEST USER ${index}`;
  }

  return `${institution.shortName} TEST MART ${index}`;
}

function createFixture(
  institution: EgyptianFinancialInstitution,
  scenario: LocalSmsFixtureScenario,
  index: number
): LocalSmsFixture {
  const sender = getPrimarySender(institution);
  const amount = amountFor(index, scenario);
  const patternId = patternIdFor(scenario);
  const isFinancialTransaction =
    scenario !== "payment_reference" && scenario !== "non_transactional";
  const outcome = isFinancialTransaction
    ? expected(
        scenario,
        amount,
        counterpartyFor(institution, scenario, index),
        patternId,
        {
          categorySystemName:
            scenario === "bank_atm_withdrawal" ||
            scenario === "bank_transfer_out" ||
            scenario === "wallet_transfer_out" ||
            scenario === "wallet_bill_payment" ||
            scenario === "wallet_cash_in" ||
            scenario === "wallet_cash_out"
              ? "other"
              : undefined,
          reviewStatus:
            scenario === "bank_atm_withdrawal" ||
            scenario === "bank_transfer_in" ||
            scenario === "bank_transfer_out"
              ? "needs_review"
              : undefined,
          reviewReasons:
            scenario === "bank_atm_withdrawal"
              ? ["cash_transfer_review"]
              : scenario === "bank_transfer_in" ||
                  scenario === "bank_transfer_out"
                ? ["low_confidence"]
                : undefined,
          confidence:
            scenario === "bank_transfer_in" || scenario === "bank_transfer_out"
              ? 0.94
              : undefined,
        }
      )
    : undefined;

  return {
    id: `${normalizeFixtureId(institution.id)}-${scenario}-${index}`,
    providerId: institution.id,
    providerName: institution.shortName,
    sender,
    body: bodyFor(institution, sender, scenario, amount, index),
    receivedAtMs: BASE_RECEIVED_AT_MS + index * HOUR_MS,
    sourceType: "synthetic",
    sourceConfidence: "unknown",
    scenario,
    isFinancialTransaction,
    expectedOutcome: outcome,
    notes: providerPublishedEvidenceNotes.join(" "),
  };
}

function isSelectableType(
  institution: EgyptianFinancialInstitution,
  type: EgyptianInstitutionType
): boolean {
  return institution.selectable && institution.type === type;
}

function buildBankFixtures(): readonly LocalSmsFixture[] {
  const banks = EGYPTIAN_FINANCIAL_INSTITUTIONS.filter((institution) =>
    isSelectableType(institution, "bank")
  );

  return banks.flatMap((bank, bankIndex) => {
    const scenarios = EXTRA_ATM_PROVIDER_IDS.has(bank.id)
      ? [...BANK_SCENARIOS, "bank_atm_withdrawal" as const]
      : BANK_SCENARIOS;

    return scenarios.map((scenario, scenarioIndex) =>
      createFixture(bank, scenario, bankIndex * 10 + scenarioIndex + 1)
    );
  });
}

function buildWalletFixtures(): readonly LocalSmsFixture[] {
  const wallets = EGYPTIAN_FINANCIAL_INSTITUTIONS.filter((institution) =>
    isSelectableType(institution, "wallet")
  );

  return wallets.flatMap((wallet, walletIndex) =>
    WALLET_SCENARIOS.map((scenario, scenarioIndex) =>
      createFixture(wallet, scenario, walletIndex * 10 + scenarioIndex + 200)
    )
  );
}

function buildFawryFixtures(): readonly LocalSmsFixture[] {
  const fawry: EgyptianFinancialInstitution = {
    id: "fawry",
    type: "payment",
    shortName: "Fawry",
    fullName: "Fawry",
    senderPatterns: ["fawry", "fawrypay"],
    selectable: false,
    auditStatus: "excluded",
    auditNote: "Payment reference provider used only for dev/test fixtures.",
  };

  return Array.from({ length: 8 }, (_, index) =>
    createFixture(fawry, "payment_reference", index + 300)
  );
}

function buildNegativeFixtures(): readonly LocalSmsFixture[] {
  const wallet = EGYPTIAN_FINANCIAL_INSTITUTIONS.find(
    (institution) => institution.id === "vodafone-cash"
  );
  if (!wallet) return [];

  return Array.from({ length: 8 }, (_, index) =>
    createFixture(wallet, "non_transactional", index + 400)
  );
}

export const LOCAL_SMS_FIXTURE_CORPUS: readonly LocalSmsFixture[] = [
  ...buildBankFixtures(),
  ...buildWalletFixtures(),
  ...buildFawryFixtures(),
  ...buildNegativeFixtures(),
];

export const LOCAL_SMS_FIXTURE_CORPUS_MINIMUM_SIZE = 100;
