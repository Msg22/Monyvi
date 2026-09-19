/**
 * UI Constants for consistent spacing and sizing across the app
 */

/** Shared viewport breakpoints for approved responsive compositions. */
export const RESPONSIVE_BREAKPOINTS = {
  compactPhone: 340,
  tablet: 600,
} as const;

/** Above this scale, stack dense rows to preserve readable touch targets. */
export const RESPONSIVE_FONT_SCALE = {
  denseLayout: 1.35,
} as const;

export function shouldUseCompactLayout(
  width: number,
  fontScale: number
): boolean {
  return (
    width < RESPONSIVE_BREAKPOINTS.compactPhone ||
    fontScale > RESPONSIVE_FONT_SCALE.denseLayout
  );
}
/** Height of the custom bottom tab bar including safe area */
export const TAB_BAR_HEIGHT = 80;

/** Size of the central microphone button */
export const MIC_BUTTON_SIZE = 64;

/** Size of quick action buttons */
export const QUICK_ACTION_SIZE = 48;

/** Visible diameter of the floating quick-action control. */
export const QUICK_ACTION_FAB_SIZE = 56;

/** Breathing room kept between scroll content and floating tab controls. */
export const TAB_CONTENT_BOTTOM_GUTTER = 24;

/**
 * Keeps final scroll content above both the raised microphone and quick-action
 * controls that sit over the absolute tab bar.
 */
export function getTabContentBottomClearance(tabBarHeight: number): number {
  const raisedMicClearance = MIC_BUTTON_SIZE / 2 - 8;
  return (
    tabBarHeight +
    Math.max(raisedMicClearance, QUICK_ACTION_FAB_SIZE) +
    TAB_CONTENT_BOTTOM_GUTTER
  );
}

/** Tab bar blur intensity */
export const TAB_BAR_BLUR_INTENSITY = 80;

/** Animation spring config for quick actions */
export const QUICK_ACTION_SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.8,
} as const;
