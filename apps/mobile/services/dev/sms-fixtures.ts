/**
 * Deterministic SMS fixtures for development tools and E2E fixture mode.
 *
 * Each fixture is a realistic financial (or non-financial) SMS body used by
 * the SMS simulator and by the guarded E2E fixture parser/reader. Production
 * behavior must stay on the real SMS reader and Edge parser unless explicit
 * E2E mode is enabled.
 *
 * @module services/dev/sms-fixtures
 */

import type { CurrencyType, TransactionType } from "@monyvi/db";

export type SmsFixtureParserFailure =
  | "retryable"
  | "retryable_once"
  | "permanent";

export interface SmsFixtureParsedTransaction {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly counterparty: string;
  readonly categorySystemName: string;
  readonly date: string;
  readonly confidenceScore: number;
  readonly isTrusted: boolean;
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
}

export interface SmsFixture {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sender: string;
  readonly body: string;
  readonly timestamp?: number;
  readonly expectedTransactions?: readonly SmsFixtureParsedTransaction[];
  readonly parserFailure?: SmsFixtureParserFailure;
}

const APRIL_8_2026_14_23 = 1775658180000;
const APRIL_8_2026_15_02 = 1775660520000;
const APRIL_8_2026_16_10 = 1775664600000;
const APRIL_8_2026_16_20 = 1775665200000;
const APRIL_8_2026_17_01 = 1775667660000;
const APRIL_8_2026_17_12 = 1775668320000;
const APRIL_8_2026_17_10 = 1775668200000;
const APRIL_8_2026_17_20 = 1775668800000;

