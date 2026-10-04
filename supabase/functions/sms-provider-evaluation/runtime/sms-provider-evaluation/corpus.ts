import {
  EGYPTIAN_FINANCIAL_INSTITUTIONS,
  type EgyptianFinancialInstitution,
} from "../parsers/egyptian-bank-registry";
import {
  DEFAULT_EVALUATION_BATCH_SIZE,
  type EvaluationConfidenceExpectation,
  type EvaluationFieldExpectation,
  type EvaluationTransactionExpectation,
  type SyntheticEvaluationCase,
} from "./types";

export interface BuildSyntheticEvaluationCorpusOptions {
  readonly runId: string;
  readonly anchorMs: number;
}

export interface SyntheticEvaluationFingerprintInput {
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
}

export interface SyntheticEvaluationCorpusDependencies {
  readonly computeFingerprint: (
    input: SyntheticEvaluationFingerprintInput
  ) => Promise<string>;
}

export interface SyntheticEvaluationDatasetSummary {
  readonly caseCount: number;
  readonly providerCount: number;
  readonly requestCount: number;
}

interface SyntheticCaseSpec {
  readonly id: string;
  readonly provider: EgyptianFinancialInstitution;
  readonly sender: string;
  readonly body: string;
  readonly templateGroup: string;
  readonly holdout: boolean;
  readonly tags: readonly string[];
  readonly expected:
    | { readonly kind: "no_transaction" }
    | {
        readonly kind: "transaction";
        readonly amount: number;
        readonly currency: string;
        readonly type: "EXPENSE" | "INCOME";
        readonly counterparty: EvaluationFieldExpectation<string>;
        readonly categorySystemName: EvaluationFieldExpectation<string>;
        readonly cardLast4: EvaluationFieldExpectation<string | undefined>;
        readonly isAtmWithdrawal: boolean;
        readonly confidenceScore?: EvaluationConfidenceExpectation;
      };
}

function exact<T>(value: T): EvaluationFieldExpectation<T> {
  return { kind: "exact", value };
}

function unknown<T>(): EvaluationFieldExpectation<T> {
  return { kind: "unknown" };
}

function firstSender(provider: EgyptianFinancialInstitution): string {
  return provider.senderPatterns[0] ?? provider.shortName;
}

function dateExpectation(date: string): EvaluationFieldExpectation<string> {
  return {
    kind: "one_of",
    values: [date, date.slice(0, 10)],
  };
}

function transactionFields(
  spec: Extract<SyntheticCaseSpec["expected"], { readonly kind: "transaction" }>,
  date: string
): EvaluationTransactionExpectation {
  return {
    amount: exact(spec.amount),
    currency: exact(spec.currency),
    type: exact(spec.type),
    date: dateExpectation(date),
    counterparty: spec.counterparty,
    categorySystemName: spec.categorySystemName,
    cardLast4: spec.cardLast4,
    isTrusted: exact(true),
    isAtmWithdrawal: exact(spec.isAtmWithdrawal),
    confidenceScore: spec.confidenceScore ?? { kind: "unknown" },
  };
}

function selectableProviders(): readonly EgyptianFinancialInstitution[] {
  return EGYPTIAN_FINANCIAL_INSTITUTIONS.filter(
    (institution) => institution.selectable
  );
}

