import { isOnOrBeforeDay } from "../date-boundary";

describe("isOnOrBeforeDay", () => {
  it("treats matching local calendar days as eligible despite different times", () => {
    expect(
      isOnOrBeforeDay(
        new Date(2026, 6, 1, 18, 0, 0),
        new Date(2026, 6, 1, 0, 0, 0)
      )
    ).toBe(true);
  });

  it("rejects a following local calendar day", () => {
    expect(
      isOnOrBeforeDay(
        new Date(2026, 6, 2, 0, 0, 0),
        new Date(2026, 6, 1, 23, 59, 59)
      )
    ).toBe(false);
  });
});
