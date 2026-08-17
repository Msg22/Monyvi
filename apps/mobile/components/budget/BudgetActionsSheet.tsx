/**
 * BudgetActionsSheet Component
 *
 * Bottom sheet with budget management actions:
 * - Edit Budget
 * - Pause/Resume Budget (with toggle switch)
 * - Delete Budget (with confirmation)
 *
 * Architecture & Design Rationale:
 * - Uses absolute-positioned overlay instead of React Native Modal
 *   because Modal has a known layout collapse issue on Android
 *   with NativeWind v4 in this context.
 * - Delete confirmation also uses absolute overlay (not ConfirmationModal)
 *   for the same NativeWind v4 reason — Modal renders invisibly on this screen.
 * - Pattern: Overlay Component with action dispatch
 * - SOLID: SRP — only handles action selection, delegates execution to parent.
 *
 * @module BudgetActionsSheet
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetAction = "edit" | "pause" | "resume" | "delete";

interface BudgetActionsSheetProps {
  readonly visible: boolean;
  readonly isPaused: boolean;
  readonly canTogglePause?: boolean;
  readonly onClose: () => void;
  readonly onAction: (action: BudgetAction) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Styles — StyleSheet to avoid NativeWind issues inside overlay
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheetLight: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetDark: {
    backgroundColor: palette.slate[800],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center" as const,
    marginBottom: 16,
  },
  closeButton: {
    position: "absolute" as const,
    top: 16,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 16,
  },
  divider: {
    height: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "600" as const,
    marginStart: 16,
  },
  sublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: "center" as const,
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  // Delete confirmation overlay styles (absolute overlay, not Modal)
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  confirmCardLight: {
    backgroundColor: palette.slate[25],
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 340,
  },
  confirmCardDark: {
    backgroundColor: palette.slate[800],
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 340,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: "center" as const,
    marginBottom: 24,
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: "row" as const,
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center" as const,
  },
  confirmButtonLabel: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetActionsSheet({
  visible,
  isPaused,
  canTogglePause = true,
  onClose,
  onAction,
}: BudgetActionsSheetProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("budgets");
  const { t: tCommon } = useTranslation("common");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const insets = useSafeAreaInsets();

  // Dismiss on Android Back button
  useEffect(() => {
    if (!visible && !showDeleteConfirm) return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
        return true; // Consume the event
      }
    );

    return () => subscription.remove();
  }, [visible, showDeleteConfirm, onClose]);

  const handleDelete = useCallback((): void => {
    setShowDeleteConfirm(false);
    void onAction("delete");
  }, [onAction]);

  const handlePauseToggle = useCallback(async (): Promise<void> => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      await onAction(isPaused ? "resume" : "pause");
      onClose();
    } finally {
      setIsToggling(false);
    }
  }, [isPaused, onAction, onClose, isToggling]);

  // Colors based on theme
  const textColor = isDark ? "#f8fafc" : "#1e293b";
  const subtextColor = isDark ? palette.slate[500] : palette.slate[400];
  const dividerColor = isDark ? palette.slate[700] : palette.slate[200];
  const handleBarColor = isDark ? palette.slate[600] : palette.slate[300];
  const closeBg = isDark ? palette.slate[700] : palette.slate[100];
  const closeIcon = isDark ? palette.slate[300] : palette.slate[600];
  const iconColor = isDark ? palette.slate[300] : palette.slate[600];

  if (!visible && !showDeleteConfirm) {
    return <></>;
  }

  return (
    <>
      {visible && (
        <View style={styles.overlay}>
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>

          {/* Sheet */}
          <View
            style={[
              isDark ? styles.sheetDark : styles.sheetLight,
              { paddingBottom: Math.max(insets.bottom + 16, 32) },
            ]}
          >
            {/* Handle bar */}
            <View
              style={[styles.handleBar, { backgroundColor: handleBarColor }]}
            />

            {/* Close button */}
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={[styles.closeButton, { backgroundColor: closeBg }]}
            >
              <Ionicons name="close" size={18} color={closeIcon} />
            </TouchableOpacity>

            {/* Edit */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                void onAction("edit");
              }}
              activeOpacity={0.7}
              style={styles.row}
            >
              <Ionicons name="create-outline" size={20} color={iconColor} />
              <Text style={[styles.label, { color: textColor }]}>
                {t("edit_budget")}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />

            {canTogglePause ? (
              <>
                {/* Pause/Resume with toggle */}
                <View style={styles.row}>
                  <Ionicons
                    name={isPaused ? "play-circle" : "pause-circle"}
                    size={22}
                    color={palette.gold[500]}
                  />
                  <View style={{ flex: 1, marginStart: 16 }}>
                    <Text
                      style={[
                        { fontSize: 16, fontWeight: "600" },
                        { color: textColor },
                      ]}
                    >
                      {isPaused ? t("resume_budget") : t("pause_budget")}
                    </Text>
                    <Text style={[styles.sublabel, { color: subtextColor }]}>
                      {isPaused
                        ? t("continue_tracking_spending")
                        : t("temporarily_stop_tracking")}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      void handlePauseToggle();
                    }}
                    disabled={isToggling}
                    activeOpacity={0.7}
                    accessibilityRole="switch"
                    accessibilityState={{
                      checked: !isPaused,
                      busy: isToggling,
                    }}
                    accessibilityLabel={
                      isPaused
                        ? t("accessibility_resume_budget")
                        : t("accessibility_pause_budget")
                    }
                    style={[
                      styles.toggleTrack,
                      {
                        backgroundColor: !isPaused
                          ? palette.nileGreen[500]
                          : isDark
                            ? palette.slate[600]
                            : palette.slate[300],
                      },
                      isToggling && { opacity: 0.6 },
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        { alignSelf: !isPaused ? "flex-end" : "flex-start" },
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                <View
                  style={[styles.divider, { backgroundColor: dividerColor }]}
                />
              </>
            ) : null}

            {/* Delete */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                setShowDeleteConfirm(true);
              }}
              activeOpacity={0.7}
              style={styles.row}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={palette.red[500]}
              />
              <Text style={[styles.label, { color: palette.red[500] }]}>
                {t("delete_budget_title")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Delete Confirmation — absolute overlay (not Modal) to avoid NativeWind v4
          race condition that renders Modal content invisible on this screen */}
      {showDeleteConfirm && (
        <View style={styles.confirmOverlay}>
          <TouchableWithoutFeedback onPress={() => setShowDeleteConfirm(false)}>
            <View style={styles.confirmBackdrop} />
          </TouchableWithoutFeedback>

          <View
            style={[
              isDark ? styles.confirmCardDark : styles.confirmCardLight,
              { width: "85%" },
            ]}
          >
            <Text style={[styles.confirmTitle, { color: textColor }]}>
              {t("delete_budget_title")}
            </Text>
            <Text
              style={[
                styles.confirmMessage,
                { color: isDark ? palette.slate[400] : palette.slate[500] },
              ]}
            >
              {t("delete_budget_message")}
            </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                activeOpacity={0.7}
                style={[
                  styles.confirmButton,
                  {
                    backgroundColor: isDark
                      ? palette.slate[700]
                      : palette.slate[100],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.confirmButtonLabel,
                    {
                      color: isDark ? palette.slate[300] : palette.slate[600],
                    },
                  ]}
                >
                  {tCommon("cancel")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDelete}
                activeOpacity={0.7}
                style={[
                  styles.confirmButton,
                  { backgroundColor: palette.red[500] },
                ]}
              >
                <Text
                  style={[
                    styles.confirmButtonLabel,
                    { color: palette.slate[25] },
                  ]}
                >
                  {tCommon("delete")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}
