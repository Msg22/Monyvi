import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";

const mockParseSmsWithAi = jest.fn<Promise<AiParseResult>, unknown[]>();
const mockEnrichTrustedSmsCategories = jest.fn();
const mockGetAiProcessingConsentStatus = jest.fn();
const mockRevokeAiProcessingConsent = jest.fn<
  Promise<void>,
  [{ readonly expectedUserId?: string }?]
>();

jest.mock("@/services/ai-sms-parser-service", () => ({
  parseSmsWithAi: (...args: unknown[]) => mockParseSmsWithAi(...args),
  createAiConsentRequiredError: (): Error => {
    const error = new Error("AI processing consent required");
    error.name = "AiConsentRequiredError";
    return error;
  },
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): unknown =>
    mockGetAiProcessingConsentStatus(),
  revokeAiProcessingConsent: (options?: {
    readonly expectedUserId?: string;
  }): Promise<void> => mockRevokeAiProcessingConsent(options),
}));

jest.mock("@/services/ai-sms-category-enrichment-service", () => ({
  MIN_TRUSTED_CATEGORY_CONFIDENCE: 0.9,
  TRUSTED_ENRICHED_PURCHASE_CONFIDENCE: 0.98,
  enrichTrustedSmsCategories: (...args: readonly unknown[]): unknown =>
    mockEnrichTrustedSmsCategories(...args),
}));

import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  getTrustedRejectionDisposition,
  parseSmsWithOrchestrator,
} from "@/services/sms-parser-orchestrator";
import { getTransactionReviewMeta } from "@/services/transaction-review-selection";

const originalEnv = process.env;
const RECEIVED_AT_MS = new Date(2026, 3, 8, 14, 30).getTime();

