import { createHash } from "node:crypto";

import {
  FINANCIAL_ACTION_ERROR_CODES,
  FINANCIAL_ACTION_STATES,
  SERVER_OUTCOMES,
  canonicalizeFinancialActionEnvelope,
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  resolveFinancialActionReplay,
  serializeFinancialActionEnvelope,
  FinancialActionEnvelopeV1,
  CanonicalUnsignedIntegerString,
  Sha256Provider,
} from "../action-contracts";
import {
  createFinancialActionRegistry,
  MAX_ACTION_NOTES_UTF8_BYTES,
  MAX_ACTION_RATE_REFERENCE_IDS,
  MAX_CANONICAL_ACTION_UTF8_BYTES,
  MAX_CANONICAL_DECIMAL_SCALE,
  MAX_CANONICAL_FINANCIAL_DIGITS,
  MetalsSellPayloadV1,
  type RegisteredActionPayload,
} from "../action-registry";

const ARABIC_VECTOR =
  '{"accountGuards":[],"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}';
const ARABIC_DIGEST =
  "020ebe94ba4a335d86502ef218f39b2b1789c311c28540f3250a7f5c85cc96c3";

const sha256Provider: Sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(canonicalText, "utf8").digest("hex")),
};

function validEnvelope(): FinancialActionEnvelopeV1<MetalsSellPayloadV1> {
  return JSON.parse(
    ARABIC_VECTOR
  ) as FinancialActionEnvelopeV1<MetalsSellPayloadV1>;
}

function expectContractError(value: unknown, code: string): void {
  expect(() => canonicalizeFinancialActionEnvelope(value)).toThrow(code);
}

