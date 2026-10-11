import { useMemo } from "react";
import * as Crypto from "expo-crypto";

import {
  useUndoMetalHolding,
  type UseUndoMetalHoldingResult,
} from "@/hooks/useUndoMetalHolding";
import { useDatabase } from "@/providers/DatabaseProvider";
import type {
  UndoMetalHoldingContext,
  UndoMetalHoldingCommandService,
} from "@/services/undo-metal-holding-command-service";
import { createUndoMetalHoldingProductionService } from "@/services/undo-metal-holding-production-service";

export function useRestoreMetalHolding(
  context: UndoMetalHoldingContext
): UseUndoMetalHoldingResult {
  const database = useDatabase();
  const service = useMemo<UndoMetalHoldingCommandService>(
    (): UndoMetalHoldingCommandService =>
      createUndoMetalHoldingProductionService(database),
    [database]
  );
  return useUndoMetalHolding({
    holdingId: context.holdingId,
    userId: context.userId,
    status: context.terminalKind === "sell" ? "sold" : "disposed",
    currentTerminalEventId: context.terminalEventId,
    expectedFinancialRevision: context.expectedFinancialRevision,
    service,
    createId: (): string => Crypto.randomUUID(),
    getOccurredAt: (): string => new Date().toISOString(),
  });
}
