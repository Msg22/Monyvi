import React, { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

type RestoreTerminalKind = "sell" | "dispose";
type RestoreConsequenceId =
  | "active"
  | "sale-result"
  | "disposal-treatment"
  | "history";

export interface RestoreMetalHoldingCopy {
  readonly title: string;
  readonly back: string;
  readonly consequencesHeading: string;
  readonly reviewLabel: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly retryLabel: string;
}

export interface RestoreMetalHoldingSummary {
  readonly terminalKind: RestoreTerminalKind;
  readonly holdingName: string;
  readonly metalLabel: string;
  readonly purityLabel?: string;
  readonly physicalFormLabel?: string;
  readonly metadataLabel?: string;
  readonly statusLabel: string;
  readonly body: string;
  readonly consequences: ReadonlyArray<{
    readonly id: RestoreConsequenceId;
    readonly text: string;
  }>;
}

export interface RestoreMetalHoldingSheetProps {
  readonly visible: boolean;
  readonly copy: RestoreMetalHoldingCopy;
  readonly summary: RestoreMetalHoldingSummary;
  readonly bottomInset: number;
  readonly width: number;
  readonly fontScale: number;
  readonly isRtl: boolean;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRetry?: () => void;
  readonly attemptIdentity?: string;
  readonly holdingVisual?: React.ReactNode;
}

function ConsequenceRow({
  id,
  text,
  isRtl,
}: {
  readonly id: RestoreConsequenceId;
  readonly text: string;
  readonly isRtl: boolean;
}): React.JSX.Element {
  return (
    <View
      testID={`restore-consequence-${id}`}
      className={`min-h-12 items-center gap-4 p-4 ${
        isRtl ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-10 w-10 items-center justify-center rounded-full border border-nileGreen-500"
      >
        <Ionicons
          name={CONSEQUENCE_ICONS[id]}
          size={24}
          color={palette.nileGreen[500]}
        />
      </View>
      <Text
        className={`flex-1 text-base leading-6 text-text-primary dark:text-text-primary-dark ${isRtl ? "text-right" : "text-left"}`}
      >
        {text}
      </Text>
    </View>
  );
}

function HoldingSummary({
  summary,
  holdingVisual,
  isCompact,
  isRtl,
}: {
  readonly summary: RestoreMetalHoldingSummary;
  readonly holdingVisual?: React.ReactNode;
  readonly isCompact: boolean;
  readonly isRtl: boolean;
}): React.JSX.Element {
  const direction = isRtl ? "items-end" : "items-start";
  const metadataLabel =
    summary.metadataLabel ??
    [summary.purityLabel, summary.physicalFormLabel]
      .filter((label): label is string => typeof label === "string")
      .join(" · ");
  const layout = isCompact
    ? `flex-col ${direction}`
    : `${isRtl ? "flex-row-reverse" : "flex-row"} items-center`;
  return (
    <View
      testID="restore-holding-summary"
      className={`gap-4 rounded-2xl p-4 ${layout}`}
    >
      {holdingVisual}
      <View className={`${isCompact ? "w-full" : "flex-1"} gap-1 ${direction}`}>
        <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
          {summary.holdingName}
        </Text>
        <Text className="text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
          {summary.metalLabel} · {metadataLabel}
        </Text>
        <Text
          testID={`restore-holding-terminal-${summary.terminalKind}`}
          className="mt-1 rounded-xl border border-nileGreen-200 px-2 py-1 text-sm text-nileGreen-700 dark:border-nileGreen-700 dark:text-nileGreen-400"
        >
          {summary.statusLabel}
        </Text>
      </View>
    </View>
  );
}

export function RestoreMetalHoldingSheet({
  visible,
  copy,
  summary,
  bottomInset,
  width,
  fontScale,
  isRtl,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
  onRetry,
  attemptIdentity,
  holdingVisual,
}: RestoreMetalHoldingSheetProps): React.JSX.Element {
  const [isReviewed, setIsReviewed] = useState(false);
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const isReducedMotion = useReducedMotion();
  const requestClose = useCallback((): void => {
    if (!isPending) onCancel();
  }, [isPending, onCancel]);
  const toggleReviewed = useCallback((): void => {
    if (!isPending) setIsReviewed((current) => !current);
  }, [isPending]);
  const confirm = useCallback((): void => {
    if (isReviewed && !isPending) onConfirm();
  }, [isPending, isReviewed, onConfirm]);

  useEffect((): void => {
    setIsReviewed(false);
  }, [visible, attemptIdentity, summary.holdingName, summary.terminalKind]);

  const retry = useCallback((): void => {
    if (isReviewed && !isPending) (onRetry ?? onConfirm)();
  }, [isReviewed, isPending, onRetry, onConfirm]);

  return (
    <Modal
      testID="restore-holding-modal"
      visible={visible}
      animationType={isReducedMotion ? "none" : "fade"}
      presentationStyle="fullScreen"
      onRequestClose={requestClose}
    >
      <View
        testID="restore-holding-screen"
        className="flex-1 bg-slate-25 dark:bg-slate-900"
      >
        <View
          testID="restore-holding-dialog"
          accessible={false}
          accessibilityViewIsModal
          accessibilityLabel={copy.title}
          className="flex-1 bg-slate-25 dark:bg-slate-900"
        >
          <PageHeader
            title={copy.title}
            showBackButton
            onBack={requestClose}
            backAccessibilityLabel={copy.back}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            <View
              testID="restore-holding-content"
              className="w-full max-w-2xl self-center gap-6 px-4 pt-6"
              style={{ paddingBottom: bottomInset + 24 }}
            >
              <HoldingSummary
                summary={summary}
                holdingVisual={holdingVisual}
                isCompact={isCompact}
                isRtl={isRtl}
              />
              <Text
                className={`text-base leading-6 text-text-secondary dark:text-text-secondary-dark ${
                  isRtl ? "text-right" : "text-left"
                }`}
              >
                {summary.body}
              </Text>
              <View className="gap-3">
                <Text
                  accessibilityRole="header"
                  className={`text-lg font-semibold text-text-primary dark:text-text-primary-dark ${
                    isRtl ? "text-right" : "text-left"
                  }`}
                >
                  {copy.consequencesHeading}
                </Text>
                <View
                  testID="restore-consequence-card"
                  className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
                >
                  {summary.consequences.map((consequence, index) => (
                    <View
                      key={consequence.id}
                      className={
                        index === 0
                          ? ""
                          : "border-t border-slate-200 dark:border-slate-700"
                      }
                    >
                      <ConsequenceRow
                        id={consequence.id}
                        text={consequence.text}
                        isRtl={isRtl}
                      />
                    </View>
                  ))}
                </View>
              </View>
              {errorMessage ? (
                <View className="gap-2 rounded-2xl border border-red-200 p-4 dark:border-red-800">
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    className="text-sm text-red-700 dark:text-red-300"
                  >
                    {errorMessage}
                  </Text>
                  <TouchableOpacity
                    testID="restore-holding-retry"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !isReviewed || isPending }}
                    disabled={!isReviewed || isPending}
                    onPress={retry}
                    className="min-h-12 justify-center"
                  >
                    <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                      {copy.retryLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity
                testID="restore-holding-reviewed"
                accessibilityRole="checkbox"
                accessibilityLabel={copy.reviewLabel}
                accessibilityValue={{ text: copy.reviewLabel }}
                accessibilityState={{
                  checked: isReviewed,
                  disabled: isPending,
                }}
                disabled={isPending}
                onPress={toggleReviewed}
                className={`min-h-12 items-center gap-4 rounded-2xl border px-4 py-3 ${
                  isRtl ? "flex-row-reverse" : "flex-row"
                } ${
                  isReviewed
                    ? "border-nileGreen-700 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-slate-900"
                    : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-900"
                }`}
                style={isPending ? { opacity: 0.55 } : undefined}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className={`h-6 w-6 items-center justify-center rounded-md border ${
                    isReviewed
                      ? "border-nileGreen-700 bg-nileGreen-700 dark:border-nileGreen-400 dark:bg-nileGreen-400"
                      : "border-slate-400 dark:border-slate-500"
                  }`}
                >
                  {isReviewed ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={palette.slate[25]}
                    />
                  ) : null}
                </View>
                <Text
                  className={`flex-1 text-base leading-6 text-text-primary dark:text-text-primary-dark ${isRtl ? "text-right" : "text-left"}`}
                >
                  {copy.reviewLabel}
                </Text>
              </TouchableOpacity>
              {isPending ? (
                <View
                  testID="restore-holding-status"
                  accessibilityRole="progressbar"
                  accessibilityLabel={copy.pendingLabel}
                  accessibilityState={{ busy: true }}
                  accessibilityLiveRegion="polite"
                >
                  <Skeleton width="100%" height={12} />
                </View>
              ) : null}
              <TouchableOpacity
                testID="restore-holding-confirm"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !isReviewed || isPending,
                  busy: isPending,
                }}
                disabled={!isReviewed || isPending}
                onPress={confirm}
                className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-5 py-3 dark:bg-nileGreen-500"
                style={!isReviewed || isPending ? { opacity: 0.55 } : undefined}
              >
                <Text className="text-base font-bold text-slate-25 dark:text-slate-950">
                  {isPending ? copy.pendingLabel : copy.confirmLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="restore-holding-cancel"
                accessibilityRole="button"
                accessibilityState={{ disabled: isPending }}
                disabled={isPending}
                onPress={requestClose}
                className="min-h-12 items-center justify-center rounded-2xl border border-nileGreen-700 px-5 py-3 dark:border-nileGreen-400"
                style={isPending ? { opacity: 0.55 } : undefined}
              >
                <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                  {copy.cancelLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const CONSEQUENCE_ICONS = {
  active: "checkmark",
  "sale-result": "trending-up-outline",
  "disposal-treatment": "return-up-back-outline",
  history: "time-outline",
} as const;