describe("financial action canonical contract", () => {
  it("serializes the approved Arabic vector and hashes its exact UTF-8 bytes", async () => {
    const envelope = parseFinancialActionEnvelopeJson(ARABIC_VECTOR);

    expect(serializeFinancialActionEnvelope(envelope)).toBe(ARABIC_VECTOR);
    await expect(
      hashFinancialActionEnvelope(envelope, sha256Provider)
    ).resolves.toEqual({
      canonicalText: ARABIC_VECTOR,
      payloadHash: ARABIC_DIGEST,
    });
  });

  it("rejects numeric payload returned by a custom validator before hashing", async () => {
    const registry = createFinancialActionRegistry([
      {
        domain: "metals",
        kind: "sell",
        payloadVersion: "metals.sell/v1",
        validatePayload: (): RegisteredActionPayload =>
          ({ numericValue: 1 }) as unknown as RegisteredActionPayload,
      },
    ]);
    const digestUtf8 = jest.fn(
      (_canonicalText: string): Promise<string> => Promise.resolve(ARABIC_DIGEST)
    );

    expect(() =>
      canonicalizeFinancialActionEnvelope(validEnvelope(), registry)
    ).toThrow(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
    await expect(
      hashFinancialActionEnvelope(validEnvelope(), { digestUtf8 }, registry)
    ).rejects.toThrow(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
    expect(digestUtf8).not.toHaveBeenCalled();
  });

  it("sorts every object by ASCII key bytes while preserving array order", () => {
    const envelope = validEnvelope();
    const reordered = {
      userId: envelope.userId,
      payloadVersion: envelope.payloadVersion,
      payload: {
        rateReferenceIds: [...envelope.payload.rateReferenceIds].reverse(),
        notes: envelope.payload.notes,
        netProceedsMinorUnits: envelope.payload.netProceedsMinorUnits,
        includeAccountCredit: envelope.payload.includeAccountCredit,
        holdingId: envelope.payload.holdingId,
        grossProceedsDecimal: envelope.payload.grossProceedsDecimal,
        feeMinorUnits: envelope.payload.feeMinorUnits,
      },
      occurredAt: envelope.occurredAt,
      kind: envelope.kind,
      accountGuards: envelope.accountGuards,
      envelopeVersion: envelope.envelopeVersion,
      domainReferenceId: envelope.domainReferenceId,
      domain: envelope.domain,
      actionId: envelope.actionId,
    };

    const serialized = serializeFinancialActionEnvelope(reordered);

    expect(serialized.indexOf('"actionId"')).toBeLessThan(
      serialized.indexOf('"domain"')
    );
    expect(serialized).toContain(
      `"rateReferenceIds":["${envelope.payload.rateReferenceIds[1]}","${envelope.payload.rateReferenceIds[0]}"]`
    );
  });

  it("normalizes equivalent JSON string escapes without normalizing Unicode", async () => {
    const escaped = ARABIC_VECTOR.replace("ذهب", "\\u0630\\u0647\\u0628");
    const base = validEnvelope();
    const composed = { ...base, payload: { ...base.payload, notes: "é" } };
    const decomposed = {
      ...base,
      payload: { ...base.payload, notes: "e\u0301" },
    };

    await expect(
      hashFinancialActionEnvelope(
        parseFinancialActionEnvelopeJson(escaped),
        sha256Provider
      )
    ).resolves.toEqual({
      canonicalText: ARABIC_VECTOR,
      payloadHash: ARABIC_DIGEST,
    });
    expect(serializeFinancialActionEnvelope(composed)).not.toBe(
      serializeFinancialActionEnvelope(decomposed)
    );
  });

  it("requires the explicit account guard array", () => {
    const omitted: Record<string, unknown> = { ...validEnvelope() };
    delete omitted.accountGuards;

    expect(validEnvelope().accountGuards).toEqual([]);
    expectContractError(omitted, FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE);
  });

  it("reserves ordered account guards in the V1 type while Slice 3A rejects non-empty guards", () => {
    const reservedRevision = "7" as CanonicalUnsignedIntegerString;
    const revisionBearingEnvelope: FinancialActionEnvelopeV1<MetalsSellPayloadV1> = {
      ...validEnvelope(),
      accountGuards: [
        {
          accountId: "018f0c7a-1234-7abc-8def-000000000007",
          expectedRevision: reservedRevision,
        },
      ],
    };

    expectContractError(
      revisionBearingEnvelope,
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
  });

  it.each([
    ["unsupported envelope version", { envelopeVersion: "v2" }],
    ["unsupported domain", { domain: "other" }],
    [
      "non-canonical action id",
      { actionId: "018F0C7A-1234-7ABC-8DEF-000000000001" },
    ],
    ["year-zero timestamp", { occurredAt: "0000-01-01T00:00:00.000Z" }],
    ["non-UTC timestamp", { occurredAt: "2026-08-31T12:15:30.123+02:00" }],
    ["invalid calendar time", { occurredAt: "2026-02-30T10:15:30.123Z" }],
    [
      "non-empty account guards in foundation",
      {
        accountGuards: [
          {
            accountId: "018f0c7a-1234-7abc-8def-000000000007",
            expectedRevision: "0",
          },
        ],
      },
    ],
  ])("rejects %s", (_name, replacement) => {
    expectContractError(
      { ...validEnvelope(), ...replacement },
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
  });

  it.each(["0001-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"])(
    "accepts shared four-digit timestamp boundary %s",
    (occurredAt) => {
      expect(
        canonicalizeFinancialActionEnvelope({ ...validEnvelope(), occurredAt })
      ).toMatchObject({ occurredAt });
    }
  );

  it.each([
    ["unsupported kind", { kind: "dispose" }],
    ["unsupported payload version", { payloadVersion: "metals.sell/v2" }],
  ])("rejects unknown definition: %s", (_name, replacement) => {
    expectContractError(
      { ...validEnvelope(), ...replacement },
      "financial_action_unknown_definition"
    );
  });

  it.each([
    ["null actionId", { actionId: null }],
    ["boolean userId", { userId: true }],
    ["null domain", { domain: null }],
    ["object domain reference", { domainReferenceId: {} }],
    ["boolean kind", { kind: false }],
    ["null envelope version", { envelopeVersion: null }],
    ["array payload version", { payloadVersion: [] }],
    ["null occurredAt", { occurredAt: null }],
  ])("rejects typed envelope violation: %s", (_name, replacement) => {
    expectContractError(
      { ...validEnvelope(), ...replacement },
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
  });

  it.each([
    ["null fee", { feeMinorUnits: null }],
    ["boolean gross proceeds", { grossProceedsDecimal: true }],
    ["object holding id", { holdingId: {} }],
    ["null net proceeds", { netProceedsMinorUnits: null }],
    ["array notes", { notes: [] }],
    ["object rate references", { rateReferenceIds: {} }],
    ["scalar rate reference", { rateReferenceIds: [true] }],
  ])("rejects typed payload violation: %s", (_name, replacement) => {
    expectContractError(
      {
        ...validEnvelope(),
        payload: { ...validEnvelope().payload, ...replacement },
      },
      "financial_action_invalid_payload"
    );
  });

  it("exports the frozen financial action bounds", () => {
    expect({
      MAX_CANONICAL_FINANCIAL_DIGITS,
      MAX_CANONICAL_DECIMAL_SCALE,
      MAX_ACTION_NOTES_UTF8_BYTES,
      MAX_ACTION_RATE_REFERENCE_IDS,
      MAX_CANONICAL_ACTION_UTF8_BYTES,
    }).toEqual({
      MAX_CANONICAL_FINANCIAL_DIGITS: 50,
      MAX_CANONICAL_DECIMAL_SCALE: 18,
      MAX_ACTION_NOTES_UTF8_BYTES: 4096,
      MAX_ACTION_RATE_REFERENCE_IDS: 16,
      MAX_CANONICAL_ACTION_UTF8_BYTES: 65536,
    });
  });

  it.each([
    ["zero gross", { grossProceedsDecimal: "0" }],
    ["negative gross", { grossProceedsDecimal: "-1" }],
    ["gross precision", { grossProceedsDecimal: "1".repeat(51) }],
    ["gross scale", { grossProceedsDecimal: `1.${"1".repeat(19)}` }],
    ["negative fee", { feeMinorUnits: "-1" }],
    ["fee precision", { feeMinorUnits: "1".repeat(51) }],
    ["negative net", { netProceedsMinorUnits: "-1" }],
    ["net precision", { netProceedsMinorUnits: "1".repeat(51) }],
    ["notes bytes", { notes: "a".repeat(4097) }],
    [
      "rate reference count",
      {
        rateReferenceIds: Array.from(
          { length: 17 },
          () => "018f0c7a-1234-7abc-8def-000000000005"
        ),
      },
    ],
  ])("rejects bounded payload violation: %s", (_name, replacement) => {
    expectContractError(
      {
        ...validEnvelope(),
        payload: { ...validEnvelope().payload, ...replacement },
      },
      "financial_action_invalid_payload"
    );
  });

  it("accepts exact numeric, notes, and rate-reference bounds", () => {
    const bounded = {
      ...validEnvelope(),
      payload: {
        ...validEnvelope().payload,
        grossProceedsDecimal: `${"1".repeat(32)}.${"1".repeat(18)}`,
        feeMinorUnits: "1".repeat(50),
        netProceedsMinorUnits: "1".repeat(50),
        notes: "a".repeat(4096),
        rateReferenceIds: Array.from(
          { length: 16 },
          () => "018f0c7a-1234-7abc-8def-000000000005"
        ),
      },
    };

    expect(() => serializeFinancialActionEnvelope(bounded)).not.toThrow();
  });

  it("rejects raw action text above the canonical byte cap before parsing", () => {
    expect(() => parseFinancialActionEnvelopeJson(" ".repeat(65537))).toThrow(
      "financial_action_payload_too_large"
    );
  });

  it.each([
    ["unknown envelope field", { unknown: true }],
    ["non-array account guards", { accountGuards: null }],
  ])("rejects %s", (_name, addition) => {
    expectContractError(
      { ...validEnvelope(), ...addition },
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
  });

  it.each([
    ["unknown payload field", { unknown: "value" }],
    ["number token", { grossProceedsDecimal: 35500 }],
    ["invalid decimal trailing zero", { grossProceedsDecimal: "35500.0" }],
    ["invalid minor-unit leading zero", { feeMinorUnits: "080000" }],
    ["negative zero", { feeMinorUnits: "-0" }],
    ["forbidden null", { notes: null }],
    ["invalid holding id", { holdingId: "holding-1" }],
    ["account credit before #242", { includeAccountCredit: true }],
  ])("rejects payload %s", (_name, replacement) => {
    const envelope = validEnvelope();
    expectContractError(
      { ...envelope, payload: { ...envelope.payload, ...replacement } },
      FINANCIAL_ACTION_ERROR_CODES.INVALID_PAYLOAD
    );
  });

  it("rejects duplicate keys before object materialization", () => {
    const duplicate = ARABIC_VECTOR.replace(
      '"domain":"metals",',
      '"domain":"metals","domain":"metals",'
    );

    expect(() => parseFinancialActionEnvelopeJson(duplicate)).toThrow(
      FINANCIAL_ACTION_ERROR_CODES.DUPLICATE_KEY
    );
  });

  it("rejects forbidden scalar strings", () => {
    const base = validEnvelope();
    const nul = { ...base, payload: { ...base.payload, notes: "a\u0000b" } };
    const surrogate = {
      ...base,
      payload: { ...base.payload, notes: "\ud800" },
    };

    expectContractError(nul, FINANCIAL_ACTION_ERROR_CODES.INVALID_STRING);
    expectContractError(surrogate, FINANCIAL_ACTION_ERROR_CODES.INVALID_STRING);
  });

  it.each([
    ["undefined", undefined],
    ["bigint", BigInt(1)],
    ["function", (): void => undefined],
    ["symbol", Symbol("value")],
    ["Date", new Date("2026-08-31T10:15:30.123Z")],
    ["Map", new Map()],
    ["Set", new Set()],
    ["typed array", new Uint8Array([1])],
    ["class instance", new (class Unsupported {})()],
  ])("rejects unsupported runtime value: %s", (_name, value) => {
    const envelope = validEnvelope();
    expectContractError(
      { ...envelope, payload: { ...envelope.payload, notes: value } },
      FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE
    );
  });

  it("rejects sparse arrays, accessors, and cycles without invoking accessors", () => {
    const base = validEnvelope();
    const sparse = {
      ...base,
      payload: { ...base.payload, rateReferenceIds: new Array(2) as string[] },
    };
    expectContractError(sparse, FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);

    const accessor = { ...base, payload: { ...base.payload } };
    const getter = jest.fn(() => "hidden");
    Object.defineProperty(accessor.payload, "notes", {
      enumerable: true,
      get: getter,
    });
    expectContractError(
      accessor,
      FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE
    );
    expect(getter).not.toHaveBeenCalled();

    const cyclicPayload: Record<string, unknown> = { ...base.payload };
    cyclicPayload.cycle = cyclicPayload;
    const cyclic = { ...base, payload: cyclicPayload };
    expectContractError(cyclic, FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  });

  it("accepts identical replay and rejects an action-id payload mismatch", () => {
    const storedOutcome = {
      serverOutcome: "accepted" as const,
      outcomeJson: "{}",
    };

    expect(
      resolveFinancialActionReplay(
        ARABIC_VECTOR,
        ARABIC_DIGEST,
        ARABIC_VECTOR,
        ARABIC_DIGEST,
        storedOutcome
      )
    ).toEqual({ kind: "replay", outcome: storedOutcome });
    expect(
      resolveFinancialActionReplay(
        ARABIC_VECTOR,
        ARABIC_DIGEST,
        ARABIC_VECTOR,
        "a".repeat(64),
        storedOutcome
      )
    ).toEqual({
      kind: "rejected",
      reasonCode: "action_id_payload_mismatch",
    });
  });

  it("rejects different canonical text even when a faulty provider returns the same hash", () => {
    const storedOutcome = {
      serverOutcome: "accepted" as const,
      outcomeJson: "{}",
    };
    const changedCanonicalText = ARABIC_VECTOR.replace(
      '"notes":"ذهب"',
      '"notes":"changed"'
    );

    expect(
      resolveFinancialActionReplay(
        ARABIC_VECTOR,
        ARABIC_DIGEST,
        changedCanonicalText,
        ARABIC_DIGEST,
        storedOutcome
      )
    ).toEqual({
      kind: "rejected",
      reasonCode: "action_id_payload_mismatch",
    });
  });

  it("exposes only durable foundation states and server outcomes", () => {
    expect(FINANCIAL_ACTION_STATES).toEqual([
      "pending_local",
      "local_complete",
      "sync_pending",
      "sync_failed",
      "accepted",
      "rejected_compensating",
      "reconciled",
      "reconciliation_incomplete",
    ]);
    expect(SERVER_OUTCOMES).toEqual([
      "accepted",
      "idempotent",
      "stale",
      "rejected",
    ]);
  });

  it("rejects an invalid digest returned by the injected provider", async () => {
    await expect(
      hashFinancialActionEnvelope(validEnvelope(), {
        digestUtf8: (): Promise<string> => Promise.resolve("NOT-A-DIGEST"),
      })
    ).rejects.toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_HASH);
  });
});