function createFloorSpecs(
  providers: readonly EgyptianFinancialInstitution[]
): SyntheticCaseSpec[] {
  const specs: SyntheticCaseSpec[] = [];
  for (const provider of providers) {
    const sender = firstSender(provider);
    specs.push({
      id: provider.id + ":positive",
      provider,
      sender,
      body: "Payment of EGP 100.00 to Supermarket completed.",
      templateGroup: "provider-floor-completed-payment-v1",
      holdout: false,
      tags: ["provider_floor", "purchase", "english"],
      expected: {
        kind: "transaction",
        amount: 100,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: { kind: "one_of", values: ["Supermarket", "supermarket"] },
        categorySystemName: exact("groceries"),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    });
    specs.push({
      id: provider.id + ":negative",
      provider,
      sender,
      body: "Your one-time password is 654321. Do not share this code.",
      templateGroup: "provider-floor-otp-v1",
      holdout: false,
      tags: ["provider_floor", "otp", "english"],
      expected: { kind: "no_transaction" },
    });

    const alias = provider.senderPatterns[1];
    if (alias !== undefined) {
      specs.push({
        id: provider.id + ":alias",
        provider,
        sender: alias,
        body: "Payment of EGP 75.00 to Supermarket completed.",
        templateGroup: "sender-alias-completed-payment-v1",
        holdout: false,
        tags: ["sender_alias", "purchase", "english"],
        expected: {
          kind: "transaction",
          amount: 75,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: {
            kind: "one_of",
            values: ["Supermarket", "supermarket"],
          },
          categorySystemName: exact("groceries"),
          cardLast4: exact(undefined),
          isAtmWithdrawal: false,
        },
      });
    }
  }
  return specs;
}

function providerAt(
  providers: readonly EgyptianFinancialInstitution[],
  index: number
): EgyptianFinancialInstitution {
  const provider = providers[index % providers.length];
  if (provider === undefined) {
    throw new Error("sms_provider_evaluation_registry_empty");
  }
  return provider;
}

function createEdgeSpecs(
  providers: readonly EgyptianFinancialInstitution[]
): SyntheticCaseSpec[] {
  const edge: SyntheticCaseSpec[] = [
    {
      id: "edge:account-only-transfer",
      provider: providerAt(providers, 0),
      sender: firstSender(providerAt(providers, 0)),
      body: "IPN transfer sent with amount of EGP 100.00 from account 1234.",
      templateGroup: "edge-account-only-transfer-v1",
      holdout: false,
      tags: ["account_only_transfer", "transfer", "english"],
      expected: {
        kind: "transaction",
        amount: 100,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: { kind: "one_of", values: ["Instapay", "InstaPay"] },
        categorySystemName: unknown<string>(),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:conflicting-card-account",
      provider: providerAt(providers, 1),
      sender: firstSender(providerAt(providers, 1)),
      body:
        "Card **4321 purchase of EGP 125.00 at Supermarket completed from account 1234.",
      templateGroup: "edge-conflicting-card-account-v1",
      holdout: false,
      tags: ["conflicting_card_account_suffix", "purchase", "card"],
      expected: {
        kind: "transaction",
        amount: 125,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: {
          kind: "one_of",
          values: ["Supermarket", "supermarket"],
        },
        categorySystemName: exact("groceries"),
        cardLast4: exact("4321"),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:leading-zero-card",
      provider: providerAt(providers, 2),
      sender: firstSender(providerAt(providers, 2)),
      body: "Card **0012 purchase of EGP 20.00 at Supermarket completed.",
      templateGroup: "edge-leading-zero-card-v1",
      holdout: false,
      tags: ["leading_zero_card", "purchase", "card"],
      expected: {
        kind: "transaction",
        amount: 20,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: {
          kind: "one_of",
          values: ["Supermarket", "supermarket"],
        },
        categorySystemName: exact("groceries"),
        cardLast4: exact("0012"),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:gateway-ambiguous",
      provider: providerAt(providers, 3),
      sender: firstSender(providerAt(providers, 3)),
      body: "Successful debit-card purchase of EGP 125.50 at myfawry.",
      templateGroup: "edge-generic-gateway-v1",
      holdout: false,
      tags: ["generic_gateway_ambiguous_category", "purchase", "gateway"],
      expected: {
        kind: "transaction",
        amount: 125.5,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: { kind: "one_of", values: ["myfawry", "MyFawry"] },
        categorySystemName: unknown<string>(),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
        confidenceScore: {
          kind: "range",
          minimum: 0.3,
          maximum: 0.6,
          rationale:
            "Product-policy heuristic for ambiguous gateway purpose; not a calibrated model probability.",
          basis: "policy_heuristic",
        },
      },
    },
    {
      id: "edge:arabic-digits",
      provider: providerAt(providers, 4),
      sender: firstSender(providerAt(providers, 4)),
      body: "تم دفع ١٬٢٣٤٫٥٠ جنيه إلى سوبر ماركت بنجاح.",
      templateGroup: "edge-arabic-digits-separators-v1",
      holdout: false,
      tags: ["arabic_digits_separators", "arabic", "purchase"],
      expected: {
        kind: "transaction",
        amount: 1234.5,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: {
          kind: "one_of",
          values: ["سوبر ماركت", "Supermarket", "supermarket"],
        },
        categorySystemName: exact("groceries"),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:foreign-currency",
      provider: providerAt(providers, 5),
      sender: firstSender(providerAt(providers, 5)),
      body: "Payment of USD 24.50 to Hotel completed.",
      templateGroup: "edge-foreign-currency-v1",
      holdout: false,
      tags: ["foreign_currency", "purchase", "english"],
      expected: {
        kind: "transaction",
        amount: 24.5,
        currency: "USD",
        type: "EXPENSE",
        counterparty: { kind: "one_of", values: ["Hotel", "hotel"] },
        categorySystemName: unknown<string>(),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:refund",
      provider: providerAt(providers, 6),
      sender: firstSender(providerAt(providers, 6)),
      body: "Refund of EGP 80.00 from Merchant credited to Card **1234.",
      templateGroup: "edge-refund-v1",
      holdout: false,
      tags: ["refund", "income", "card"],
      expected: {
        kind: "transaction",
        amount: 80,
        currency: "EGP",
        type: "INCOME",
        counterparty: { kind: "one_of", values: ["Merchant", "merchant"] },
        categorySystemName: exact("refund"),
        cardLast4: exact("1234"),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:atm",
      provider: providerAt(providers, 7),
      sender: firstSender(providerAt(providers, 7)),
      body: "ATM cash withdrawal of EGP 500.00 from Card **1234 completed.",
      templateGroup: "edge-atm-v1",
      holdout: false,
      tags: ["atm", "withdrawal", "card"],
      expected: {
        kind: "transaction",
        amount: 500,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: unknown<string>(),
        categorySystemName: unknown<string>(),
        cardLast4: exact("1234"),
        isAtmWithdrawal: true,
      },
    },
    {
      id: "edge:pending",
      provider: providerAt(providers, 8),
      sender: firstSender(providerAt(providers, 8)),
      body: "Your card purchase of EGP 90.00 is pending.",
      templateGroup: "edge-pending-v1",
      holdout: false,
      tags: ["pending_transaction", "negative"],
      expected: { kind: "no_transaction" },
    },
    {
      id: "edge:failed",
      provider: providerAt(providers, 9),
      sender: firstSender(providerAt(providers, 9)),
      body: "Your attempted payment of EGP 90.00 failed and no money was debited.",
      templateGroup: "edge-failed-v1",
      holdout: false,
      tags: ["failed_transaction", "negative"],
      expected: { kind: "no_transaction" },
    },
    {
      id: "edge:otp",
      provider: providerAt(providers, 10),
      sender: firstSender(providerAt(providers, 10)),
      body: "Use OTP 445566 to authorize your purchase. Do not share this code.",
      templateGroup: "edge-otp-v2",
      holdout: false,
      tags: ["otp", "negative"],
      expected: { kind: "no_transaction" },
    },
    {
      id: "edge:promotion",
      provider: providerAt(providers, 11),
      sender: firstSender(providerAt(providers, 11)),
      body: "Enjoy up to EGP 200 cashback when you spend this weekend.",
      templateGroup: "edge-promotion-v1",
      holdout: false,
      tags: ["promotion", "negative"],
      expected: { kind: "no_transaction" },
    },
    {
      id: "edge:duplicate-a",
      provider: providerAt(providers, 12),
      sender: firstSender(providerAt(providers, 12)),
      body: "Payment of EGP 33.00 to Supermarket completed.",
      templateGroup: "edge-duplicate-semantic-v1",
      holdout: false,
      tags: ["duplicate_semantic", "rerun_consistency", "purchase"],
      expected: {
        kind: "transaction",
        amount: 33,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: {
          kind: "one_of",
          values: ["Supermarket", "supermarket"],
        },
        categorySystemName: exact("groceries"),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "edge:duplicate-b",
      provider: providerAt(providers, 12),
      sender: firstSender(providerAt(providers, 12)),
      body: "Payment of EGP 33.00 to Supermarket completed.",
      templateGroup: "edge-duplicate-semantic-v1",
      holdout: false,
      tags: ["duplicate_semantic", "rerun_consistency", "purchase"],
      expected: {
        kind: "transaction",
        amount: 33,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: {
          kind: "one_of",
          values: ["Supermarket", "supermarket"],
        },
        categorySystemName: exact("groceries"),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
  ];

  edge.push(
    {
      id: "holdout:arabic-transfer",
      provider: providerAt(providers, 13),
      sender: firstSender(providerAt(providers, 13)),
      body: "تم استلام تحويل بقيمة ٢٥٠ جنيه عبر إنستاباي بنجاح.",
      templateGroup: "holdout-arabic-incoming-transfer-v1",
      holdout: true,
      tags: ["holdout", "arabic", "transfer"],
      expected: {
        kind: "transaction",
        amount: 250,
        currency: "EGP",
        type: "INCOME",
        counterparty: { kind: "one_of", values: ["Instapay", "InstaPay"] },
        categorySystemName: unknown<string>(),
        cardLast4: exact(undefined),
        isAtmWithdrawal: false,
      },
    },
    {
      id: "holdout:security-alert",
      provider: providerAt(providers, 14),
      sender: firstSender(providerAt(providers, 14)),
      body: "Security alert: a new device signed in to your account.",
      templateGroup: "holdout-security-alert-v1",
      holdout: true,
      tags: ["holdout", "security", "negative"],
      expected: { kind: "no_transaction" },
    }
  );

  return edge;
}

async function materializeCase(
  spec: SyntheticCaseSpec,
  runId: string,
  receivedAtMs: number,
  dependencies: SyntheticEvaluationCorpusDependencies
): Promise<SyntheticEvaluationCase> {
  const date = new Date(receivedAtMs).toISOString();
  const caseId = runId + ":" + spec.id;
  const smsFingerprint = await dependencies.computeFingerprint({
    sender: spec.sender,
    body: spec.body,
    receivedAtMs,
  });

  return {
    caseId,
    providerId: spec.provider.id,
    templateGroup: spec.templateGroup,
    source: "synthetic",
    provenance:
      "synthetic-template; sender alias derived from canonical registry; wording is not claimed authentic",
    holdout: spec.holdout,
    tags: spec.tags,
    message: {
      id: caseId,
      sender: spec.sender,
      body: spec.body,
      date,
      smsFingerprint,
    },
    expected:
      spec.expected.kind === "no_transaction"
        ? { kind: "no_transaction" }
        : {
            kind: "transaction",
            fields: transactionFields(spec.expected, date),
          },
  };
}

export function getSyntheticEvaluationDatasetSummary(): SyntheticEvaluationDatasetSummary {
  const providers = selectableProviders();
  if (providers.length === 0) {
    return { caseCount: 0, providerCount: 0, requestCount: 0 };
  }
  const specs = [...createFloorSpecs(providers), ...createEdgeSpecs(providers)];
  return {
    caseCount: specs.length,
    providerCount: providers.length,
    requestCount: Math.ceil(specs.length / DEFAULT_EVALUATION_BATCH_SIZE),
  };
}

export async function buildSyntheticEvaluationCorpus(
  options: BuildSyntheticEvaluationCorpusOptions,
  dependencies: SyntheticEvaluationCorpusDependencies
): Promise<readonly SyntheticEvaluationCase[]> {
  if (!options.runId.trim()) {
    throw new Error("sms_provider_evaluation_run_id_required");
  }
  if (!Number.isFinite(options.anchorMs)) {
    throw new Error("sms_provider_evaluation_anchor_invalid");
  }

  const providers = selectableProviders();
  if (providers.length === 0) {
    throw new Error("sms_provider_evaluation_registry_empty");
  }

  const specs = [...createFloorSpecs(providers), ...createEdgeSpecs(providers)];
  const output: SyntheticEvaluationCase[] = [];
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    if (spec === undefined) continue;
    output.push(
      await materializeCase(
        spec,
        options.runId,
        options.anchorMs - (index + 1) * 60_000,
        dependencies
      )
    );
  }
  return output;
}
