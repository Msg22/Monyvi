/**
 * #395 T015/T054 — the only test-mode Voice scene read lifecycle.
 *
 * Authenticated T015 fixture service owns owner-role binding and Zod parsing.
 * This hook only revokes stale async results and exposes a scoped session to
 * the existing Voice route. It never calls a provider or financial writer.
 */
import { useEffect, useState } from "react";
import type { AccountReviewSession } from "@monyvi/logic";
import { isE2eTestMode } from "@/config/e2e-test-config";
import { loadAccountReviewFixtureSession } from "@/services/account-review-fixture-service";

export interface UseAccountReviewFixtureSceneInput {
  readonly sceneId: string | null;
  readonly ownerId: string | null;
  readonly isResolvingUser: boolean;
}

export interface AccountReviewFixtureSceneState {
  readonly status: "idle" | "loading" | "ready" | "unavailable";
  readonly session: AccountReviewSession | null;
}

interface ResolvedFixture {
  readonly requestKey: string;
  readonly session: AccountReviewSession | null;
  readonly status: "ready" | "unavailable";
}

export function useAccountReviewFixtureScene({
  sceneId,
  ownerId,
  isResolvingUser,
}: UseAccountReviewFixtureSceneInput): AccountReviewFixtureSceneState {
  const [resolved, setResolved] = useState<ResolvedFixture | null>(null);
  const enabled =
    sceneId !== null &&
    process.env.NODE_ENV !== "production" &&
    isE2eTestMode();
  const requestKey = JSON.stringify([ownerId, sceneId]);
  const canLoad = enabled && ownerId !== null && !isResolvingUser;

  useEffect(() => {
    // Even if React has not flushed this cleanup yet, the render path below
    // refuses any resolved data whose owner+scene request key changed.
    if (!canLoad || ownerId === null || sceneId === null) return;
    let active = true;
    setResolved(null);
    void loadAccountReviewFixtureSession(sceneId)
      .then((session) => {
        if (!active) return;
        // Never allow an SMS descriptor to appear in the Voice-only route.
        // T015 already validates a strict canonical session and current owner.
        const safe =
          session.ownerId === ownerId &&
          session.source === "VOICE" &&
          session.rows.length > 0 &&
          session.rows.every((row) => row.source === "VOICE");
        setResolved({
          requestKey,
          status: safe ? "ready" : "unavailable",
          session: safe ? session : null,
        });
      })
      .catch(() => {
        if (!active) return;
        setResolved({ requestKey, status: "unavailable", session: null });
      });
    return () => {
      active = false;
    };
  }, [canLoad, ownerId, sceneId, requestKey]);

  if (sceneId === null) return { status: "idle", session: null };
  if (!enabled || ownerId === null)
    return { status: "unavailable", session: null };
  if (isResolvingUser || !canLoad || resolved?.requestKey !== requestKey) {
    return { status: "loading", session: null };
  }
  return { status: resolved.status, session: resolved.session };
}
