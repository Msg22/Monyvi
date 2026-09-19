import type { MetalTerminalFacts } from "@/services/metal-terminal-read-model-service";

export function shapeMetalTerminalFacts(input: {
  readonly holdingState: { readonly status: "active" | "sold" | "disposed" };
}): MetalTerminalFacts | null {
  return input.holdingState.status === "active"
    ? null
    : terminalFactsFixture(input.holdingState.status);
}

/** Shaped evidence fixture for lifecycle/pagination tests; decoding has separate integration coverage. */
export function terminalFactsFixture(
  kind: "sold" | "disposed" = "sold"
): MetalTerminalFacts {
  return kind === "sold"
    ? {
        actionId: "sale-action",
        kind,
        feeDecimal: "0",
        grossProceedsDecimal: "100",
        netProceedsDecimal: "100",
        notes: null,
        proceedsCurrency: "EGP",
        realizedResultCurrency: null,
        realizedResultDecimal: null,
        realizedResultUnavailableReason: "purchase_cost_unavailable",
        terminalDate: "2026-08-01",
      }
    : {
        actionId: "dispose-action",
        kind,
        notes: null,
        reason: "given_away",
        treatment: "external_transfer",
        terminalDate: "2026-08-01",
      };
}