const context: ParseSmsContext = {
  categories: [
    {
      id: "cat-other",
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: "cat-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: "cat-salary",
      systemName: "salary",
      displayName: "Salary",
      level: 1,
      type: "INCOME",
      isSystem: true,
    },
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(overrides: Partial<SmsCandidate> = {}): SmsCandidate {
  return {
    message: {
      id: "sms-1",
      address: "NBE",
      body: "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-1",
    ...overrides,
  };
}

function trustedPurchaseCandidate(): SmsCandidate {
  return candidate({
    message: {
      id: "sms-trusted",
      address: "QNB EGYPT",
      body: "Your Debit Card **2132 had a Successful transaction of EGP 490.00 @GEIDEAE*BASHAYER LIBAYE,your available bal.EGP10853.15 for lost/stolen card call 19700",
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-trusted",
  });
}

function trustedOtpCandidate(bodySuffix = ""): SmsCandidate {
  return candidate({
    message: {
      id: "sms-trusted-otp",
      address: "QNB EGYPT",
      body: `QNB OTP:369154 at Orange for EGP 1572 الرقم السرى مخصص لعملية الشراء اونلاين برجاء عدم الافصاح عنه${bodySuffix}`,
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-trusted-otp",
  });
}

function parsedTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 12,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "AI Shop",
    date: new Date(RECEIVED_AT_MS),
    categoryId: "cat-shopping",
    categoryDisplayName: "Shopping",
    confidence: 0.3,
    originLabel: "NBE",
    source: "SMS",
    deduplicationHash: "ai-fingerprint",
    smsFingerprint: "ai-fingerprint",
    senderDisplayName: "NBE",
    rawSmsBody: "raw",
    ...overrides,
  };
}

describe("sms-parser-orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED;
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      isConsented: true,
      userId: "user-1",
    });
    mockRevokeAiProcessingConsent.mockResolvedValue(undefined);
    mockEnrichTrustedSmsCategories.mockResolvedValue({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 0,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      hasError: false,
    });
  });

  it("routes only an exact active trusted rejection around broad prefilters", () => {
    expect(
      getTrustedRejectionDisposition(trustedOtpCandidate(), ["EGP", "USD"])
    ).toBe("route_to_hybrid");
    expect(
      getTrustedRejectionDisposition(trustedOtpCandidate(" extra"), [
        "EGP",
        "USD",
      ])
    ).toBe("not_trusted_rejection");
  });

  it("filters trusted rejections before AI when hybrid is disabled", () => {
    process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED = "false";

    expect(
      getTrustedRejectionDisposition(trustedOtpCandidate(), ["EGP", "USD"])
    ).toBe("filter_before_ai");
    expect(
      getTrustedRejectionDisposition(trustedOtpCandidate(" extra"), [
        "EGP",
        "USD",
      ])
    ).toBe("not_trusted_rejection");
  });

  it("hard-excludes candidates before either parser at the orchestrator boundary", async () => {
    const excluded = candidate({
      message: {
        id: "sms-hard-excluded",
        address: "QNB EGYPT",
        body: "ادفع الآن واحصل على عرض بقيمة EGP 250.00",
        date: RECEIVED_AT_MS,
        read: false,
      },
      smsFingerprint: "fingerprint-hard-excluded",
    });

    const result = await parseSmsWithOrchestrator([excluded], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(mockEnrichTrustedSmsCategories).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([]);
    expect(result.unresolvedCandidates).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      candidateCount: 0,
      resultCount: 0,
    });
  });

  it("routes rejection candidates through hybrid fallback when the catalog is invalid", () => {
    expect(
      getTrustedRejectionDisposition(trustedOtpCandidate(), ["EGP", "USD"], {
        status: "invalid",
        catalogVersion: null,
        patterns: [],
        issues: [{ code: "integrity_digest_mismatch" }],
      })
    ).toBe("route_to_hybrid");
  });

  it("does not bypass broad filters for unrelated SMS when the catalog is invalid", () => {
    expect(
      getTrustedRejectionDisposition(candidate(), ["EGP", "USD"], {
        status: "invalid",
        catalogVersion: null,
        patterns: [],
        issues: [{ code: "integrity_digest_mismatch" }],
      })
    ).toBe("not_trusted_rejection");
  });

  it("routes exact trusted candidates locally and sends only unresolved candidates to AI", async () => {
    const unresolved = candidate();
    const aiTransaction = parsedTransaction({
      smsFingerprint: unresolved.smsFingerprint,
      deduplicationHash: unresolved.smsFingerprint,
    });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [aiTransaction],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate(), unresolved],
      context
    );

    expect(mockParseSmsWithAi).toHaveBeenCalledWith(
      [unresolved],
      context,
      undefined,
      undefined
    );
    expect(result.transactions).toEqual([
      expect.objectContaining({
        smsFingerprint: "fingerprint-trusted",
        amount: 490,
        reviewStatus: "needs_review",
      }),
      aiTransaction,
    ]);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      attemptedAi: true,
      attemptedLocal: true,
      localMatchedCount: 1,
      aiAttemptedCount: 1,
    });
  });

  it("changes only category fields and unlocks existing auto-selection gates after confident enrichment", async () => {
    mockEnrichTrustedSmsCategories.mockResolvedValueOnce({
      outcomesByCandidateId: new Map([
        ["sms-trusted", { categorySystemName: "shopping", confidence: 0.95 }],
      ]),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 1,
      rejectedResultCount: 0,
      hasError: false,
    });
    const trusted = trustedPurchaseCandidate();

    const result = await parseSmsWithOrchestrator([trusted], context);

    expect(mockEnrichTrustedSmsCategories).toHaveBeenCalledWith(
      [
        {
          candidateId: "sms-trusted",
          merchant: "GEIDEAE*BASHAYER LIBAYE",
          transactionType: "EXPENSE",
          messageFamily: "card_purchase",
        },
      ],
      context.categories,
      undefined
    );
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([
      expect.objectContaining({
        amount: 490,
        currency: "EGP",
        counterparty: "GEIDEAE*BASHAYER LIBAYE",
        categoryId: "cat-shopping",
        categoryDisplayName: "Shopping",
        confidence: 0.95,
        reviewStatus: "auto_selectable",
        reviewReasons: [],
        smsFingerprint: "fingerprint-trusted",
      }),
    ]);

    const enriched = result.transactions[0];
    expect(
      getTransactionReviewMeta(enriched, {
        accountId: "account-1",
        matchReason: "card_last4",
      }).isAutoSelectable
    ).toBe(true);
    expect(
      getTransactionReviewMeta(enriched, {
        accountId: "default-account",
        matchReason: "default",
      }).isAutoSelectable
    ).toBe(false);
  });

  it("uses the validated visible system category when duplicate names exist", async () => {
    mockEnrichTrustedSmsCategories.mockResolvedValueOnce({
      outcomesByCandidateId: new Map([
        ["sms-trusted", { categorySystemName: "shopping", confidence: 0.95 }],
      ]),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 1,
      rejectedResultCount: 0,
      hasError: false,
    });
    const duplicateCategoryContext: ParseSmsContext = {
      ...context,
      categories: [
        ...context.categories,
        {
          id: "custom-hidden-shopping",
          systemName: "shopping",
          displayName: "Hidden custom shopping",
          level: 1,
          type: "EXPENSE",
          isSystem: false,
          isHidden: true,
        },
      ],
    };

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate()],
      duplicateCategoryContext
    );

    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        categoryId: "cat-shopping",
        categoryDisplayName: "Shopping",
        reviewStatus: "auto_selectable",
      })
    );
  });

  it("preserves the trusted local purchase when category enrichment fails", async () => {
    mockEnrichTrustedSmsCategories.mockRejectedValueOnce(
      new Error("Network request failed")
    );

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate()],
      context
    );

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([
      expect.objectContaining({
        counterparty: "GEIDEAE*BASHAYER LIBAYE",
        categoryId: "cat-other",
        confidence: 0.8,
        reviewStatus: "needs_review",
        reviewReasons: ["low_confidence"],
      }),
    ]);
  });

  it("preserves trusted local suggestions and reconciles stale remote consent", async () => {
    mockEnrichTrustedSmsCategories.mockResolvedValueOnce({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      missingResultCount: 1,
      hasError: true,
      isConsentRequired: true,
    });

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate()],
      context
    );

    expect(result.transactions).toEqual([
      expect.objectContaining({
        smsFingerprint: "fingerprint-trusted",
        categoryId: "cat-other",
        reviewStatus: "needs_review",
      }),
    ]);
    expect(mockRevokeAiProcessingConsent).toHaveBeenCalledTimes(1);
    expect(mockRevokeAiProcessingConsent).toHaveBeenCalledWith({
      expectedUserId: "user-1",
    });
  });

  it("does not delay trusted local results while stale consent is reconciled", async () => {
    mockEnrichTrustedSmsCategories.mockResolvedValueOnce({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      missingResultCount: 1,
      hasError: true,
      isConsentRequired: true,
    });
    mockRevokeAiProcessingConsent.mockReturnValueOnce(
      new Promise<void>(() => undefined)
    );

    const result = await Promise.race([
      parseSmsWithOrchestrator([trustedPurchaseCandidate()], context),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("consent reconciliation blocked")),
          50
        );
      }),
    ]);

    expect(result.transactions).toHaveLength(1);
    expect(mockRevokeAiProcessingConsent).toHaveBeenCalledTimes(1);
  });

  it("preserves trusted local suggestions when full AI fallback rejects stale consent", async () => {
    const consentError = new Error("AI processing consent required");
    consentError.name = "AiConsentRequiredError";
    mockParseSmsWithAi.mockRejectedValueOnce(consentError);

    const result = await parseSmsWithOrchestrator(
      [trustedPurchaseCandidate(), candidate()],
      context
    );

    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: "fingerprint-trusted" }),
    ]);
    expect(result).toMatchObject({ hasError: true, isRetryable: false });
    expect(result.unresolvedCandidates).toHaveLength(1);
    expect(mockRevokeAiProcessingConsent).toHaveBeenCalledTimes(1);
  });

  it("starts category enrichment and unresolved full parsing concurrently", async () => {
    let resolveCategory: ((value: unknown) => void) | undefined;
    let resolveAi: ((value: AiParseResult) => void) | undefined;
    mockEnrichTrustedSmsCategories.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCategory = resolve;
        })
    );
    mockParseSmsWithAi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAi = resolve;
        })
    );

    const parsePromise = parseSmsWithOrchestrator(
      [trustedPurchaseCandidate(), candidate()],
      context
    );
    for (let index = 0; index < 8; index++) await Promise.resolve();

    expect(mockEnrichTrustedSmsCategories).toHaveBeenCalledTimes(1);
    expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);

    resolveCategory?.({
      outcomesByCandidateId: new Map(),
      attemptedMerchantCount: 1,
      acceptedCandidateCount: 0,
      rejectedResultCount: 0,
      missingResultCount: 1,
      hasError: false,
    });
    resolveAi?.({ transactions: [], hasError: false });
    await expect(parsePromise).resolves.toMatchObject({
      diagnostics: {
        categoryEnrichmentAttemptedCount: 1,
        aiAttemptedCount: 1,
      },
    });
  });

  it("rechecks consent immediately before sending unresolved candidates to AI", async () => {
    mockGetAiProcessingConsentStatus
      .mockResolvedValueOnce({ isConsented: true })
      .mockResolvedValueOnce({ isConsented: false });

    await expect(
      parseSmsWithOrchestrator([candidate()], context)
    ).rejects.toMatchObject({ name: "AiConsentRequiredError" });

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("resolves exact trusted rejection templates without sending them to AI", async () => {
    const otp = candidate({
      message: {
        id: "sms-otp",
        address: "QNB EGYPT",
        body: "QNB OTP:369154 at Orange for EGP 1572 الرقم السرى مخصص لعملية الشراء اونلاين برجاء عدم الافصاح عنه",
        date: RECEIVED_AT_MS,
        read: false,
      },
      smsFingerprint: "fingerprint-otp",
    });

    const result = await parseSmsWithOrchestrator([otp], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      localRejectedCount: 1,
      aiAttemptedCount: 0,
    });
  });

  it("routes every candidate through existing AI behavior when hybrid is disabled", async () => {
    process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED = "false";
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: false,
    });
    const trusted = trustedPurchaseCandidate();

    const result = await parseSmsWithOrchestrator([trusted], context);

    expect(mockParseSmsWithAi).toHaveBeenCalledWith(
      [trusted],
      context,
      undefined,
      undefined
    );
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedLocal: false,
    });
  });

  it("does not invoke AI when the disabled hybrid path has no candidates", async () => {
    process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED = "false";

    const result = await parseSmsWithOrchestrator([], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedAi: false,
      candidateCount: 0,
      resultCount: 0,
    });
  });

  it("preserves AI-primary unresolved candidates when hybrid is disabled", async () => {
    process.env.EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED = "false";
    const pending = candidate();
    const unresolvedCandidate = {
      candidate: pending,
      reason: "chunk_failed" as const,
      isRetryable: true,
    };
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: [unresolvedCandidate],
    });

    const result = await parseSmsWithOrchestrator([pending], context);

    expect(result.unresolvedCandidates).toEqual([unresolvedCandidate]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses local-primary mode without calling AI when configured", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions[0]).toMatchObject({
      amount: 250,
      counterparty: "CARREFOUR CAIRO",
      smsFingerprint: "fingerprint-1",
      categoryId: "cat-shopping",
    });
    expect(result.diagnostics).toMatchObject({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
    });
  });

  it("preserves local parser review metadata for high-confidence needs-review rows", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator(
      [
        candidate({
          message: {
            id: "sms-cib",
            address: "CIB",
            body: "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
            date: RECEIVED_AT_MS,
            read: false,
          },
          smsFingerprint: "fingerprint-cib",
        }),
      ],
      context
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 1299,
      confidence: 0.94,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
    });
  });

  it("uses hybrid routing in production/default mode", async () => {
    const aiTransaction = parsedTransaction({ confidence: 0.2 });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [aiTransaction],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([aiTransaction]);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      attemptedAi: true,
      attemptedLocal: true,
    });
    expect(result.diagnostics.matchedPatternIds).toEqual([]);
  });

  it("preserves usable low-confidence AI results after local routing", async () => {
    const aiTransaction = parsedTransaction({ confidence: 0.2 });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [aiTransaction],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([aiTransaction]);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      attemptedLocal: true,
    });
  });

  it("reports defensively discarded duplicate results as a safe count", async () => {
    const duplicate = parsedTransaction();
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [duplicate, duplicate],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([duplicate]);
    expect(result.diagnostics.duplicateDiscardedCount).toBe(1);
  });

  it("preserves distinct AI transactions that originate from the same SMS", async () => {
    const purchase = parsedTransaction({
      amount: 100,
      smsFingerprint: "shared-fingerprint",
      deduplicationHash: "shared-fingerprint",
    });
    const fee = parsedTransaction({
      amount: 5,
      counterparty: "Card fee",
      smsFingerprint: "shared-fingerprint",
      deduplicationHash: "shared-fingerprint",
    });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [purchase, fee],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([purchase, fee]);
    expect(result.diagnostics.duplicateDiscardedCount).toBe(0);
  });

  it("preserves retryable unresolved candidates when AI returns an error", async () => {
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: true,
      isRetryable: true,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(true);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      attemptedAi: true,
      attemptedLocal: true,
    });
    expect(result.unresolvedCandidates).toHaveLength(1);
    expect(result.diagnostics.reasonCounts).toMatchObject({ ai_failed: 1 });
  });

  it("includes stable per-candidate AI failure reasons in safe diagnostics", async () => {
    const unresolved = candidate();
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: [
        {
          candidate: unresolved,
          reason: "chunk_failed",
          isRetryable: true,
        },
      ],
    });

    const result = await parseSmsWithOrchestrator([unresolved], context);

    expect(result.unresolvedCandidates).toEqual([
      {
        candidate: unresolved,
        reason: "chunk_failed",
        isRetryable: true,
      },
    ]);
    expect(result.diagnostics.reasonCounts).toMatchObject({ chunk_failed: 1 });
  });

  it("converts thrown AI failures into retryable hybrid partial state", async () => {
    mockParseSmsWithAi.mockRejectedValueOnce(
      new Error("Network request failed")
    );

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(true);
    expect(result.diagnostics).toMatchObject({
      mode: "hybrid",
      attemptedAi: true,
      attemptedLocal: true,
    });
    expect(result.unresolvedCandidates).toHaveLength(1);
  });

  it("preserves abort errors without fallback", async () => {
    const error = new Error("SMS parse aborted");
    error.name = "AbortError";
    mockParseSmsWithAi.mockRejectedValueOnce(error);

    await expect(parseSmsWithOrchestrator([candidate()], context)).rejects.toBe(
      error
    );
  });

  it("honors aborts before local-parser mode emits progress or transactions", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
    const abortController = new AbortController();
    const onProgress = jest.fn();
    abortController.abort();

    await expect(
      parseSmsWithOrchestrator(
        [candidate()],
        context,
        onProgress,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("honors aborts that happen during local-parser consent checks", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
    const abortController = new AbortController();
    const onProgress = jest.fn();
    mockGetAiProcessingConsentStatus.mockImplementationOnce(() => {
      abortController.abort();
      return Promise.resolve({ isConsented: true });
    });

    await expect(
      parseSmsWithOrchestrator(
        [candidate()],
        context,
        onProgress,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not expose raw payload values through diagnostics", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(JSON.stringify(result.diagnostics)).not.toContain("CARREFOUR");
    expect(JSON.stringify(result.diagnostics)).not.toContain("250");
    expect(JSON.stringify(result.diagnostics)).not.toContain("NBE");
    expect(JSON.stringify(result.diagnostics).toLowerCase()).not.toContain(
      "nbe"
    );
    expect(JSON.stringify(result.diagnostics).toLowerCase()).not.toContain(
      "debit"
    );
  });

  it("returns safe aggregate diagnostics for local-parser mode", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.diagnostics).toEqual({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
      candidateCount: 1,
      resultCount: 1,
      matchedPatternIds: [],
      runtimeScopeCounts: { dev_test: 1 },
    });
  });

  it("marks local-parser configuration failures as non-retryable", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], {
      ...context,
      categories: [],
    });

    expect(result).toMatchObject({
      transactions: [],
      hasError: true,
      isRetryable: false,
    });
    expect(result.diagnostics).toMatchObject({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
      candidateCount: 1,
      resultCount: 0,
    });
  });

  it("blocks local-parser mode when AI transaction suggestions are disabled", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      isConsented: false,
    });

    await expect(
      parseSmsWithOrchestrator([candidate()], context)
    ).rejects.toMatchObject({ name: "AiConsentRequiredError" });

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });
});
