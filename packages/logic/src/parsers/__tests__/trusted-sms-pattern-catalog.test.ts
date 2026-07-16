import {
  activateTrustedSmsCatalog,
  createTrustedSmsCatalogIntegrityDigest,
  createTrustedSmsPatternIntegrityDigest,
  validateTrustedSmsCatalog,
} from "../trusted-sms-pattern-catalog";
import type {
  TrustedSmsCatalog,
  TrustedSmsPattern,
} from "../trusted-sms-pattern-types";
import {
  buildTrustedCatalog,
  buildTrustedPattern,
} from "./fixtures/trusted-sms/trusted-sms-builders";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";

function resignPattern(pattern: TrustedSmsPattern): TrustedSmsPattern {
  return {
    ...pattern,
    integrityDigest: createTrustedSmsPatternIntegrityDigest(pattern),
  };
}

function resignCatalog(catalog: TrustedSmsCatalog): TrustedSmsCatalog {
  return {
    ...catalog,
    integrityDigest: createTrustedSmsCatalogIntegrityDigest(catalog),
  };
}

describe("trusted SMS catalog", () => {
  it("activates the explicitly promoted QNB catalog", () => {
    const validation = validateTrustedSmsCatalog(QNB_EGYPT_TRUSTED_SMS_CATALOG);

    expect(validation).toEqual({ isValid: true, issues: [] });
    expect(QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns).toHaveLength(22);
    expect(
      QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.some(
        ({ messageFamily }) =>
          String(messageFamily) === "bank_to_wallet_transfer"
      )
    ).toBe(false);
  });
  it("accepts an enabled, review-only, trusted production catalog", () => {
    const catalog = buildTrustedCatalog();

    expect(validateTrustedSmsCatalog(catalog)).toEqual({
      isValid: true,
      issues: [],
    });
    expect(activateTrustedSmsCatalog(catalog).patterns).toHaveLength(1);
  });

  it.each([
    ["runtime_scope_invalid", { runtimeScope: "candidate" }],
    ["auto_select_policy_invalid", { autoSelectPolicy: "production_allowed" }],
    ["source_type_invalid", { sourceType: "synthetic" }],
  ])("rejects %s", (expectedCode, overrides) => {
    const pattern = resignPattern(
      buildTrustedPattern(overrides as Partial<TrustedSmsPattern>)
    );
    const result = validateTrustedSmsCatalog(
      resignCatalog(buildTrustedCatalog([pattern]))
    );

    expect(result.issues).toContainEqual({
      code: expectedCode,
      patternId: pattern.patternId,
    });
  });

  it("rejects production auto-selection through the expected outcome", () => {
    const pattern = resignPattern(
      buildTrustedPattern({
        expectedOutcome: {
          kind: "transaction",
          direction: "expense",
          reviewStatus: "auto_selected" as "needs_review",
          reviewReasons: [],
          confidenceCeiling: 0.95,
        },
      })
    );

    expect(
      validateTrustedSmsCatalog(resignCatalog(buildTrustedCatalog([pattern])))
        .issues
    ).toContainEqual({
      code: "review_policy_invalid",
      patternId: pattern.patternId,
    });
  });

  it("rejects duplicate pattern identity and version", () => {
    const pattern = buildTrustedPattern();
    const catalog = resignCatalog(buildTrustedCatalog([pattern, pattern]));

    expect(validateTrustedSmsCatalog(catalog).issues).toContainEqual({
      code: "duplicate_pattern_identity",
      patternId: pattern.patternId,
    });
  });

  it("rejects two active versions of the same pattern identity", () => {
    const first = buildTrustedPattern();
    const second = resignPattern(
      buildTrustedPattern({ patternVersion: 2, promotionId: "promotion-v2" })
    );
    const catalog = resignCatalog(buildTrustedCatalog([first, second]));

    expect(validateTrustedSmsCatalog(catalog).issues).toContainEqual({
      code: "duplicate_pattern_id",
      patternId: first.patternId,
    });
  });

  it.each([
    ["pattern_id_invalid", { patternId: "" }],
    ["pattern_version_invalid", { patternVersion: 0 }],
    ["provider_id_invalid", { providerId: "" }],
    ["sender_aliases_invalid", { verifiedSenderAliases: [] }],
    ["promotion_id_invalid", { promotionId: "" }],
  ])(
    "rejects malformed runtime identity with %s",
    (expectedCode, overrides) => {
      const pattern = resignPattern(buildTrustedPattern(overrides));

      expect(
        validateTrustedSmsCatalog(resignCatalog(buildTrustedCatalog([pattern])))
          .issues
      ).toContainEqual({ code: expectedCode, patternId: pattern.patternId });
    }
  );

  it("rejects transaction contracts without a required amount placeholder", () => {
    const pattern = resignPattern(
      buildTrustedPattern({
        segments: buildTrustedPattern().segments.filter(
          (segment) =>
            segment.kind === "fixed" ||
            segment.semanticRole !== "transaction_amount"
        ),
      })
    );

    expect(
      validateTrustedSmsCatalog(resignCatalog(buildTrustedCatalog([pattern])))
        .issues
    ).toContainEqual({
      code: "transaction_contract_invalid",
      patternId: pattern.patternId,
    });
  });

  it("rejects a rejection reason that conflicts with its message family", () => {
    const pattern = resignPattern(
      buildTrustedPattern({
        messageFamily: "otp",
        currency: null,
        expectedOutcome: { kind: "rejection", reason: "promotional" },
      })
    );

    expect(
      validateTrustedSmsCatalog(resignCatalog(buildTrustedCatalog([pattern])))
        .issues
    ).toContainEqual({
      code: "expected_outcome_invalid",
      patternId: pattern.patternId,
    });
  });

  it("rejects pattern and catalog integrity mismatches", () => {
    const pattern = buildTrustedPattern({ integrityDigest: "0".repeat(64) });
    const catalog = buildTrustedCatalog([pattern], {
      integrityDigest: "1".repeat(64),
    });

    expect(validateTrustedSmsCatalog(catalog).issues).toEqual(
      expect.arrayContaining([
        { code: "pattern_integrity_invalid", patternId: pattern.patternId },
        { code: "catalog_integrity_invalid" },
      ])
    );
  });

  it("fails closed when validation is incomplete", () => {
    const pattern = resignPattern(
      buildTrustedPattern({
        validationStatus: {
          ...buildTrustedPattern().validationStatus,
          nearMatch: "failed" as "passed",
        },
      })
    );
    const activation = activateTrustedSmsCatalog(
      resignCatalog(buildTrustedCatalog([pattern]))
    );

    expect(activation.status).toBe("invalid");
    expect(activation.patterns).toEqual([]);
  });

  it("does not activate disabled patterns", () => {
    const pattern = resignPattern(buildTrustedPattern({ enabled: false }));
    const activation = activateTrustedSmsCatalog(
      resignCatalog(buildTrustedCatalog([pattern]))
    );

    expect(activation.status).toBe("active");
    expect(activation.patterns).toEqual([]);
  });
});
