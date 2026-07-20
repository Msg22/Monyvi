import { resolveSmsAiAvailability } from "../index";

describe("resolveSmsAiAvailability", () => {
  const serverNow = "2026-07-20T12:00:00.000Z";

  it("uses a rolling expiry that is still in the future", () => {
    const blockers = [
      {
        reason: "rolling_limit",
        availableAt: "2026-07-20T12:05:00.000Z",
      },
    ];

    expect(resolveSmsAiAvailability({ serverNow, blockers })).toEqual({
      reason: "rolling_limit",
      availableAt: "2026-07-20T12:05:00.000Z",
    });
  });

  it("returns the later combined blocker, not the first blocker", () => {
    const blockers = [
      {
        reason: "rolling_limit",
        availableAt: "2026-07-20T12:05:00.000Z",
      },
      {
        reason: "history_cooldown",
        availableAt: "2026-07-21T12:00:00.000Z",
      },
    ];

    expect(resolveSmsAiAvailability({ serverNow, blockers })).toEqual({
      reason: "history_cooldown",
      availableAt: "2026-07-21T12:00:00.000Z",
    });
  });

  it("ignores expired blockers and remains deterministic for equal timestamps", () => {
    const blockers = [
      { reason: "burst_limit", availableAt: "2026-07-20T11:59:00.000Z" },
      { reason: "rolling_limit", availableAt: "2026-07-20T12:10:00.000Z" },
      { reason: "history_cooldown", availableAt: "2026-07-20T12:10:00.000Z" },
    ];

    expect(resolveSmsAiAvailability({ serverNow, blockers })).toEqual({
      reason: "rolling_limit",
      availableAt: "2026-07-20T12:10:00.000Z",
    });
  });
});
