/**
 * #395 T046 unshipped review-only immutable intent digest: WIRE RED.
 * This suite deliberately imports ONLY EXISTING strict schema/registry APIs.
 * The old review payload currently passes without a digest; that is the
 * intended first Red, not an import/harness failure.
 */
import { canonicalizeFinancialActionEnvelope } from "../action-contracts";
import {
  createFinancialActionRegistry,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
} from "../action-registry";
import { reviewBatchSaveWireSchema } from "../review-batch-save-shapes";
import {
  createReviewFinancialActionDefinitions,
  validateReviewBatchSavePayload,
} from "../review-batch-save";
import {
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";

const VALID_DIGEST = "ab".repeat(32);
const reviewRegistry = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(
    "review_batch_save_invalid_payload"
  ),
]);

function completeReviewPayload(): typeof reviewBatchSavePayload {
  return { ...reviewBatchSavePayload, frozenIntentDigest: VALID_DIGEST };
}

function withoutFrozenIntentDigest(): Omit<
  typeof reviewBatchSavePayload, "frozenIntentDigest"
> {
  const { frozenIntentDigest: _required, ...without } = reviewBatchSavePayload;
  return without;
}

describe("#395 unshipped review.batch-save/v1 required frozenIntentDigest wire", () => {
  it("rejects the previously valid review payload when its required digest is absent", () => {
    const missingDigest = withoutFrozenIntentDigest();
    expect(
      reviewBatchSaveWireSchema.safeParse(missingDigest).success
    ).toBe(false);
    expect(() =>
      validateReviewBatchSavePayload(missingDigest)
    ).toThrow();
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        { ...reviewBatchSaveEnvelope, payload: missingDigest },
        reviewRegistry
      )
    ).toThrow();
  });

  it("accepts exactly one lowercase 64-hex digest through schema, registry and envelope", () => {
    const full = completeReviewPayload();
    expect(reviewBatchSaveWireSchema.parse(full)).toEqual(full);
    expect(validateReviewBatchSavePayload(full)).toEqual(full);
    const canonical = canonicalizeFinancialActionEnvelope(
      {
        ...reviewBatchSaveEnvelope,
        payload: full,
      },
      reviewRegistry
    );
    expect(canonical.payload).toEqual(full);
    expect(canonical.kind).toBe("review_batch_save");
    expect(canonical.payloadVersion).toBe("review.batch-save/v1");
  });

  it.each([
    ["empty", ""],
    ["short", "a".repeat(63)],
    ["long", "a".repeat(65)],
    ["uppercase", "A".repeat(64)],
    ["mixed-case", "a".repeat(63) + "B"],
    ["nonhex", "g".repeat(64)],
    ["leading whitespace", " " + VALID_DIGEST],
    ["trailing newline", VALID_DIGEST + "\n"],
    ["numeric", 42],
    ["null", null],
    ["array", [VALID_DIGEST]],
  ])(
    "rejects %s digest, even when the rest of the payload is canonical",
    (_name, digest) => {
      const invalid = {
        ...completeReviewPayload(),
        frozenIntentDigest: digest,
      };
      expect(reviewBatchSaveWireSchema.safeParse(invalid).success).toBe(false);
      expect(() => validateReviewBatchSavePayload(invalid)).toThrow();
    }
  );

  it("rejects extra arbitrary digest/provenance fields at the review root", () => {
    const full = completeReviewPayload();
    for (const extra of [
      { originalIntentJson: "{}" },
      { originalSelectedRows: [] },
      { groupEvidenceKey: "c".repeat(64) },
      { frozenIntentDigestVersion: "v1" },
      { financialActionSnapshots: {} },
    ]) {
      const invalid = { ...full, ...extra };
      expect(reviewBatchSaveWireSchema.safeParse(invalid).success).toBe(false);
      expect(() => validateReviewBatchSavePayload(invalid)).toThrow();
    }
  });

  it("preserves the preexisting legacy edit-balance tuple's exact definition and payload", () => {
    const legacy = legacyEditBalanceEnvelope;
    const base = canonicalizeFinancialActionEnvelope(
      legacy,
      DEFAULT_FINANCIAL_ACTION_REGISTRY
    );
    const throughOptIn = canonicalizeFinancialActionEnvelope(
      legacy,
      reviewRegistry
    );
    expect(throughOptIn).toEqual(base);
    expect(throughOptIn).toEqual(legacy);
    const originalDefinition = DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
      legacy.domain,
      legacy.kind,
      legacy.payloadVersion
    );
    const retained = reviewRegistry.resolve(
      legacy.domain,
      legacy.kind,
      legacy.payloadVersion
    );
    expect(retained.validatePayload).toBe(originalDefinition.validatePayload);
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        {
          ...legacy,
          payload: { ...legacy.payload, frozenIntentDigest: VALID_DIGEST },
        },
        reviewRegistry
      )
    ).toThrow();
  });
});
