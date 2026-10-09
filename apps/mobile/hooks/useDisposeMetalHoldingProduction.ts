import * as Crypto from "expo-crypto";
import { useCallback, useMemo } from "react";

import { useDatabase } from "@/providers/DatabaseProvider";
import { createDisposeMetalHoldingProductionService } from "@/services/dispose-metal-holding-production-service";
import {
  loadDisposableMetalHolding,
  loadDisposeTerminalRateSnapshots,
} from "@/services/dispose-metal-holding-read-model-service";
import type {
  DisposeMetalHoldingCommandInput,
  DisposeRateSnapshotDraft,
} from "@/services/dispose-metal-holding-command-service";
import type { DisposeMetalHoldingFacadeDependencies } from "@/hooks/useDisposeMetalHolding";

export interface UseDisposeMetalHoldingProductionResult {
  readonly createId: () => string;
  readonly dependencies: DisposeMetalHoldingFacadeDependencies;
}

export function useDisposeMetalHoldingProduction(): UseDisposeMetalHoldingProductionResult {
  const database = useDatabase();
  const service = useMemo(
    () => createDisposeMetalHoldingProductionService(database),
    [database]
  );
  const disposeHolding = useCallback(
    (input: DisposeMetalHoldingCommandInput): Promise<unknown> =>
      service.dispose(input),
    [service]
  );
  const loadHolding = useCallback(
    (holdingId: string) => loadDisposableMetalHolding(holdingId),
    []
  );
  const loadTerminalRateSnapshots = useCallback(
    (
      holdingId: string,
      disposalDate: string
    ): Promise<readonly DisposeRateSnapshotDraft[]> =>
      loadDisposeTerminalRateSnapshots(holdingId, disposalDate),
    []
  );
  const createId = useCallback((): string => Crypto.randomUUID(), []);
  return useMemo(
    () => ({
      createId,
      dependencies: { loadHolding, loadTerminalRateSnapshots, disposeHolding },
    }),
    [createId, disposeHolding, loadHolding, loadTerminalRateSnapshots]
  );
}
