import { selectSmsAiWork } from "../sms-ai-work-selector";

describe("SMS AI capacity selection", () => {
  it("selects newest candidates first with a stable fingerprint tie-breaker", () => {
    const result = selectSmsAiWork(
      [
        { fingerprint: "c", receivedAtMs: 100 },
        { fingerprint: "b", receivedAtMs: 200 },
        { fingerprint: "a", receivedAtMs: 200 },
        { fingerprint: "d", receivedAtMs: 50 },
      ],
      2
    );

    expect(result.admitted.map(({ fingerprint }) => fingerprint)).toEqual([
      "a",
      "b",
    ]);
    expect(result.deferred.map(({ fingerprint }) => fingerprint)).toEqual([
      "c",
      "d",
    ]);
  });

  it("does not mutate the caller's array", () => {
    const candidates = [
      { fingerprint: "old", receivedAtMs: 1 },
      { fingerprint: "new", receivedAtMs: 2 },
    ] as const;

    selectSmsAiWork(candidates, 1);
    expect(candidates[0].fingerprint).toBe("old");
  });
});
