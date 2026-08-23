import {
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_FONT_SCALE,
  shouldUseCompactLayout,
} from "@/constants/ui";

describe("responsive UI contract", () => {
  it("keeps shared breakpoints explicit", () => {
    expect(RESPONSIVE_BREAKPOINTS.compactPhone).toBe(340);
    expect(RESPONSIVE_BREAKPOINTS.tablet).toBe(600);
    expect(RESPONSIVE_FONT_SCALE.denseLayout).toBe(1.35);
  });

  it("keeps dense layouts horizontal on ordinary phone widths", () => {
    expect(shouldUseCompactLayout(360, 1)).toBe(false);
  });

  it("stacks only for compact viewports or enlarged text", () => {
    expect(shouldUseCompactLayout(320, 1)).toBe(true);
    expect(shouldUseCompactLayout(360, 1.5)).toBe(true);
  });
});
