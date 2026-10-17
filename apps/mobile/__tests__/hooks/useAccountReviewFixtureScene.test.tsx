/**
 * #395 E2E entry tests FIRST. A scene alias is never trusted session JSON;
 * the real T015 service owns authenticated role binding and Zod hydration.
 * This hook controls only page lifetime and stops stale scene publication.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AccountReviewSession } from "../../../../packages/logic/src/account-review/review-schemas";
import { useAccountReviewFixtureScene } from "@/hooks/useAccountReviewFixtureScene";

const OWNER = "123e4567-e89b-42d3-a456-426614174001";
const FOREIGN = "123e4567-e89b-42d3-a456-426614174002";
const mockLoadFixture = jest.fn<Promise<AccountReviewSession>, [string]>();
let mockIsE2eMode = true;

jest.mock("@/config/e2e-test-config", () => ({
  isE2eTestMode: () => mockIsE2eMode,
}));
jest.mock("@/services/account-review-fixture-service", () => ({
  loadAccountReviewFixtureSession: (
    sceneId: string
  ): Promise<AccountReviewSession> => mockLoadFixture(sceneId),
}));

function scene(
  ownerId = OWNER,
  source: "VOICE" | "SMS" = "VOICE"
): AccountReviewSession {
  return {
    ownerId,
    sessionId: "123e4567-e89b-42d3-a456-426614174003",
    source,
    rows: [{ source }],
    groups: [],
  } as unknown as AccountReviewSession;
}
function input(
  sceneId: string | null = "r3-combined-en",
  ownerId: string | null = OWNER,
  isResolvingUser = false
): {
  readonly sceneId: string | null;
  readonly ownerId: string | null;
  readonly isResolvingUser: boolean;
} {
  return { sceneId, ownerId, isResolvingUser };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockIsE2eMode = true;
  mockLoadFixture.mockResolvedValue(scene());
});

describe("#395 Voice-only current-owner E2E fixture route lifecycle", () => {
  it("loads one allowlisted Voice scene from the actual service, with no hosted, parser or writer hook", async () => {
    const { result } = renderHook(() => useAccountReviewFixtureScene(input()));
    expect(result.current.session).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session?.ownerId).toBe(OWNER);
    expect(result.current.session?.source).toBe("VOICE");
    expect(mockLoadFixture).toHaveBeenCalledTimes(1);
    expect(mockLoadFixture).toHaveBeenCalledWith("r3-combined-en");
  });

  it("rejects a signed-out or unresolved actor without invoking any fixture loader", () => {
    const signedOut = renderHook(() =>
      useAccountReviewFixtureScene(input("r3-combined-en", null))
    );
    const loading = renderHook(() =>
      useAccountReviewFixtureScene(input("r3-combined-en", OWNER, true))
    );
    expect(signedOut.result.current.status).toBe("unavailable");
    expect(loading.result.current.status).toBe("loading");
    expect(signedOut.result.current.session).toBeNull();
    expect(loading.result.current.session).toBeNull();
    expect(mockLoadFixture).not.toHaveBeenCalled();
  });

  it("does not touch fixture loader with test mode disabled", () => {
    mockIsE2eMode = false;
    const { result } = renderHook(() => useAccountReviewFixtureScene(input()));
    expect(result.current.status).toBe("unavailable");
    expect(result.current.session).toBeNull();
    expect(mockLoadFixture).not.toHaveBeenCalled();
  });

  it("rejects a production runtime even with an E2E-looking flag", () => {
    const env = process.env.NODE_ENV;
    try {
      process.env = { ...process.env, NODE_ENV: "production" };
      const { result } = renderHook(() =>
        useAccountReviewFixtureScene(input())
      );
      expect(result.current.status).toBe("unavailable");
      expect(result.current.session).toBeNull();
      expect(mockLoadFixture).not.toHaveBeenCalled();
    } finally {
      process.env = { ...process.env, NODE_ENV: env };
    }
  });

  it("fails closed for a missing scene and never falls back to legacy review", async () => {
    mockLoadFixture.mockRejectedValueOnce(
      new Error("ACCOUNT_REVIEW_FIXTURE_SCENE_UNAVAILABLE")
    );
    const { result } = renderHook(() =>
      useAccountReviewFixtureScene(input("unknown-scene"))
    );
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.session).toBeNull();
  });

  it("rejects an SMS session returned by the loader rather than treating it as Voice", async () => {
    mockLoadFixture.mockResolvedValueOnce(scene(OWNER, "SMS"));
    const { result } = renderHook(() =>
      useAccountReviewFixtureScene(input("r3-removed-undo"))
    );
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.session).toBeNull();
  });

  it("rejects foreign nested ownership from a completed scene", async () => {
    mockLoadFixture.mockResolvedValueOnce(scene(FOREIGN));
    const { result } = renderHook(() => useAccountReviewFixtureScene(input()));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.session).toBeNull();
  });

  it("hides old scene synchronously across owner change and ignores late result", async () => {
    let resolveOld!: (result: AccountReviewSession) => void;
    const pending = new Promise<AccountReviewSession>((resolve) => {
      resolveOld = resolve;
    });
    mockLoadFixture
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(scene(FOREIGN));
    interface SceneProps {
      readonly ownerId: string;
      readonly sceneId: string;
    }
    const { result, rerender } = renderHook(
      ({ ownerId, sceneId }: SceneProps) =>
        useAccountReviewFixtureScene(input(sceneId, ownerId)),
      { initialProps: { ownerId: OWNER, sceneId: "r3-combined-en" } }
    );
    await waitFor(() => expect(mockLoadFixture).toHaveBeenCalledTimes(1));
    rerender({ ownerId: FOREIGN, sceneId: "r3-default-only" });
    expect(result.current.session).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session?.ownerId).toBe(FOREIGN);
    await act(async () => {
      resolveOld(scene(OWNER));
      await pending;
    });
    expect(result.current.session?.ownerId).toBe(FOREIGN);
    expect(mockLoadFixture).toHaveBeenCalledTimes(2);
  });

  it("cannot publish an in-flight result after unmount", async () => {
    let resolve!: (value: AccountReviewSession) => void;
    const pending = new Promise<AccountReviewSession>((done) => {
      resolve = done;
    });
    mockLoadFixture.mockReturnValueOnce(pending);
    const { unmount } = renderHook(() => useAccountReviewFixtureScene(input()));
    await waitFor(() => expect(mockLoadFixture).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      resolve(scene());
      await pending;
    });
    expect(mockLoadFixture).toHaveBeenCalledTimes(1);
  });

  it("preserves normal no-scene route behavior and never performs fixture reads", () => {
    const { result } = renderHook(() =>
      useAccountReviewFixtureScene(input(null))
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.session).toBeNull();
    expect(mockLoadFixture).not.toHaveBeenCalled();
  });
});
