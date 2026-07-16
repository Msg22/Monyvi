import { matchTrustedSmsTemplate } from "../packages/logic/src/parsers/trusted-sms-template-matcher";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../packages/logic/src/parsers/trusted-sms-patterns";
import type {
  TrustedSmsPattern,
  TrustedSmsPlaceholderRole,
} from "../packages/logic/src/parsers/trusted-sms-pattern-types";

const ROLE_VALUES: Readonly<Record<TrustedSmsPlaceholderRole, string>> = {
  transaction_currency: "EGP",
  transaction_amount: "125.50",
  available_balance: "5000.00",
  card_last4: "2132",
  account_reference: "7660",
  source_account_suffix: "7660",
  transaction_reference: "qa-reference",
  message_code: "123456",
  otp_code: "123456",
  merchant_name: "QA MERCHANT",
  atm_terminal: "ATM-QA",
  counterparty_person: "QA PERSON",
  phone_number: "19700",
  provider_hotline: "19700",
  transaction_date: "13/07",
  transaction_time: "12:55 PM",
  promotional_amount: "1000",
  promotional_rate: "13.5",
  campaign_year: "2026",
  public_url: "https://example.test",
  public_reference: "204899052",
};

function renderPattern(pattern: TrustedSmsPattern): string {
  return pattern.segments
    .map((segment) =>
      segment.kind === "fixed"
        ? segment.text
        : ROLE_VALUES[segment.semanticRole]
    )
    .join("");
}

function run(): void {
  const pattern = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.find(
    ({ patternId }) => patternId === "qnb-egypt-card-purchase-egp-v1"
  );
  if (pattern === undefined) throw new Error("missing_benchmark_pattern");
  const startedAt = performance.now();
  let locallyResolved = 0;

  for (let index = 0; index < 1_000; index += 1) {
    const result = matchTrustedSmsTemplate({
      candidate: {
        sender: "QNB EGYPT",
        body: renderPattern(pattern),
        receivedAtMs: 1_750_000_000_000 + index,
      },
      patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
      supportedCurrencies: ["EGP", "USD"],
    });
    if (result.status === "matched") locallyResolved += 1;
  }

  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const report = {
    catalogVersion: QNB_EGYPT_TRUSTED_SMS_CATALOG.catalogVersion,
    candidateCount: 1_000,
    locallyResolved,
    durationMs,
    budgetMs: 1_000,
    passed: locallyResolved === 1_000 && durationMs < 1_000,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.passed) process.exitCode = 1;
}

run();
