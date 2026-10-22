/**
 * #395 review transcript fixtures — route facade hook.
 *
 * Owns loading/subscription state and in-flight launch admission for the
 * fixture catalogue. It calls services only; it never writes DB records,
 * builds queries, performs provider calls, or navigates. Navigation stays in
 * the route via the `onLaunched` callback, and a stale owner completion is
 * refused before the callback runs.
 *
 * @module useReviewTranscriptFixtures
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountReviewSession } from "@monyvi/logic";

import { useCurrentUser } from "./useCurrentUser";
import {
  buildReviewTranscriptFixtureLaunch,
  isReviewTranscriptFixturesRuntimeAvailable,
  type ReviewTranscriptFixtureLaunchUnavailableReason,
} from "@/services/review-transcript-fixtures-launcher-service";
import {
  loadReviewTranscriptFixturesContext,
  findRoleAccountId,
  type ReviewTranscriptFixturesContext,
} from "@/services/review-transcript-fixtures-context-service";
import {
  prepareReviewTranscriptFixtureAccounts,
  type ReviewTranscriptFixtureSetupResult,
} from "@/services/review-transcript-fixtures-setup-service";
import { listReviewTranscriptFixtureScenarios } from "@/dev/review-transcript-fixtures/catalog";

export interface ReviewTranscriptFixtureCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly transcript: string;
  readonly detectedLanguage: string;
  readonly rowCount: number;
  readonly currencyStates: ReadonlyArray<"known" | "unconfirmed">;
  readonly accountEvidenceStates: readonly string[];
  readonly roleLabels: readonly string[];
  readonly missingRoleLabels: readonly string[];
}

export interface ReviewTranscriptFixtureLaunchHandoff {
  readonly session: AccountReviewSession;
  readonly transcript: string;
  readonly detectedLanguage: string;
}

export interface UseReviewTranscriptFixturesInput {
  readonly onLaunched: (handoff: ReviewTranscriptFixtureLaunchHandoff) => void;
}

export interface UseReviewTranscriptFixturesResult {
  readonly status: "loading" | "ready" | "unavailable";
  readonly items: readonly ReviewTranscriptFixtureCatalogItem[];
  readonly preferredCurrency: string | null;
  readonly isPreparing: boolean;
  readonly setupResult: ReviewTranscriptFixtureSetupResult | null;
  readonly launchErrorReason: ReviewTranscriptFixtureLaunchUnavailableReason | null;
  readonly isLaunchingId: string | null;
  readonly prepareAccounts: () => Promise<void>;
  readonly launch: (scenarioId: string) => Promise<void>;
}

function buildItems(
  context: ReviewTranscriptFixturesContext
): readonly ReviewTranscriptFixtureCatalogItem[] {
  return listReviewTranscriptFixtureScenarios().map((scenario) => {
    const missingRoleLabels: string[] = [];
    for (const role of scenario.requiredAccountRoles) {
      if (findRoleAccountId(role, context.accounts) === null) {
        missingRoleLabels.push(role.label);
      }
    }
    return {
      id: scenario.id,
      label: scenario.label,
      transcript: scenario.transcript,
      detectedLanguage: scenario.detectedLanguage,
      rowCount: scenario.expectations.rowCount,
      currencyStates: scenario.expectations.currencyStates,
      accountEvidenceStates: scenario.expectations.accountEvidenceStates,
      roleLabels: scenario.requiredAccountRoles.map((role) => role.label),
      missingRoleLabels,
    };
  });
}

export function useReviewTranscriptFixtures(
  input: UseReviewTranscriptFixturesInput
): UseReviewTranscriptFixturesResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const runtimeAvailable = isReviewTranscriptFixturesRuntimeAvailable();
  const [context, setContext] =
    useState<ReviewTranscriptFixturesContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [setupResult, setSetupResult] =
    useState<ReviewTranscriptFixtureSetupResult | null>(null);
  const [launchErrorReason, setLaunchErrorReason] =
    useState<ReviewTranscriptFixtureLaunchUnavailableReason | null>(null);
  const [isLaunchingId, setIsLaunchingId] = useState<string | null>(null);
  const inFlightIdsRef = useRef<Set<string>>(new Set());
  const isPreparingRef = useRef(false);
  const isMountedRef = useRef(true);
  const ownerRef = useRef<string | null>(null);
  const onLaunchedRef = useRef(input.onLaunched);
  onLaunchedRef.current = input.onLaunched;

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const reloadContext = useCallback(async (): Promise<void> => {
    setIsLoadingContext(true);
    try {
      const loaded = await loadReviewTranscriptFixturesContext();
      if (!isMountedRef.current) return;
      ownerRef.current = loaded.ownerId;
      setContext(loaded);
    } catch {
      if (!isMountedRef.current) return;
      ownerRef.current = null;
      setContext(null);
    } finally {
      if (isMountedRef.current) setIsLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    if (!runtimeAvailable || isResolvingUser || userId === null) {
      setContext(null);
      setIsLoadingContext(false);
      ownerRef.current = null;
      return;
    }
    let active = true;
    setIsLoadingContext(true);
    void loadReviewTranscriptFixturesContext()
      .then((loaded) => {
        if (!active) return;
        ownerRef.current = loaded.ownerId;
        setContext(loaded);
      })
      .catch(() => {
        if (!active) return;
        ownerRef.current = null;
        setContext(null);
      })
      .finally(() => {
        if (active) setIsLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [runtimeAvailable, isResolvingUser, userId]);

  const prepareAccounts = useCallback(async (): Promise<void> => {
    if (!runtimeAvailable) return;
    // Synchronous mutual exclusion: never prepare while a launch is in flight.
    if (isPreparingRef.current || inFlightIdsRef.current.size > 0) return;
    isPreparingRef.current = true;
    setIsPreparing(true);
    try {
      const result = await prepareReviewTranscriptFixtureAccounts();
      if (!isMountedRef.current) return;
      setSetupResult(result);
      await reloadContext();
    } catch {
      if (isMountedRef.current) {
        setSetupResult({
          status: "blocked",
          reason: "creation_failed",
          roles: [],
        });
      }
    } finally {
      isPreparingRef.current = false;
      if (isMountedRef.current) setIsPreparing(false);
    }
  }, [reloadContext, runtimeAvailable]);

  const launch = useCallback(
    async (scenarioId: string): Promise<void> => {
      if (!runtimeAvailable) {
        setLaunchErrorReason("runtime_unavailable");
        return;
      }
      // Synchronous mutual exclusion: never launch while preparing roles, and
      // never start a second scenario while ANY launch is in flight, so two
      // rapid taps cannot push two review screens.
      if (isPreparingRef.current) return;
      if (context === null || inFlightIdsRef.current.size > 0) return;
      const launchOwnerId = context.ownerId;
      inFlightIdsRef.current.add(scenarioId);
      setIsLaunchingId(scenarioId);
      setLaunchErrorReason(null);
      try {
        // Reload before building: this also runs after returning from review, so
        // a just-saved draft account is matchable on the next launch attempt.
        const latest = await loadReviewTranscriptFixturesContext();
        if (!isMountedRef.current) return;
        if (latest.ownerId !== launchOwnerId || userId !== launchOwnerId) {
          setLaunchErrorReason("owner_changed");
          return;
        }
        ownerRef.current = latest.ownerId;
        setContext(latest);
        const result = await buildReviewTranscriptFixtureLaunch({
          scenarioId,
          context: latest,
        });
        if (!isMountedRef.current) return;
        if (result.status !== "launched" || result.session === null) {
          setLaunchErrorReason(result.reason ?? "session_failed");
          return;
        }
        // Owner may have changed while normalization was in flight; never
        // hand a stale result to navigation.
        if (ownerRef.current !== launchOwnerId || userId !== launchOwnerId) {
          setLaunchErrorReason("owner_changed");
          return;
        }
        onLaunchedRef.current({
          session: result.session,
          transcript: result.transcript,
          detectedLanguage: result.detectedLanguage,
        });
      } catch {
        if (isMountedRef.current) setLaunchErrorReason("session_failed");
      } finally {
        inFlightIdsRef.current.delete(scenarioId);
        if (isMountedRef.current) setIsLaunchingId(null);
      }
    },
    [context, runtimeAvailable, userId]
  );

  const status: UseReviewTranscriptFixturesResult["status"] = !runtimeAvailable
    ? "unavailable"
    : context !== null
      ? "ready"
      : isLoadingContext || isResolvingUser
        ? "loading"
        : "unavailable";

  return {
    status,
    items: context === null ? [] : buildItems(context),
    preferredCurrency: context?.preferredCurrency ?? null,
    isPreparing,
    setupResult,
    launchErrorReason,
    isLaunchingId,
    prepareAccounts,
    launch,
  };
}
