import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  createFinancialActionRegistry,
  FinancialActionDefinition,
} from "../action-registry";
import { serializeFinancialActionEnvelope } from "../action-contracts";

const syntheticDefinition: FinancialActionDefinition = {
  domain: "transactions",
  kind: "annotate",
  payloadVersion: "transactions.annotate/v1",
  validatePayload: (value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      typeof (value as { note?: unknown }).note !== "string"
    ) {
      throw new Error("synthetic_invalid_payload");
    }
    return { note: (value as { note: string }).note };
  },
};

describe("financial action definition registry", () => {
  it("registers only the approved Metals Sell tuple by default", () => {
    expect(DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
      "metals",
      "sell",
      "metals.sell/v1"
    )).toMatchObject({
      domain: "metals",
      kind: "sell",
      payloadVersion: "metals.sell/v1",
    });
    expect(() =>
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "metals",
        "dispose",
        "metals.dispose/v1"
      )
    ).toThrow("financial_action_unknown_definition");
    expect(Object.isFrozen(DEFAULT_FINANCIAL_ACTION_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions)).toBe(
      true
    );
  });

  it("adds a synthetic second tuple without changing envelope serialization", () => {
    const registry = createFinancialActionRegistry([
      ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
      syntheticDefinition,
    ]);
    const envelope = {
      actionId: "018f0c7a-1234-7abc-8def-000000000011",
      domain: "transactions",
      domainReferenceId: "018f0c7a-1234-7abc-8def-000000000012",
      envelopeVersion: "monyvi.financial-action/v1",
      expectedAccountRevision: null,
      kind: "annotate",
      occurredAt: "2026-08-31T10:15:30.123Z",
      payload: { note: "second definition" },
      payloadVersion: "transactions.annotate/v1",
      userId: "018f0c7a-1234-7abc-8def-000000000013",
    };

    expect(serializeFinancialActionEnvelope(envelope, registry)).toContain(
      '"payload":{"note":"second definition"}'
    );
  });

  it("rejects duplicate tuple registrations", () => {
    expect(() =>
      createFinancialActionRegistry([
        syntheticDefinition,
        { ...syntheticDefinition },
      ])
    ).toThrow("financial_action_duplicate_definition");
  });
});
