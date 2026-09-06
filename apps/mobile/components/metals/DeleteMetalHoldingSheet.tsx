import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";

export interface DeleteMetalHoldingSheetCopy {
  readonly title: string;
  readonly consequence: string;
  readonly currentValue: string;
  readonly performance: string;
  readonly confirm: string;
  readonly pending: string;
  readonly cancel: string;
  readonly retry: string;
  readonly offline: string;
  readonly failure: string;
  readonly accessibilityLabel: string;
}

export interface DeleteMetalHoldingSheetProps {
  readonly visible: boolean;
  readonly holding: {
    readonly name: string;
    readonly description: string;
    readonly weightLabel: string;
    readonly currentValueLabel: string;
    readonly performanceLabel: string;
  };
  readonly copy: DeleteMetalHoldingSheetCopy;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly leftInset: number;
  readonly rightInset: number;
  readonly isRtl: boolean;
  readonly isOffline: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onFocusRequest?: (target: "heading" | "recovery") => void;
}

export function DeleteMetalHoldingSheet(
  props: DeleteMetalHoldingSheetProps
): React.JSX.Element | null {
  const headingRef = useRef<React.ElementRef<typeof Text>>(null);
  const recoveryRef = useRef<React.ElementRef<typeof Text>>(null);
  const { visible, submitError } = props;

  useEffect((): void => {
    if (visible) {
      requestAccessibilityFocus(
        "heading",
        headingRef.current,
        props.onFocusRequest
      );
    }
  }, [props.onFocusRequest, visible]);

  useEffect((): void => {
    if (visible && submitError) {
      requestAccessibilityFocus(
        "recovery",
        recoveryRef.current,
        props.onFocusRequest
      );
    }
  }, [props.onFocusRequest, submitError, visible]);

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      visible
      onRequestClose={() => {
        if (!props.isSubmitting) props.onCancel();
      }}
    >
      <View
        testID="metal-holding-delete-sheet"
        accessibilityViewIsModal
        importantForAccessibility="yes"
        className="absolute inset-0 z-50 justify-end"
      >
        <TouchableOpacity
          testID="metal-holding-delete-backdrop"
          accessible={false}
          disabled={props.isSubmitting}
          onPress={props.onCancel}
          className="absolute inset-0"
        >
          <View className="flex-1 bg-slate-950/70" />
        </TouchableOpacity>
        <DeletePanel
          props={props}
          headingRef={headingRef}
          recoveryRef={recoveryRef}
        />
      </View>
    </Modal>
  );
}

function DeletePanel({
  props,
  headingRef,
  recoveryRef,
}: {
  readonly props: DeleteMetalHoldingSheetProps;
  readonly headingRef: React.RefObject<React.ElementRef<typeof Text> | null>;
  readonly recoveryRef: React.RefObject<React.ElementRef<typeof Text> | null>;
}): React.JSX.Element {
  const directionStyle = props.isRtl
    ? RTL_DIRECTION_STYLE
    : LTR_DIRECTION_STYLE;
  const factsClassName = shouldUseCompactLayout(props.width, props.fontScale)
    ? "gap-3"
    : "flex-row gap-3";
  return (
    <View
      testID="metal-holding-delete-panel"
      className="max-h-[90%] overflow-hidden rounded-t-3xl bg-slate-25 pt-3 dark:bg-slate-900"
      style={{
        paddingLeft: props.leftInset + 20,
        paddingRight: props.rightInset + 20,
      }}
    >
      <ScrollView
        testID="metal-holding-delete-scroll"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="shrink"
      >
        <View
          testID="metal-holding-delete-content"
          className="gap-4"
          style={directionStyle}
        >
          <View
            accessible={false}
            className="h-1 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-600"
          />
          <View className="items-center gap-2">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                name="trash-outline"
                size={28}
                color={palette.red[600]}
              />
            </View>
            <Text
              ref={headingRef}
              accessibilityRole="header"
              accessibilityLabel={props.copy.title}
              className="text-center text-xl font-bold text-text-primary dark:text-text-primary-dark"
            >
              {props.copy.title}
            </Text>
          </View>
          <HoldingFacts
            holding={props.holding}
            copy={props.copy}
            className={factsClassName}
          />
          <Text
            testID="metal-holding-delete-consequence"
            className="text-center text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
          >
            {props.copy.consequence}
          </Text>
          {props.submitError ? (
            <DeleteError
              message={props.copy.failure}
              copy={props.copy}
              recoveryRef={recoveryRef}
              isDisabled={props.isSubmitting}
              onRetry={props.onRetry}
            />
          ) : null}
          {props.isOffline ? (
            <Text className="text-center text-xs text-text-muted dark:text-text-muted-dark">
              {props.copy.offline}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <DeleteActions props={props} />
    </View>
  );
}

function HoldingFacts({
  holding,
  copy,
  className,
}: Pick<DeleteMetalHoldingSheetProps, "holding" | "copy"> & {
  readonly className: string;
}): React.JSX.Element {
  const accessibilityLabel = [
    holding.name,
    holding.description,
    holding.weightLabel,
    `${copy.currentValue}: ${holding.currentValueLabel}`,
    `${copy.performance}: ${holding.performanceLabel}`,
  ].join(". ");

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility="yes"
      testID="metal-holding-delete-holding-summary"
      className="gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
    >
      <View importantForAccessibility="no-hide-descendants">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-bold text-text-primary dark:text-text-primary-dark">
              {holding.name}
            </Text>
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {holding.description}
            </Text>
          </View>
          <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
            {holding.weightLabel}
          </Text>
        </View>
        <View testID="metal-holding-delete-facts" className={className}>
          <ValueFact
            label={copy.currentValue}
            value={holding.currentValueLabel}
            testID="metal-holding-delete-current-value"
          />
          <ValueFact
            label={copy.performance}
            value={holding.performanceLabel}
          />
        </View>
      </View>
    </View>
  );
}

function ValueFact({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID?: string;
}): React.JSX.Element {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-xs text-text-muted dark:text-text-muted-dark">
        {label}
      </Text>
      <Text
        testID={testID}
        className="text-sm font-bold text-text-primary dark:text-text-primary-dark"
      >
        {value}
      </Text>
    </View>
  );
}

