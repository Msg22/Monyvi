import {
  decideCanonicalMetalMetadataFieldInstall,
  normalizeCanonicalMetalMetadataEditOutcome,
} from "../../services/metal-metadata-evidence-reconciliation";

const ID = "018f0c7a-1234-7abc-8def-000000000010";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000003";
const WRITER = ID;

describe("#363 canonical edit outcome validation", () => {
  const outcome = {
    editId: ID,
    holdingId: HOLDING,
    status: "applied",
    appliedChanges: {
      notes: {
        before: "Original",
        after: null,
        clock: { writtenAt: 1791633600000, writerId: WRITER },
      },
    },
    canonicalMetadata: {
      name: null,
      notes: {
        value: null,
        writtenAt: 1791633600000,
        writerId: WRITER,
      },
    },
  };

  it("retains exact confirmed null clears and accepted field clock", () => {
    expect(
      normalizeCanonicalMetalMetadataEditOutcome(outcome, ID, HOLDING)
        .appliedChanges
    ).toEqual(outcome.appliedChanges);
  });

  it("rejects an apparent ignored outcome containing changed values", () => {
    expect(() =>
      normalizeCanonicalMetalMetadataEditOutcome(
        { ...outcome, status: "ignored" },
        ID,
        HOLDING
      )
    ).toThrow("invalid_metal_metadata_edit_outcome");
  });

  it("rejects malformed or forged before/after, clock and owner binding", () => {
    expect(() =>
      normalizeCanonicalMetalMetadataEditOutcome(
        { ...outcome, holdingId: "someone-else" },
        ID,
        HOLDING
      )
    ).toThrow("invalid_metal_metadata_edit_outcome");
    expect(() =>
      normalizeCanonicalMetalMetadataEditOutcome(
        {
          ...outcome,
          appliedChanges: {
            notes: {
              before: "Original",
              after: "Original",
              clock: { writtenAt: 1791633600000, writerId: WRITER },
            },
          },
        },
        ID,
        HOLDING
      )
    ).toThrow("invalid_metal_metadata_edit_outcome");
  });

  it("rejects a canonical value contradicting its applied delta", () => {
    expect(() =>
      normalizeCanonicalMetalMetadataEditOutcome(
        {
          ...outcome,
          canonicalMetadata: {
            ...outcome.canonicalMetadata,
            notes: { ...outcome.canonicalMetadata.notes, value: "Not cleared" },
          },
        },
        ID,
        HOLDING
      )
    ).toThrow("invalid_metal_metadata_edit_outcome");
  });
});

describe("#363 optimistic losing field reconciliation", () => {
  const requestClock = {
    writtenAt: 300,
    writerId: "018f0c7a-1234-7abc-8def-000000000010",
  };
  const canonicalClock = {
    writtenAt: 200,
    writerId: "018f0c7a-1234-7abc-8def-000000000011",
  };

  it("restores exact server projection when this locally applied field loses LWW", () => {
    expect(
      decideCanonicalMetalMetadataFieldInstall({
        currentValue: "Offline wrong",
        currentClock: requestClock,
        candidateValue: "Offline wrong",
        candidateClock: requestClock,
        canonicalValue: "Actual winner",
        canonicalClock,
        didApplyOnServer: false,
      })
    ).toBe("install");
  });

  it("does not clobber another later local edit", () => {
    expect(
      decideCanonicalMetalMetadataFieldInstall({
        currentValue: "Later offline",
        currentClock: { ...requestClock, writtenAt: 400 },
        candidateValue: "Offline wrong",
        candidateClock: requestClock,
        canonicalValue: "Actual winner",
        canonicalClock,
        didApplyOnServer: false,
      })
    ).toBe("preserve");
  });

  it("uses the server's exact unclocked legacy baseline, never a guessed value", () => {
    expect(
      decideCanonicalMetalMetadataFieldInstall({
        currentValue: "Offline wrong",
        currentClock: requestClock,
        candidateValue: "Offline wrong",
        candidateClock: requestClock,
        canonicalValue: "Legacy Name",
        canonicalClock: null,
        didApplyOnServer: false,
      })
    ).toBe("install");
  });
});
