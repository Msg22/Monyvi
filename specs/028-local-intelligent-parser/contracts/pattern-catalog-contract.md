# Contract: Pattern Catalog

## Purpose

Define the source-controlled catalog for deterministic SMS patterns. In phase 1
the catalog is allowed to contain development/test patterns from fixtures,
synthetic examples, internet examples, or unknown sources, but that status must
be explicit in metadata.

The catalog is also the future promotion path for phase 2, where consented real
SMS examples can be sanitized, reviewed, and promoted to trusted production
patterns.

## Pattern Record

```ts
interface LocalSmsPattern {
  readonly id: string;
  readonly provider: string;
  readonly runtimeScope: PatternRuntimeScope;
  readonly sourceType: PatternSourceType;
  readonly sourceConfidence: PatternSourceConfidence;
  readonly sanitizedExampleShape: string;
  readonly matchRules: LocalSmsMatchRules;
  readonly expectedOutcome: LocalSmsExpectedOutcome;
  readonly confidence: number;
  readonly reviewExpectation: "auto_selectable" | "needs_review";
  readonly autoSelectPolicy: "dev_only" | "never" | "production_allowed";
  readonly promotionEligibility:
    | "blocked_dev_fixture"
    | "needs_trusted_provenance"
    | "ready_for_phase2_review";
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly edgeCases: readonly string[];
}

type PatternRuntimeScope = "dev_test" | "candidate" | "trusted_production";

type PatternSourceType =
  | "fixture"
  | "synthetic"
  | "internet_or_unknown"
  | "qa-real-sms"
  | "consented-user-real-sms"
  | "provider-published-example"
  | "controlled-real-transaction";

type PatternSourceConfidence = "unknown" | "low" | "medium" | "verified";
```

## Governance Rules

- Phase-1 patterns from fixture, synthetic, internet, or unknown sources are
  allowed only with `runtimeScope: dev_test`.
- Dev/test-only patterns must not be marked `trusted_production`.
- Dev/test-only patterns must not use `autoSelectPolicy: production_allowed`.
- No broad financial-keyword rule may create a transaction suggestion by itself.
  Keywords are allowed only as candidate filters or inside declared
  provider/template rules.
- Every pattern must include source type, source confidence, runtime scope,
  promotion eligibility, and at least one acceptance example.
- Sanitized examples must redact or tokenize personal identifiers.
- A new pattern must add tests for:
  - exact supported message
  - unsupported variation or non-match
  - amount/currency extraction
  - confidence and review expectation
  - metadata scope/provenance validation
  - privacy-safe diagnostics
- Production-supported patterns are out of scope for phase 1 and require phase-2
  approval.

## Supported Phase-1 Sources

Allowed for `runtimeScope: dev_test`:

1. Existing app fixtures.
2. Synthetic examples.
3. Internet examples.
4. Unknown-source examples.
5. Developer-created scenario examples.

These sources must be treated as dev/test-only even if they appear realistic.

## Future Phase-2 Trusted Sources

Potential future production promotion sources:

1. Sanitized real SMS from Mohamed's QA device.
2. Sanitized real SMS from consented trusted beta users.
3. Provider-published notification examples.
4. Controlled small-value real transactions verified against provider output.

Raw user SMS must not be committed to source control.

## Catalog Validation

Catalog tests must fail when:

- Pattern IDs duplicate.
- A dev/test source is marked production-trusted.
- A production-allowed auto-select policy is used outside `trusted_production`.
- A pattern has no acceptance example.
- A pattern fixture contains obvious unsanitized private identifiers.
- A pattern has no runtime scope, source type, source confidence, or promotion
  eligibility metadata.