export const SMS_FIXTURES: readonly SmsFixture[] = [
  {
    id: "hybrid_ai_purchase",
    label: "Hybrid E2E - AI fallback purchase",
    description: "Unknown-provider transaction resolved by fixture AI",
    sender: "NBE",
    body: "Purchase EGP 55.55 on card **** 4321 at HYBRID AI MARKET on 08/04 17:20. Avail bal EGP 12,374.99",
    timestamp: APRIL_8_2026_17_20,
    expectedTransactions: [
      {
        amount: 55.55,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "HYBRID AI MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T15:20:00.000Z",
        confidenceScore: 0.96,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "hybrid_retryable_once",
    label: "Hybrid E2E - retryable AI purchase",
    description: "Fails once so partial-result retry can be verified",
    sender: "NBE",
    body: "Purchase EGP 44.44 on card **** 4321 at HYBRID RETRY MARKET on 08/04 17:10. Avail bal EGP 12,330.55",
    timestamp: APRIL_8_2026_17_10,
    parserFailure: "retryable_once",
    expectedTransactions: [
      {
        amount: 44.44,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "HYBRID RETRY MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T15:10:00.000Z",
        confidenceScore: 0.96,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "hybrid_trusted_qnb_purchase",
    label: "Hybrid E2E - trusted QNB purchase",
    description: "Exact approved template resolved by the trusted matcher",
    sender: "QNB EGYPT",
    body: "Your Debit Card **2132 had a Successful transaction of EGP 16.79 @myfawry,your available bal.EGP 59900.84 for lost/stolen card call 19700",
    timestamp: APRIL_8_2026_17_01,
  },
  {
    id: "nbe_debit_purchase",
    label: "NBE — Debit purchase (EGP)",
    description: "Standard NBE debit card purchase, happy path",
    sender: "NBE",
    body: "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
    timestamp: APRIL_8_2026_14_23,
    expectedTransactions: [
      {
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "CARREFOUR CAIRO",
        categorySystemName: "shopping",
        date: "2026-04-08T12:23:00.000Z",
        confidenceScore: 0.96,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "cib_credit_payment",
    label: "CIB — Credit card payment",
    description: "CIB credit card charge",
    sender: "CIB",
    body: "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
    timestamp: 1775659200000,
    expectedTransactions: [
      {
        amount: 1299,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "AMAZON.EG",
        categorySystemName: "shopping",
        date: "2026-04-08T12:40:00.000Z",
        confidenceScore: 0.94,
        isTrusted: true,
        cardLast4: "9988",
      },
    ],
  },
  {
    id: "qnb_atm_withdrawal",
    label: "QNB — ATM withdrawal",
    description: "Exercises the ATM transfer branch in detection-handler",
    sender: "QNB",
    body: "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
    timestamp: APRIL_8_2026_15_02,
    expectedTransactions: [
      {
        amount: 2000,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "QNB ATM",
        categorySystemName: "other",
        date: "2026-04-08T13:02:00.000Z",
        confidenceScore: 0.97,
        isTrusted: true,
        isAtmWithdrawal: true,
        cardLast4: "5566",
      },
    ],
  },
  {
    id: "pr622_batch_duplicate_shop",
    label: "NBE - PR622 duplicate batch purchase",
    description:
      "Fixture inbox SMS used by batch SMS sync duplicate-fingerprint E2E",
    sender: "NBE",
    body: "Purchase EGP 33.33 on card **** 4321 at PR622 BATCH DUPLICATE SHOP on 08/04 17:01. Avail bal EGP 12,397.22",
    timestamp: APRIL_8_2026_17_01,
    expectedTransactions: [
      {
        amount: 33.33,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "PR622 BATCH DUPLICATE SHOP",
        categorySystemName: "shopping",
        date: "2026-04-08T15:01:00.000Z",
        confidenceScore: 0.97,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "nbe_transfer_in",
    label: "NBE — Incoming transfer",
    description: "Income path",
    sender: "NBE",
    body: "NBE: Credit EGP 15,000.00 to your account **** 4321 via transfer from MOHAMED SAMIR on 08/04. New bal EGP 27,430.55",
    timestamp: 1775661000000,
    expectedTransactions: [
      {
        amount: 15000,
        currency: "EGP",
        type: "INCOME",
        counterparty: "MOHAMED SAMIR",
        categorySystemName: "salary",
        date: "2026-04-08T13:10:00.000Z",
        confidenceScore: 0.93,
        isTrusted: true,
      },
    ],
  },
  {
    id: "usd_purchase",
    label: "CIB — USD purchase",
    description: "Multi-currency path",
    sender: "CIB",
    body: "CIB: USD 49.99 charged on your card **** 9988 at NETFLIX.COM on 08-APR-2026",
    timestamp: 1775662200000,
    expectedTransactions: [
      {
        amount: 49.99,
        currency: "USD",
        type: "EXPENSE",
        counterparty: "NETFLIX.COM",
        categorySystemName: "shopping",
        date: "2026-04-08T13:30:00.000Z",
        confidenceScore: 0.91,
        isTrusted: true,
        cardLast4: "9988",
      },
    ],
  },
  {
    id: "card_last4_match",
    label: "Card-last-4 matcher",
    description:
      "Forces the card-last-4 resolution branch in sms-account-matcher",
    sender: "NBE",
    body: "Purchase EGP 75.00 on card **** 1234 at STARBUCKS MAADI on 08/04 09:15. Avail bal EGP 5,200.00",
    timestamp: 1775632500000,
    expectedTransactions: [
      {
        amount: 75,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "STARBUCKS MAADI",
        categorySystemName: "shopping",
        date: "2026-04-08T07:15:00.000Z",
        confidenceScore: 0.95,
        isTrusted: true,
        cardLast4: "1234",
      },
    ],
  },
  {
    id: "confirm_action_probe",
    label: "Confirm action probe",
    description: "Unique merchant used by E2E notification confirm tests",
    sender: "NBE",
    body: "Purchase EGP 91.23 on card **** 4321 at CONFIRM ACTION MARKET on 08/04 16:10. Avail bal EGP 12,339.32",
    timestamp: APRIL_8_2026_16_10,
    expectedTransactions: [
      {
        amount: 91.23,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "CONFIRM ACTION MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T14:10:00.000Z",
        confidenceScore: 0.98,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "discard_action_probe",
    label: "Discard action probe",
    description: "Unique merchant used by E2E notification discard tests",
    sender: "NBE",
    body: "Purchase EGP 82.34 on card **** 4321 at DISCARD ACTION MARKET on 08/04 16:20. Avail bal EGP 12,256.98",
    timestamp: APRIL_8_2026_16_20,
    expectedTransactions: [
      {
        amount: 82.34,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "DISCARD ACTION MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T14:20:00.000Z",
        confidenceScore: 0.98,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "non_financial_spam",
    label: "Non-financial spam (should be filtered)",
    description: "Expected to be dropped by isLikelyFinancialSms",
    sender: "VODAFONE",
    body: "Your Vodafone data bundle will expire in 2 days. Renew now by dialing *888#",
    timestamp: 1775665800000,
  },
  {
    id: "duplicate_of_nbe_debit",
    label: "Duplicate of NBE debit (dedup test)",
    description:
      "Identical body to nbe_debit_purchase; second inject should be deduped",
    sender: "NBE",
    body: "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
    timestamp: APRIL_8_2026_14_23,
    expectedTransactions: [
      {
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "CARREFOUR CAIRO",
        categorySystemName: "shopping",
        date: "2026-04-08T12:23:00.000Z",
        confidenceScore: 0.96,
        isTrusted: true,
        cardLast4: "4321",
      },
    ],
  },
  {
    id: "multi_transaction_fee",
    label: "NBE - Multi-transaction SMS",
    description: "One body that parses into a purchase and a fee",
    sender: "NBE",
    body: "Purchase EGP 850 at Hyper Market using card ending 1234. Fee EGP 7.25 for DOUBLE CONFIRM TEST.",
    timestamp: 1775666400000,
    expectedTransactions: [
      {
        amount: 850,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "Hyper Market",
        categorySystemName: "shopping",
        date: "2026-04-08T14:40:00.000Z",
        confidenceScore: 0.94,
        isTrusted: true,
        cardLast4: "1234",
      },
      {
        amount: 7.25,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "DOUBLE CONFIRM TEST",
        categorySystemName: "bank_fees",
        date: "2026-04-08T14:40:00.000Z",
        confidenceScore: 0.89,
        isTrusted: true,
        cardLast4: "1234",
      },
    ],
  },
  {
    id: "untrusted_offer",
    label: "Untrusted offer",
    description: "Parser returns an untrusted financial-looking offer",
    sender: "NBE",
    body: "NBE offer: spend EGP 500 and get points this weekend.",
    timestamp: 1775667000000,
    expectedTransactions: [
      {
        amount: 500,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "NBE offer",
        categorySystemName: "shopping",
        date: "2026-04-08T14:50:00.000Z",
        confidenceScore: 0.3,
        isTrusted: false,
      },
    ],
  },
  {
    id: "retryable_ai_failure",
    label: "Retryable parser failure",
    description: "Fixture parser simulates a temporary AI/service failure",
    sender: "NBE",
    body: "TEMPORARY AI FAILURE FIXTURE",
    timestamp: 1775667600000,
    parserFailure: "retryable",
  },
  {
    id: "permanent_ai_failure",
    label: "Permanent parser failure",
    description: "Fixture parser simulates a permanent parser/config failure",
    sender: "NBE",
    body: "PERMANENT AI FAILURE FIXTURE",
    timestamp: 1775668200000,
    parserFailure: "permanent",
  },
  {
    id: "background_live_sms_test",
    label: "Background live SMS test",
    description: "Real emulator SMS used by background notification journey",
    sender: "QNB",
    body: "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234",
    timestamp: 1775668800000,
    expectedTransactions: [
      {
        amount: 63.21,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "BACKGROUND LIVE SMS TEST",
        categorySystemName: "shopping",
        date: "2026-04-08T15:00:00.000Z",
        confidenceScore: 0.95,
        isTrusted: true,
        cardLast4: "1234",
      },
    ],
  },
  {
    id: "foreground_live_sms_test",
    label: "Foreground live SMS test",
    description: "Real emulator SMS used by foreground live detection journey",
    sender: "QNB",
    body: "Purchase EGP 64.32 at FOREGROUND LIVE SMS TEST using card ending 5566",
    timestamp: APRIL_8_2026_17_12,
    expectedTransactions: [
      {
        amount: 64.32,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "FOREGROUND LIVE SMS TEST",
        categorySystemName: "shopping",
        date: "2026-04-08T15:12:00.000Z",
        confidenceScore: 0.95,
        isTrusted: true,
        cardLast4: "5566",
      },
    ],
  },
  {
    id: "background_confirm_market",
    label: "Background confirm market",
    description: "Real emulator SMS used by background Confirm journey",
    sender: "QNB",
    body: "Purchase EGP 71.45 at BACKGROUND CONFIRM MARKET using card ending 1234",
    timestamp: 1775669400000,
    expectedTransactions: [
      {
        amount: 71.45,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "BACKGROUND CONFIRM MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T15:10:00.000Z",
        confidenceScore: 0.95,
        isTrusted: true,
        cardLast4: "1234",
      },
    ],
  },
  {
    id: "closed_confirm_market",
    label: "Closed app confirm market",
    description: "Real emulator SMS used by killed-app Confirm journey",
    sender: "QNB",
    body: "Purchase EGP 72.56 at CLOSED CONFIRM MARKET using card ending 1234",
    timestamp: 1775670000000,
    expectedTransactions: [
      {
        amount: 72.56,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "CLOSED CONFIRM MARKET",
        categorySystemName: "shopping",
        date: "2026-04-08T15:20:00.000Z",
        confidenceScore: 0.95,
        isTrusted: true,
        cardLast4: "1234",
      },
    ],
  },
];

export function getFixtureById(id: string): SmsFixture | null {
  return SMS_FIXTURES.find((f) => f.id === id) ?? null;
}