function DeleteError({
  message,
  copy,
  recoveryRef,
  isDisabled,
  onRetry,
}: {
  readonly message: string;
  readonly copy: DeleteMetalHoldingSheetCopy;
  readonly recoveryRef: React.RefObject<React.ElementRef<typeof Text> | null>;
  readonly isDisabled: boolean;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
      <Text
        ref={recoveryRef}
        accessibilityRole="alert"
        className="text-sm text-red-700 dark:text-red-300"
      >
        {message}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.retry}
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onRetry}
        className="min-h-11 self-start justify-center"
      >
        <Text className="font-bold text-red-700 dark:text-red-300">
          {copy.retry}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function DeleteActions({
  props,
}: {
  readonly props: DeleteMetalHoldingSheetProps;
}): React.JSX.Element {
  const confirmLabel = props.isSubmitting
    ? props.copy.pending
    : props.copy.accessibilityLabel;
  return (
    <View
      testID="metal-holding-delete-actions"
      className="gap-3 pt-5"
      style={{ paddingBottom: props.bottomInset + 20 }}
    >
      <TouchableOpacity
        testID="metal-holding-delete-confirm"
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        accessibilityState={{
          disabled: props.isSubmitting,
          busy: props.isSubmitting,
        }}
        disabled={props.isSubmitting}
        onPress={props.onConfirm}
        className="min-h-11 items-center justify-center rounded-2xl bg-red-600 px-4 dark:bg-red-500"
      >
        <View
          testID="metal-holding-delete-confirm-target"
          className="min-h-11 w-full items-center justify-center"
        >
          <Text className="font-bold text-slate-25">
            {props.isSubmitting ? props.copy.pending : props.copy.confirm}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={props.copy.cancel}
        accessibilityState={{ disabled: props.isSubmitting }}
        disabled={props.isSubmitting}
        onPress={props.onCancel}
        className="min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 dark:border-slate-700"
      >
        <View
          testID="metal-holding-delete-cancel-target"
          className="min-h-11 w-full items-center justify-center"
        >
          <Text className="font-semibold text-text-secondary dark:text-text-secondary-dark">
            {props.copy.cancel}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function requestAccessibilityFocus(
  targetName: "heading" | "recovery",
  target: React.ElementRef<typeof Text> | null,
  onFocusRequest?: (target: "heading" | "recovery") => void
): void {
  if (onFocusRequest) {
    onFocusRequest(targetName);
    return;
  }
  if (!target) return;
  const node = findNodeHandle(target);
  if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
}

const RTL_DIRECTION_STYLE: ViewStyle = { direction: "rtl" };
const LTR_DIRECTION_STYLE: ViewStyle = { direction: "ltr" };
