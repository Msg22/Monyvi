import type { SmsMessage } from "@monyvi/logic";

export interface QaSmsIntakeFixture extends SmsMessage {
  readonly fixtureOnly: true;
  readonly family:
    | "card_purchase"
    | "atm_withdrawal"
    | "incoming_ipn_transfer"
    | "outgoing_ipn_transfer"
    | "refund_or_reversal"
    | "failed_transaction"
    | "otp"
    | "informational"
    | "promotional";
  readonly currency: "EGP" | "USD" | null;
}

const QA_FIXTURE_DATE = Date.UTC(2026, 0, 15, 12, 0, 0);

export const QA_SMS_INTAKE_FIXTURES: readonly QaSmsIntakeFixture[] = [
  {
    id: "qa-qnb-purchase-egp",
    address: "QNB",
    body: "QA purchase using card 1111 for EGP 101.01 at QA SHOP on 15/01/2026 12:00",
    date: QA_FIXTURE_DATE,
    read: true,
    fixtureOnly: true,
    family: "card_purchase",
    currency: "EGP",
  },
  {
    id: "qa-qnb-purchase-usd",
    address: "QNB",
    body: "QA PURCHASE USD 12.34 CARD QA2222 MERCHANT QA-ONLINE DATE 15/01/2026 TIME 12:01",
    date: QA_FIXTURE_DATE + 60_000,
    read: true,
    fixtureOnly: true,
    family: "card_purchase",
    currency: "USD",
  },
  {
    id: "qa-qnb-atm-egp",
    address: "QNB",
    body: "QA ATM WITHDRAWAL EGP 202.02 CARD QA3333 TERMINAL QA-ATM-01 DATE 15/01/2026 TIME 12:02",
    date: QA_FIXTURE_DATE + 120_000,
    read: true,
    fixtureOnly: true,
    family: "atm_withdrawal",
    currency: "EGP",
  },
  {
    id: "qa-qnb-transfer-in-egp",
    address: "QNB",
    body: "QA INCOMING IPN EGP 303.03 ACCOUNT QA4444 REFERENCE QA-REF-IN DATE 15/01/2026 TIME 12:03",
    date: QA_FIXTURE_DATE + 180_000,
    read: true,
    fixtureOnly: true,
    family: "incoming_ipn_transfer",
    currency: "EGP",
  },
  {
    id: "qa-qnb-transfer-out-usd",
    address: "QNB",
    body: "QA OUTGOING IPN USD 45.67 ACCOUNT QA5555 REFERENCE QA-REF-OUT DATE 15/01/2026 TIME 12:04",
    date: QA_FIXTURE_DATE + 240_000,
    read: true,
    fixtureOnly: true,
    family: "outgoing_ipn_transfer",
    currency: "USD",
  },
  {
    id: "qa-qnb-refund-egp",
    address: "QNB",
    body: "QA REFUND EGP 56.78 CARD QA6666 MERCHANT QA-STORE REFERENCE QA-REFUND DATE 15/01/2026 TIME 12:05",
    date: QA_FIXTURE_DATE + 300_000,
    read: true,
    fixtureOnly: true,
    family: "refund_or_reversal",
    currency: "EGP",
  },
  {
    id: "qa-qnb-failed-egp",
    address: "QNB",
    body: "QA FAILED TRANSACTION EGP 67.89 CARD QA7777 MERCHANT QA-DECLINED DATE 15/01/2026 TIME 12:06",
    date: QA_FIXTURE_DATE + 360_000,
    read: true,
    fixtureOnly: true,
    family: "failed_transaction",
    currency: "EGP",
  },
  {
    id: "qa-qnb-otp",
    address: "QNB",
    body: "QA OTP CODE QA909090 VALID FOR QA-MINUTES",
    date: QA_FIXTURE_DATE + 420_000,
    read: true,
    fixtureOnly: true,
    family: "otp",
    currency: null,
  },
  {
    id: "qa-qnb-informational",
    address: "QNB",
    body: "QA INFORMATIONAL NOTICE FOR QA-ONLY SERVICE",
    date: QA_FIXTURE_DATE + 480_000,
    read: true,
    fixtureOnly: true,
    family: "informational",
    currency: null,
  },
  {
    id: "qa-qnb-promotional",
    address: "QNB",
    body: "QA PROMOTIONAL OFFER FOR QA-ONLY CARD",
    date: QA_FIXTURE_DATE + 540_000,
    read: true,
    fixtureOnly: true,
    family: "promotional",
    currency: null,
  },
] as const;
