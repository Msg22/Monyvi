/**
 * #395 T015 — opt-in E2E-only canonical account review fixture entry.
 *
 * This service loads no hosted fixture, never seeds a user or changes balances,
 * never requests an AI/provider, and never writes or saves a transaction.
 * It is not a route: the T054 review facade owns actual UI and Save integration.
 */
import { isE2eTestMode } from "@/config/e2e-test-config";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "@monyvi/logic";
import manifest from "../e2e/fixtures/shared-account-review.json";
import { buildFixtureReviewSession } from "./account-review-fixture-builders";
import { loadFixtureBindings } from "./account-review-fixture-role-service";
import { getRequiredCurrentUserId } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

type FixtureScene = (typeof manifest.scenes)[number];

function requireFixtureMode(): void {
  // The generic E2E config flag alone does not reject a production runtime.
  if (
    process.env.NODE_ENV === "production" ||
    !isE2eTestMode() ||
    manifest.productionEntryAllowed !== false
  ) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_MODE_UNAVAILABLE");
  }
}

function requireKnownScene(sceneId: string): FixtureScene {
  if (typeof sceneId !== "string" || !sceneId || sceneId.trim() !== sceneId) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_SCENE_UNAVAILABLE");
  }
  const scene = manifest.scenes.find((item) => item.id === sceneId);
  if (scene === undefined) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_SCENE_UNAVAILABLE");
  }
  return scene;
}

async function assertFixtureOwner(ownerId: string): Promise<void> {
  if ((await getRequiredCurrentUserId()) !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
}

/**
 * Construct one real-schema AccountReviewSession for a synthetic allowlisted
 * scene using the authenticated user's existing owned account/category IDs.
 * The returned object stays in memory: there is no route or Save bypass.
 */
export async function loadAccountReviewFixtureSession(
  sceneId: string
): Promise<AccountReviewSession> {
  requireFixtureMode();
  const scene = requireKnownScene(sceneId);
  const ownerId = await getRequiredCurrentUserId();
  const bindings = await loadFixtureBindings(ownerId);
  await assertFixtureOwner(ownerId);
  const session = await buildFixtureReviewSession(scene, bindings);
  await assertFixtureOwner(ownerId);
  if (session.ownerId !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  return accountReviewSessionSchema.parse(session);
}
