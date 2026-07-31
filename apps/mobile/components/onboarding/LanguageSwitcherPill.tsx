/**
 * LanguageSwitcherPill — inline language picker for pre-auth surfaces.
 *
 * Shows the CURRENT language with a chevron-down icon — the user can tell
 * at a glance which language they're in, and that the pill is a picker
 * (not a toggle) per the 2026-04-26 user direction.
 *
 * On tap, an anchored popover opens directly underneath the pill with one
 * row per supported locale. Selecting a row writes the device-scoped
 * `@monyvi/intro-locale-override` AsyncStorage key (FR-030) and applies the
 * change to the runtime via `changeLanguage`. Selecting the language
 * that's already active simply closes the popover (no-op, no spurious
 * RTL reload).
 *
 * ## Why a Modal (and not the absolute-overlay pattern from
 * `.claude/rules/android-modal-overlay-pattern.md`)?
 *
 * The pill is a small inline component (top-bar of `PitchSlide`,
 * `CurrencyStep`, etc). When we tried the absolute-overlay pattern, the
 * `absoluteFillObject` filled the pill's IMMEDIATE parent (a `flex-row`
 * top bar) — not the screen — so:
 *   1. Tap-outside-to-close didn't fire when the user tapped below the
 *      top bar (the backdrop wasn't there to receive it).
 *   2. Window-absolute coords from `measureInWindow` were re-interpreted
 *      as parent-local, so the popover landed in the wrong place.
 *
 * `<Modal transparent>` renders into a screen-spanning native window, so
 * window-absolute coords map 1:1 and the backdrop genuinely covers the
 * whole screen. The Android-collapse rule warns about NativeWind v4
 * `bg-color/opacity` classes on `Pressable`/`TouchableOpacity` *inside*
 * the Modal — we use `StyleSheet` for everything inside the Modal here,
 * so the warning doesn't apply.
 *
 * Approved auth redesign uses a detached premium card with a 12 px gap so
 * locale options never cover the trigger.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  I18nManager,
  Modal,
  Platform,
  StatusBar,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutRectangle,
  type View as RNView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { arabicFontFamily, fontFamily } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useIntroLocaleOverride } from "@/hooks/useIntroLocaleOverride";
import { setIntroLocaleOverride } from "@/services/intro-flag-service";
import { setPreferredLanguage } from "@/services/profile-service";
import { logger } from "@/utils/logger";

type SupportedLocale = "en" | "ar";

interface LocaleOption {
  readonly code: SupportedLocale;
  /** Native-label name shown in the popover (always self-named, never
   *  translated, so a user lost in another language can find their own). */
  readonly nativeLabel: string;
}

const LOCALES: readonly LocaleOption[] = [
  { code: "en", nativeLabel: "English" },
  { code: "ar", nativeLabel: "العربية" },
];

const PILL_WIDTH_FALLBACK = 80;
const POPOVER_WIDTH = 194;
const POPOVER_MARGIN_TOP = 12;
const POPOVER_EDGE_MARGIN = 8;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  popoverBase: {
    position: "absolute",
    width: POPOVER_WIDTH,
    borderRadius: 17,
    borderWidth: 1,
    padding: 6,
    shadowColor: palette.slate[950],
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 23,
    elevation: 12,
  },
  popoverLight: {
    backgroundColor: palette.slate[25],
    borderColor: palette.slate[200],
    shadowOpacity: 0.17,
  },
  popoverDark: {
    backgroundColor: palette.slate[800],
    borderColor: palette.slate[700],
    shadowOpacity: 0.52,
  },
  optionRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  optionSelectedLight: {
    backgroundColor: palette.nileGreen[50],
  },
  optionSelectedDark: {
    backgroundColor: `${palette.nileGreen[400]}21`,
  },
  optionLabel: {
    flex: 1,
    fontSize: 13,
  },
  codeBadge: {
    minWidth: 27,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 7,
  },
  codeBadgeLight: {
    borderColor: palette.slate[200],
  },
  codeBadgeDark: {
    borderColor: palette.slate[600],
  },
  codeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  codeTextLight: {
    color: palette.slate[500],
  },
  codeTextDark: {
    color: palette.slate[400],
  },
  selectionSlot: {
    width: 18,
    height: 18,
  },
  checkCircleLight: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: palette.nileGreen[600],
  },
  checkCircleDark: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: palette.nileGreen[400],
  },
});

/**
 * Compute the popover's horizontal position so it visually aligns with
 * the pill AND stays on-screen.
 *
 * Default behavior: align the popover's leading edge with the pill's
 * leading edge (LTR: left edges align, RTL: right edges align). If that
 * would push the popover off-screen, clamp to the opposite alignment.
 */
