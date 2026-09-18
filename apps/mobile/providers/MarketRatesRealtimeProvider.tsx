/**
 * Market Rates Realtime Provider
 *
 * Owns the Supabase Realtime channel subscription for market rates.
 * Lives at the app-root provider level so the WebSocket connection persists
 * across screen navigations, eliminating the 30-40s re-subscribe delay that
 * occurs when the channel is torn down and re-created on every mount.
 *
 * Architecture & Design Rationale:
 * - Pattern: Context Provider (app-level singleton)
 * - Why: The realtime channel is a shared resource. Multiple hooks
 *   (`useMarketRates`, `useLiveRatesScreen`, etc.) depend on `isConnected`,
 *   but none should own the channel lifecycle. Lifting to a provider ensures
 *   a single persistent connection.
 * - SOLID: SRP — manages only the channel lifecycle and connection state.
 *   DIP — consumers depend on the context abstraction, not the Supabase SDK.
 *
 * @module MarketRatesRealtimeProvider
 */

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabase";
import { logger } from "../utils/logger";
import { useSync } from "./SyncProvider";

interface MarketRatesRealtimeContextValue {
  /** Whether the realtime channel is actively subscribed */
  readonly isConnected: boolean;
}

const MarketRatesRealtimeContext =
  createContext<MarketRatesRealtimeContextValue | null>(null);

const MARKET_RATES_REALTIME_TOPIC = "market-rates-realtime";

let marketRatesRealtimeTeardown: Promise<void> = Promise.resolve();

function enqueueMarketRatesRealtimeRemoval(channel: RealtimeChannel): void {
  marketRatesRealtimeTeardown = marketRatesRealtimeTeardown
    .catch(() => undefined)
    .then(() => supabase.removeChannel(channel))
    .then(
      (status) => {
        if (status !== "ok") {
          logger.error("marketRatesRealtime.removeChannel.failed", undefined, {
            status,
          });
        }
      },
      (error: unknown) => {
        logger.error("marketRatesRealtime.removeChannel.failed", error);
      }
    );
}

interface MarketRatesRealtimeProviderProps {
  readonly children: ReactNode;
}

export function MarketRatesRealtimeProvider({
  children,
}: MarketRatesRealtimeProviderProps): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const { sync } = useSync();
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Stable reference to sync so the channel callback doesn't cause re-subscribes.
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const handleInsert = useCallback((): void => {
    // The notification carries no authority. Normal sync must pull and validate
    // the complete root-plus-observations envelope before local selection can
    // change.
    void syncRef.current().catch((error: unknown) => {
      logger.error("marketRatesRealtime.sync.failed", error);
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const removeCurrentChannel = (shouldUpdateConnection: boolean): void => {
      if (shouldUpdateConnection) {
        setIsConnected(false);
      }

      const channel = channelRef.current;
      if (!channel) {
        return;
      }

      channelRef.current = null;
      enqueueMarketRatesRealtimeRemoval(channel);
    };

    if (!isAuthenticated) {
      removeCurrentChannel(true);
      return;
    }

    void (async (): Promise<void> => {
      await marketRatesRealtimeTeardown.catch(() => undefined);
      if (isCancelled) {
        return;
      }

      const channel = supabase
        .channel(MARKET_RATES_REALTIME_TOPIC)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "market_rates",
          },
          handleInsert
        )
        .subscribe((status) => {
          if (!isCancelled) {
            setIsConnected(status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
          }
        });

      if (isCancelled) {
        enqueueMarketRatesRealtimeRemoval(channel);
        return;
      }

      channelRef.current = channel;
    })();

    return () => {
      isCancelled = true;
      removeCurrentChannel(true);
    };
  }, [isAuthenticated, handleInsert]);

  const value = useMemo<MarketRatesRealtimeContextValue>(
    () => ({ isConnected }),
    [isConnected]
  );

  return (
    <MarketRatesRealtimeContext.Provider value={value}>
      {children}
    </MarketRatesRealtimeContext.Provider>
  );
}

/**
 * Access the market-rates realtime connection state.
 *
 * @throws if used outside `MarketRatesRealtimeProvider`
 */
export function useMarketRatesRealtime(): MarketRatesRealtimeContextValue {
  const context = useContext(MarketRatesRealtimeContext);
  if (!context) {
    throw new Error(
      "useMarketRatesRealtime must be used within a MarketRatesRealtimeProvider"
    );
  }
  return context;
}
