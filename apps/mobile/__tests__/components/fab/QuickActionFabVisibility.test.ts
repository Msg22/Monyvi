import { shouldHideQuickActionFab } from "@/components/fab/QuickActionFab";

describe("QuickActionFab visibility", () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])(
    "recording=%s suppressed=%s returns %s",
    (isRecordingActive, isSuppressed, expected) => {
      expect(
        shouldHideQuickActionFab(isRecordingActive, isSuppressed)
      ).toBe(expected);
    }
  );
});
