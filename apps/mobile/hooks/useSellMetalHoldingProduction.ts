import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDatabase } from "@/providers/DatabaseProvider";
import {
  createSellMetalHoldingFormExecutor,
  loadSellableMetalHolding,
  type SellableMetalHolding,
  type SellMetalHoldingFormCommand,
} from "@/services/sell-metal-holding-facade-service";

export interface UseSellMetalHoldingProductionResult {
  readonly holding: SellableMetalHolding | null;
  readonly isLoading: boolean;
  readonly loadError: string | null;
  readonly createId: () => string;
  readonly execute: (command: SellMetalHoldingFormCommand) => Promise<void>;
  readonly reload: () => void;
}

export function useSellMetalHoldingProduction(
  holdingId: string,
  locale: string
): UseSellMetalHoldingProductionResult {
  const database = useDatabase();
  const [holding, setHolding] = useState<SellableMetalHolding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const createId = useCallback((): string => Crypto.randomUUID(), []);
  const executor = useMemo(
    () => createSellMetalHoldingFormExecutor(database, createId),
    [createId, database]
  );
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void loadSellableMetalHolding(database, holdingId, locale)
      .then((model): void => {
        if (cancelled) return;
        setHolding(model);
        setIsLoading(false);
      })
      .catch((caught: unknown): void => {
        if (cancelled) return;
        setLoadError(
          caught instanceof Error ? caught.message : "metal_holding_load_failed"
        );
        setIsLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [database, holdingId, locale, reloadKey]);
  const reload = useCallback(
    (): void => setReloadKey((current) => current + 1),
    []
  );
  return {
    holding,
    isLoading,
    loadError,
    createId,
    execute: executor.execute,
    reload,
  };
}
