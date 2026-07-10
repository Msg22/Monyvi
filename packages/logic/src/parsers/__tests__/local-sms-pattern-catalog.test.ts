import {
  LOCAL_SMS_PATTERNS,
  validateLocalSmsPatternCatalog,
  type LocalSmsPattern,
} from "../local-sms-pattern-catalog";

describe("local SMS pattern catalog", () => {
  const supportedSourceConfidence = ["unknown", "low", "medium", "verified"];
  const supportedAutoSelectPolicies = [
    "dev_only",
    "never",
    "production_allowed",
  ];
  const supportedPromotionEligibility = [
    "blocked_dev_fixture",
    "needs_trusted_provenance",
    "ready_for_phase2_review",
  ];

  it("keeps the default catalog valid", () => {
    expect(validateLocalSmsPatternCatalog()).toEqual({
      isValid: true,
      errors: [],
    });
  });

  it("marks every phase-1 pattern with explicit dev/test provenance metadata", () => {
    for (const pattern of LOCAL_SMS_PATTERNS) {
      expect(pattern.runtimeScope).toBe("dev_test");
      expect(supportedSourceConfidence).toContain(pattern.sourceConfidence);
      expect(supportedAutoSelectPolicies).toContain(pattern.autoSelectPolicy);
      expect(supportedPromotionEligibility).toContain(
        pattern.promotionEligibility
      );
      expect(pattern.acceptanceExamples.length).toBeGreaterThan(0);
      expect(pattern.sanitizedExampleShape).not.toMatch(/MOHAMED SAMIR/i);
      expect(pattern.acceptanceExamples.join("\n")).not.toMatch(
        /MOHAMED SAMIR/i
      );
    }
  });

  it("rejects duplicate pattern ids", () => {
    const duplicate: readonly LocalSmsPattern[] = [
      LOCAL_SMS_PATTERNS[0],
      LOCAL_SMS_PATTERNS[0],
    ];

    const result = validateLocalSmsPatternCatalog(duplicate);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "Duplicate local SMS pattern id"
    );
  });

  it("rejects patterns without acceptance examples", () => {
    const invalid: readonly LocalSmsPattern[] = [
      { ...LOCAL_SMS_PATTERNS[0], acceptanceExamples: [] },
    ];

    const result = validateLocalSmsPatternCatalog(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "must include acceptance examples"
    );
  });

  it("rejects dev/test source patterns outside dev_test scope", () => {
    const invalid: readonly LocalSmsPattern[] = [
      {
        ...LOCAL_SMS_PATTERNS[0],
        runtimeScope: "candidate",
      },
    ];

    const result = validateLocalSmsPatternCatalog(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "dev/test source must use dev_test scope"
    );
  });

  it("rejects production auto-select policy outside trusted production scope", () => {
    const invalid: readonly LocalSmsPattern[] = [
      {
        ...LOCAL_SMS_PATTERNS[0],
        autoSelectPolicy: "production_allowed",
      },
    ];

    const result = validateLocalSmsPatternCatalog(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain("production auto-select policy");
  });

  it("rejects trusted production patterns without trusted verified provenance", () => {
    const invalid: readonly LocalSmsPattern[] = [
      {
        ...LOCAL_SMS_PATTERNS[0],
        runtimeScope: "trusted_production",
        sourceType: "fixture",
        sourceConfidence: "unknown",
        autoSelectPolicy: "production_allowed",
      },
    ];

    const result = validateLocalSmsPatternCatalog(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain("trusted production pattern");
  });

  it("rejects unsafe auto-selectable patterns", () => {
    const invalid: readonly LocalSmsPattern[] = [
      {
        ...LOCAL_SMS_PATTERNS[0],
        confidence: 0.7,
        reviewReasons: ["low_confidence"],
      },
    ];

    const result = validateLocalSmsPatternCatalog(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors.join("\n")).toContain("cannot be auto-selectable");
  });
});
