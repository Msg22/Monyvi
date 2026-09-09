import {
  shapeMetalPortfolioHoldings,
  type MetalPortfolioHoldingInput,
  type ShapeMetalPortfolioHoldingsInput,
} from "@/services/metal-portfolio-read-model-service";

export function shapeMetalPortfolioHoldingFacts(
  input: ShapeMetalPortfolioHoldingsInput
): readonly MetalPortfolioHoldingInput[] {
  const observedEventIds = new Set(
    input.lifecycleEvents
      .filter((event) => !event.deleted && event.userId === input.userId)
      .map((event) => event.id)
  );
  const holdingStates = input.holdingStates.map((state) => {
    const isActive = state.status.trim().toLowerCase() === "active";
    const isEventStillPending =
      state.effectiveEventId !== null &&
      !observedEventIds.has(state.effectiveEventId);
    if (!isActive || !isEventStillPending) return state;

    return {
      deleted: state.deleted,
      effectiveEventId: null,
      holdingId: state.holdingId,
      isVisible: state.isVisible,
      reconciliationState: state.reconciliationState,
      status: state.status,
      userId: state.userId,
    };
  });

  return shapeMetalPortfolioHoldings({
    ...input,
    holdingStates,
  });
}