function computePopoverLeft(
  pill: LayoutRectangle,
  screenWidth: number
): number {
  const isRTL = I18nManager.isRTL;
  // Default — align leading edge.
  const defaultLeft = isRTL ? pill.x + pill.width - POPOVER_WIDTH : pill.x;
  // Clamp into [POPOVER_EDGE_MARGIN, screenWidth - POPOVER_WIDTH - POPOVER_EDGE_MARGIN].
  const minLeft = POPOVER_EDGE_MARGIN;
  const maxLeft = screenWidth - POPOVER_WIDTH - POPOVER_EDGE_MARGIN;
  return Math.max(minLeft, Math.min(defaultLeft, maxLeft));
}

export function LanguageSwitcherPill(): React.ReactElement {
  const { i18n } = useTranslation();
  const { t: tCommon } = useTranslation("common");
  const { isDark } = useTheme();
  const { setOverride } = useIntroLocaleOverride();
  // Used to decide whether the language change must ALSO be persisted to
  // the user's profile. Pre-auth callers (slides, auth screen) have no
  // profile yet — `setOverride` alone is correct. Post-auth callers
  // (CurrencyStep, in-app settings) MUST also update
  // `profile.preferred_language`, otherwise `AppReadyGate` re-syncs i18n
  // back to the stale profile value on the next reload (the 2026-04-26
  // user-reported bug where Arabic in Currency-step "didn't stick").
  const { isAuthenticated } = useAuth();
  const pillRef = useRef<RNView | null>(null);
  const [pillRect, setPillRect] = useState<LayoutRectangle | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const { width: screenWidth } = useWindowDimensions();

  const currentLang: SupportedLocale = i18n.language === "ar" ? "ar" : "en";

  /**
   * Open the popover after measuring the pill's screen position. We
   * measure on press (rather than `onLayout`) because `measureInWindow`
   * can return 0×0 during the initial render in a Stack screen — the
   * same race that `AnchoredTooltip` works around.
   */
  const handlePress = useCallback((): void => {
    if (isChanging) return;
    pillRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) {
        // Defensive — bail rather than render a popover at (0,0).
        logger.warn("LanguageSwitcherPill.measure.zero");
        return;
      }
      setPillRect({ x, y, width, height });
      setIsOpen(true);
    });
  }, [isChanging]);

  const handleClose = useCallback((): void => {
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(
    (lang: SupportedLocale): void => {
      handleClose();
      // No-op if the user picked the language that's already active.
      // `changeLanguage` would still trigger the i18next event chain and
      // potentially an unnecessary RTL reload check. Skip it cleanly.
      if (lang === currentLang) {
        return;
      }
      setIsChanging(true);
      // Always write the override first so a cold launch (after the RTL
      // reload) starts in the right language. Then, when authenticated,
      // also persist to the profile so `AppReadyGate` won't override it
      // back. Order matters — if we wrote the profile first and the RTL
      // reload happened before the override write committed, AsyncStorage
      // would be one tick behind and the splash would show the old locale.
      //
      // Authenticated path uses `setIntroLocaleOverride` (raw service)
      // followed by `setPreferredLanguage`, so `changeLanguage` runs
      // exactly once (mirrors `app/settings.tsx`). Pre-auth path calls
      // the `useIntroLocaleOverride` hook's `setOverride`, which writes
      // the override AND calls `changeLanguage` itself — that's correct
      // because there's no profile to persist into pre-auth.
      void (async (): Promise<void> => {
        try {
          if (isAuthenticated) {
            await setIntroLocaleOverride(lang);
            await setPreferredLanguage(lang);
          } else {
            await setOverride(lang);
          }
        } catch (error: unknown) {
          logger.warn(
            "LanguageSwitcherPill.setOverride.failed",
            error instanceof Error ? { message: error.message } : { error }
          );
        } finally {
          setIsChanging(false);
        }
      })();
    },
    [currentLang, setOverride, handleClose, isAuthenticated]
  );

  const popoverLeft = pillRect ? computePopoverLeft(pillRect, screenWidth) : 0;
  const androidModalOffset =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
  // Modal content begins below Android's status bar while measureInWindow uses
  // window coordinates. Normalize that origin, then preserve approved 12 px gap.
  const popoverTop = pillRect
    ? pillRect.y + pillRect.height + POPOVER_MARGIN_TOP + androidModalOffset
    : 0;

  // RTL handling for the popover position.
  //
  // `popoverLeft` is computed in WINDOW coordinates (LTR-space, returned
  // by `measureInWindow`). But RN's `I18nManager.swapLeftAndRightInRTL`
  // defaults to `true` on Android (and iOS), which auto-swaps `left` and
  // `right` style values at render time when the layout direction is RTL.
  //
  // So writing `left: popoverLeft` in RTL gets converted to
  // `right: popoverLeft` (popover's right edge `popoverLeft` pixels from
  // the parent's RIGHT edge). With pill on the right side of the screen
  // in Arabic, that ends up putting the popover on the LEFT side — same
  // visual position the popover had in English, far from the pill.
  // (User-reported regression 2026-04-26.)
  //
  // Fix: in RTL, write the position using the `right` property. The
  // auto-swap converts it back to `left: popoverLeft` at render time, so
  // the popover lands at the same window-coord x where we computed it.
  const popoverPositionStyle = I18nManager.isRTL
    ? { right: popoverLeft, top: popoverTop }
    : { left: popoverLeft, top: popoverTop };

  return (
    <>
      <Pressable
        ref={pillRef}
        onPress={handlePress}
        disabled={isChanging}
        accessibilityRole="button"
        accessibilityState={{ disabled: isChanging, expanded: isOpen }}
        accessibilityLabel={`Language: ${currentLang.toUpperCase()}`}
        className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"
        style={{
          columnGap: 4,
          opacity: isChanging ? 0.6 : 1,
          minWidth: PILL_WIDTH_FALLBACK,
          justifyContent: "center",
        }}
      >
        <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">
          🌐
        </Text>
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {currentLang}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={12}
          color={isDark ? palette.slate[400] : palette.slate[500]}
        />
      </Pressable>

      {/* Popover Modal:
          - transparent: overlay the current screen without dimming.
          - animationType=none: instant open/close, a fade reads as sluggish.
          - onRequestClose: handles the Android hardware back button.
          - statusBarTranslucent remains false. Android's status-bar origin
            difference is normalized in `popoverTop`, preserving the approved
            visible gap without moving Modal content behind system UI. */}
      <Modal
        visible={isOpen && pillRect !== null}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        {/* Full-screen tap-target backdrop. Pressable with a StyleSheet
            style is the safe pattern inside Modal per the
            android-modal-overlay-pattern rule — we avoid bg-color/opacity
            classes here. */}
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={tCommon("close")}
        >
          {/* Popover. onStartShouldSetResponder claims the touch so taps
              INSIDE the popover do not bubble up to the backdrop onPress
              (which would close the popover before the row onPress fires). */}
          {pillRect && (
            <View
              testID="language-popover"
              style={[
                styles.popoverBase,
                isDark ? styles.popoverDark : styles.popoverLight,
                popoverPositionStyle,
              ]}
              onStartShouldSetResponder={() => true}
            >
              {(currentLang === "ar" ? [...LOCALES].reverse() : LOCALES).map(
                (option) => {
                  const isActive = option.code === currentLang;
                  const optionFontFamily =
                    option.code === "ar"
                      ? arabicFontFamily.semiBold
                      : fontFamily.semiBold;
                  const optionColor = isDark
                    ? isActive
                      ? palette.nileGreen[100]
                      : palette.slate[300]
                    : isActive
                      ? palette.nileGreen[700]
                      : palette.slate[700];

                  return (
                    <Pressable
                      key={option.code}
                      testID={`language-option-${option.code}`}
                      onPress={() => handleSelect(option.code)}
                      accessibilityRole="button"
                      accessibilityLabel={option.nativeLabel}
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.optionRow,
                        isActive &&
                          (isDark
                            ? styles.optionSelectedDark
                            : styles.optionSelectedLight),
                      ]}
                    >
                      <Text
                        testID={`language-label-${option.code}`}
                        style={[
                          styles.optionLabel,
                          {
                            color: optionColor,
                            fontFamily: optionFontFamily,
                            writingDirection:
                              option.code === "ar" ? "rtl" : "ltr",
                          },
                        ]}
                      >
                        {option.nativeLabel}
                      </Text>
                      <View
                        style={[
                          styles.codeBadge,
                          isDark ? styles.codeBadgeDark : styles.codeBadgeLight,
                        ]}
                      >
                        <Text
                          testID={`language-code-${option.code}`}
                          style={[
                            styles.codeText,
                            isDark ? styles.codeTextDark : styles.codeTextLight,
                          ]}
                        >
                          {option.code.toUpperCase()}
                        </Text>
                      </View>
                      {isActive ? (
                        <View
                          testID={`language-selected-check-${option.code}`}
                          style={
                            isDark
                              ? styles.checkCircleDark
                              : styles.checkCircleLight
                          }
                        >
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={
                              isDark
                                ? palette.nileGreen[900]
                                : palette.slate[25]
                            }
                          />
                        </View>
                      ) : (
                        <View style={styles.selectionSlot} />
                      )}
                    </Pressable>
                  );
                }
              )}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
