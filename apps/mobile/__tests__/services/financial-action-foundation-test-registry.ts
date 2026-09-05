import {
  createFinancialActionRegistry,
  validateMetalsSellPayloadV1,
} from "../../../../packages/logic/src/financial-actions";

export const LEGACY_FINANCIAL_ACTION_TEST_REGISTRY =
  createFinancialActionRegistry([
    {
      domain: "metals",
      kind: "sell",
      payloadVersion: "metals.sell/v1",
      validatePayload: validateMetalsSellPayloadV1,
    },
  ]);
