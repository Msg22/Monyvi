import {
  activateTrustedSmsCatalog,
  createTrustedSmsCatalogIntegrityDigest,
  createTrustedSmsPatternIntegrityDigest,
} from "../trusted-sms-pattern-catalog";
import type {
  TrustedSmsCatalog,
  TrustedSmsPattern,
} from "../trusted-sms-pattern-types";
import {
  buildTrustedCatalog,
  buildTrustedPattern,
} from "./fixtures/trusted-sms/trusted-sms-builders";

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

describe("trusted SMS catalog activation", () => {
  it("marks an incompatible schema invalid without activating patterns", () => {
    const catalog = resignCatalog({
      ...buildTrustedCatalog(),
      schemaVersion: 2 as 1,
    });

    expect(activateTrustedSmsCatalog(catalog)).toMatchObject({
      status: "incompatible",
      catalogVersion: null,
      patterns: [],
      issues: [{ code: "catalog_schema_version_invalid" }],
    });
  });

  it("disables one pattern without affecting unrelated valid patterns", () => {
    const disabled = resignPattern(
      buildTrustedPattern({ enabled: false, patternId: "disabled-pattern" })
    );
    const active = resignPattern(
      buildTrustedPattern({
        patternId: "active-pattern",
        promotionId: "promotion-active-pattern",
      })
    );
    const activation = activateTrustedSmsCatalog(
      resignCatalog(buildTrustedCatalog([disabled, active]))
    );

    expect(activation.status).toBe("active");
    expect(activation.patterns.map(({ patternId }) => patternId)).toEqual([
      "active-pattern",
    ]);
  });

  it("fails the complete catalog closed when integrity is invalid", () => {
    const catalog = buildTrustedCatalog([
      buildTrustedPattern({ integrityDigest: "0".repeat(64) }),
    ]);

    expect(activateTrustedSmsCatalog(catalog)).toMatchObject({
      status: "invalid",
      catalogVersion: null,
      patterns: [],
    });
  });
});
