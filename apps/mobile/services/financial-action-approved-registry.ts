import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  createFinancialActionRegistry,
} from "@monyvi/logic";

export const APPROVED_FINANCIAL_ACTION_REGISTRY = createFinancialActionRegistry(
  DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions.filter(
    (definition) =>
      definition.domain === "metals" &&
      (definition.kind === "add" || definition.kind === "correct")
  )
);
