import type { CategoryTreeSource } from "@monyvi/logic";
import type {
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";
import { getFixtureById } from "@/services/dev/sms-fixtures";
import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";
import { resetFixtureAiParserStateForTests } from "@/services/testing/ai-sms-fixture-parser";

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{ readonly isConsented: true }> =>
    Promise.resolve({ isConsented: true }),
}));

const originalEnv = process.env;

function category(
  systemName: string,
  displayName: string,
  type: CategoryTreeSource["type"]
): CategoryTreeSource {
  return {
    id: `category-${systemName}`,
    systemName,
    displayName,
    level: 1,
    type,
  };
}

const context: ParseSmsContext = {
  categories: [
    category("other", "Other", "EXPENSE"),
    category("shopping", "Shopping", "EXPENSE"),
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidateFromFixture(fixtureId: string): SmsCandidate {
  const fixture = getFixtureById(fixtureId);
  if (!fixture || fixture.timestamp === undefined) {
    throw new Error(`Missing timestamped fixture ${fixtureId}`);
  }

  return {
    message: {
      id: fixture.id,
      address: fixture.sender,
      body: fixture.body,
      date: fixture.timestamp,
      read: false,
    },
    smsFingerprint: `fingerprint-${fixture.id}`,
  };
}

describe("hybrid fixture parser integration", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      EXPO_PUBLIC_MONYVI_TEST_MODE: "e2e",
      EXPO_PUBLIC_AI_SMS_PARSER_MODE: "hybrid-fixture",
    };
    resetFixtureAiParserStateForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("preserves local and AI results, then retries only the failed candidate", async () => {
    const trusted = candidateFromFixture("hybrid_trusted_qnb_purchase");
    const aiSuccess = candidateFromFixture("hybrid_ai_purchase");
    const retryable = candidateFromFixture("hybrid_retryable_once");

    const first = await parseSmsWithOrchestrator(
      [trusted, aiSuccess, retryable],
      context
    );

    expect(first.transactions).toEqual([
      expect.objectContaining({
        smsFingerprint: trusted.smsFingerprint,
        amount: 16.79,
        reviewStatus: "needs_review",
      }),
      expect.objectContaining({
        smsFingerprint: aiSuccess.smsFingerprint,
        amount: 55.55,
      }),
    ]);
    expect(first.unresolvedCandidates).toEqual([
      {
        candidate: retryable,
        reason: "chunk_failed",
        isRetryable: true,
      },
    ]);
    expect(first.diagnostics).toMatchObject({
      mode: "hybrid",
      localMatchedCount: 1,
      aiAttemptedCount: 2,
      aiMatchedCount: 1,
      unresolvedCount: 1,
    });

    const retry = await parseSmsWithOrchestrator([retryable], context);

    expect(retry.transactions).toEqual([
      expect.objectContaining({
        smsFingerprint: retryable.smsFingerprint,
        amount: 44.44,
      }),
    ]);
    expect(retry.unresolvedCandidates).toEqual([]);
  });
});
