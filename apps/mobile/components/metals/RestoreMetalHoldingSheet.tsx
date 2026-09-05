import React, { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
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
  readonly localFirstMessage: string;
}

export interface RestoreMetalHoldingSummary {
  readonly terminalKind: RestoreTerminalKind;
  readonly holdingName: string;
  readonly metalLabel: string;
  readonly purityLabel: string;
  readonly physicalFormLabel: string;
  readonly statusLabel: string;
  readonly body: string;
  readonly consequences: readonly {
    readonly id: RestoreConsequenceId;
    readonly text: string;
  }[];
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
      className={`min-h-12 items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800 ${
        isRtl ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <View
        accessibilityElementsHidden
        className="h-2.5 w-2.5 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400"
      />
      <Text className="flex-1 text-sm leading-5 text-text-primary dark:text-text-primary-dark">
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
  const layout = isCompact
    ? `flex-col ${direction}`
    : `${isRtl ? "flex-row-reverse" : "flex-row"} ${direction}`;
  return (
    <View
      testID="restore-holding-summary"
      className={`gap-4 rounded-3xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-800 dark:bg-slate-900 ${layout}`}
    >
      {holdingVisual}
      <View className={`flex-1 gap-1 ${direction}`}>
        <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
          {summary.holdingName}
        </Text>
        <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
          {summary.metalLabel} · {summary.purityLabel} ·{" "}
          {summary.physicalFormLabel}
        </Text>
        <Text
          testID={`restore-holding-terminal-${summary.terminalKind}`}
          className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300"
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
  holdingVisual,
}: RestoreMetalHoldingSheetProps): React.JSX.Element {
  const [isReviewed, setIsReviewed] = useState(false);
  const isCompact = shouldUseCompactLayout(width, fontScale);
  const requestClose = useCallback((): void => {
    if (!isPending) onCancel();
  }, [isPending, onCancel]);
  const toggleReviewed = useCallback((): void => {
    if (!isPending) setIsReviewed((current) => !current);
  }, [isPending]);
  const confirm = useCallback((): void => {
    if (isReviewed && !isPending) onConfirm();
  }, [isPending, isReviewed, onConfirm]);

  useEffect(() => {
    if (!visible) setIsReviewed(false);
  }, [visible, summary.holdingName, summary.terminalKind]);

  return (
    <Modal
      testID="restore-holding-modal"
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={requestClose}
    >
      <View
        testID="restore-holding-screen"
        className="flex-1 bg-slate-25 dark:bg-slate-950"
      >
        <View
          testID="restore-holding-dialog"
          accessible={false}
          accessibilityViewIsModal
          accessibilityLabel={copy.title}
          className="flex-1 bg-slate-25 dark:bg-slate-950"
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
              className="gap-6 px-5 pt-5"
              style={{ paddingBottom: bottomInset + 24 }}
            >
              <HoldingSummary
                summary={summary}
                holdingVisual={holdingVisual}
                isCompact={isCompact}
                isRtl={isRtl}
              />
              <Text
                className={`text-sm leading-6 text-text-secondary dark:text-text-secondary-dark ${
                  isRtl ? "text-right" : "text-left"
                }`}
              >
                {summary.body}
              </Text>
              <View className="gap-3">
                <Text
                  className={`text-base font-bold text-text-primary dark:text-text-primary-dark ${
                    isRtl ? "text-right" : "text-left"
                  }`}
                >
                  {copy.consequencesHeading}
                </Text>
                {summary.consequences.map((consequence) => (
                  <ConsequenceRow
                    key={consequence.id}
                    id={consequence.id}
                    text={consequence.text}
                    isRtl={isRtl}
                  />
                ))}
              </View>
              <View className="rounded-2xl border border-nileGreen-200 bg-nileGreen-50 p-4 dark:border-nileGreen-800 dark:bg-slate-900">
                <Text className="text-sm leading-5 text-nileGreen-900 dark:text-nileGreen-300">
                  {copy.localFirstMessage}
                </Text>
              </View>
              {errorMessage ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  {errorMessage}
                </Text>
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
                className={`min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 ${
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
                  className={`h-5 w-5 rounded-md border ${
                    isReviewed
                      ? "border-nileGreen-700 bg-nileGreen-700 dark:border-nileGreen-400 dark:bg-nileGreen-400"
                      : "border-slate-400 dark:border-slate-500"
                  }`}
                />
                <Text className="flex-1 text-sm font-medium text-text-primary dark:text-text-primary-dark">
                  {copy.reviewLabel}
                </Text>
              </TouchableOpacity>
              {isPending ? (
                <View
                  testID="restore-holding-status"
                  accessibilityRole="progressbar"
                  accessibilityLabel={copy.pendingLabel}
                  accessibilityState={{ busy: true }}
                />
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
                className="min-h-12 items-center justify-center rounded-2xl px-5 py-3"
                style={isPending ? { opacity: 0.55 } : undefined}
              >
                <Text className="font-semibold text-text-secondary dark:text-text-secondary-dark">
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
