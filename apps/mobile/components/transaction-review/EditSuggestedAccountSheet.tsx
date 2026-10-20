/**
 * #395 T031 B1 R1-07 — controlled visibility/permissions, local form draft.
 * No persistence, account-eligibility, group reducer or currency mutation.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { TextField } from "@/components/ui/TextField";
import {
  displayIdentity,
  ReviewActionButton,
  ReviewPointerBackdrop,
  ReviewSheetHandle,
  reviewCopy,
  type ReviewDisplayLanguage,
} from "./shared-account-presentation";
import { useTranslation } from "react-i18next";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import { ReviewInlineNotice } from "./ReviewInlineNotice";

export interface EditSuggestedAccountSheetProps {
  readonly visible: boolean;
  readonly groupId: string;
  readonly groupName: string;
  readonly currentTypeOptionId: string;
  readonly allowedTypeOptions: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }>;
  readonly lockedCurrencyLabel: string;
  readonly identitySummary: string;
  readonly linkedCount: number;
  readonly canSubmit: boolean;
  readonly isBusy: boolean;
  readonly validationMessage: string | null;
  readonly reviewFeedback?: ReviewFeedbackBoundary;
  readonly onSubmit: (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }) => void;
  readonly onReplace: () => void;
  readonly onCancel: () => void;
}
function EditSheetHeader({
  groupName,
  linkedCount,
  onClose,
  language,
}: {
  readonly groupName: string;
  readonly linkedCount: number;
  readonly onClose: () => void;
  readonly language: ReviewDisplayLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  return (
    <View className="mb-4 gap-2">
      <View
        className={
          rtl
            ? "flex-row-reverse items-start gap-3"
            : "flex-row items-start gap-3"
        }
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text
            accessibilityRole="header"
            className={
              "text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark " +
              (rtl ? "text-right" : "text-left")
            }
          >
            {reviewCopy("account_review_group_edit_title", language)}
          </Text>
          <Text
            className={
              "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
              (rtl ? "text-right" : "text-left")
            }
          >
            {displayIdentity(groupName, language)} · {linkedCount}{" "}
            {reviewCopy("account_review_group_linked", language)}
          </Text>
        </View>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={reviewCopy(
            "account_review_group_editor_close_a11y",
            language
          )}
          testID="account-review-group-edit-close"
          className="h-11 w-11 items-center justify-center rounded-lg"
          onPress={onClose}
          activeOpacity={0.75}
        >
          <Ionicons
            name="close-outline"
            size={22}
            color={palette.slate[500]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
function EditNameField({
  value,
  onChange,
  onFocus,
  onBlur,
  language,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
}): React.JSX.Element {
  const rtl = language === "ar";
  const direction: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  const label = reviewCopy("account_review_group_name", language);
  return (
    <TextField
      testID="account-review-group-edit-name"
      label={label}
      value={value}
      onChangeText={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      editable={!disabled}
      autoCapitalize="words"
      returnKeyType="done"
      accessibilityLabel={label}
      required
      variant="outlined"
      containerClassName="mb-0"
      className="min-h-12"
      style={{ writingDirection: direction }}
    />
  );
}
interface TypePickerProps {
  readonly options: EditSuggestedAccountSheetProps["allowedTypeOptions"];
  readonly currentId: string;
  readonly onSelect: (id: string) => void;
  readonly language: ReviewDisplayLanguage;
  readonly disabled: boolean;
}
function EditTypePicker(props: TypePickerProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const rtl = props.language === "ar";
  const { t } = useTranslation("common");
  const chosen = props.options.find((option) => option.id === props.currentId);
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark">
        {reviewCopy("account_review_group_type", props.language)}
        <Text className="text-red-500">{" *"}</Text>
      </Text>
      <TouchableOpacity
        testID="account-review-group-edit-type"
        accessible
        accessibilityRole="button"
        accessibilityLabel={reviewCopy(
          "account_review_group_type",
          props.language
        )}
        accessibilityHint={t("required_field")}
        accessibilityState={{ expanded, disabled: props.disabled }}
        disabled={props.disabled}
        onPress={() => setExpanded((value) => !value)}
        className={
          (rtl ? "flex-row-reverse " : "flex-row ") +
          "min-h-12 items-center justify-between rounded-lg border border-border px-3 dark:border-border-dark"
        }
      >
        <Text className="text-base text-text-primary dark:text-text-primary-dark">
          {chosen?.label ?? props.currentId}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={20}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
      {expanded && !props.disabled ? (
        <View className="gap-1 rounded-lg border border-border p-1 dark:border-border-dark">
          {props.options.map((option) => {
            const isSelected = option.id === props.currentId;
            return (
              <TouchableOpacity
                key={option.id}
                testID={`account-review-group-edit-type-option-${option.id}`}
                accessible
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: isSelected }}
                onPress={() => {
                  props.onSelect(option.id);
                  setExpanded(false);
                }}
                className={
                  (rtl ? "flex-row-reverse " : "flex-row ") +
                  "min-h-11 items-center justify-between rounded-md border px-3 " +
                  (isSelected
                    ? "border-nileGreen-500 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-nileGreen-900"
                    : "border-transparent")
                }
              >
                <Text
                  className={
                    "min-w-0 flex-1 text-base leading-6 " +
                    (isSelected
                      ? "font-semibold text-nileGreen-700 dark:text-nileGreen-300"
                      : "text-text-primary dark:text-text-primary-dark")
                  }
                >
                  {option.label}
                </Text>
                {isSelected ? (
                  <Ionicons
                    testID="account-review-group-edit-selected-type-check"
                    name="checkmark"
                    size={20}
                    color={palette.nileGreen[500]}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
function LockedCurrencyField({
  label,
  language,
}: {
  readonly label: string;
  readonly language: ReviewDisplayLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark">
        {reviewCopy("account_review_group_locked_currency", language)}
      </Text>
      <View
        testID="account-review-group-locked-currency"
        accessible
        accessibilityRole="text"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={
          reviewCopy("account_review_group_locked_currency", language) +
          " " +
          label
        }
        className={
          (rtl ? "flex-row-reverse " : "flex-row ") +
          "min-h-12 items-center justify-between rounded-lg border border-border bg-slate-100 px-3 dark:border-border-dark dark:bg-slate-800"
        }
      >
        <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
          {displayIdentity(label, language)}
        </Text>
        <Ionicons
          name="lock-closed-outline"
          size={20}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
    </View>
  );
}
interface EditorFooterProps {
  readonly language: ReviewDisplayLanguage;
  readonly canSubmit: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}
function EditorFooter(props: EditorFooterProps): React.JSX.Element {
  const cancelLabel = reviewCopy(
    "account_review_group_edit_cancel",
    props.language
  );
  const submitLabel = reviewCopy(
    "account_review_group_edit_submit",
    props.language
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [cancelTextWidth, setCancelTextWidth] = useState(0);
  const [submitTextWidth, setSubmitTextWidth] = useState(0);
  // Measure the actual localized labels and container; the buttons keep their
  // existing 12dp horizontal padding, 12dp gap and natural text scaling.
  const shouldStack =
    containerWidth > 0 &&
    cancelTextWidth > 0 &&
    submitTextWidth > 0 &&
    containerWidth - 40 < cancelTextWidth + submitTextWidth + 48 + 12;
  return (
    <View
      testID="account-review-group-edit-footer"
      className={
        "relative w-full max-w-[350px] self-center shrink-0 gap-3 px-5 pt-2 pb-3 " +
        (shouldStack
          ? "flex-col"
          : props.language === "ar"
            ? "flex-row-reverse"
            : "flex-row")
      }
      onLayout={(event) => {
        const measured = Math.round(event.nativeEvent.layout.width);
        setContainerWidth((current) =>
          current === measured ? current : measured
        );
      }}
    >
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute start-0 top-0 flex-row opacity-0"
      >
        <Text
          testID="account-review-edit-cancel-measure"
          className="text-base font-semibold leading-6"
          onLayout={(event) => {
            const measured = Math.ceil(event.nativeEvent.layout.width);
            setCancelTextWidth((current) =>
              current === measured ? current : measured
            );
          }}
        >
          {cancelLabel}
        </Text>
        <Text
          testID="account-review-edit-submit-measure"
          className="text-base font-semibold leading-6"
          onLayout={(event) => {
            const measured = Math.ceil(event.nativeEvent.layout.width);
            setSubmitTextWidth((current) =>
              current === measured ? current : measured
            );
          }}
        >
          {submitLabel}
        </Text>
      </View>
      <View className={shouldStack ? "w-full" : "min-w-0 flex-1"}>
        <ReviewActionButton
          label={cancelLabel}
          tone="outline"
          onPress={props.onCancel}
        />
      </View>
      <View className={shouldStack ? "w-full" : "min-w-0 flex-1"}>
        <ReviewActionButton
          testID="account-review-group-edit-submit"
          label={submitLabel}
          tone="primary"
          disabled={!props.canSubmit}
          onPress={props.onSubmit}
        />
      </View>
    </View>
  );
}
interface EditSheetSurfaceProps {
  readonly source: EditSuggestedAccountSheetProps;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly typeOptionId: string;
  readonly setTypeOptionId: (id: string) => void;
  readonly canSubmit: boolean;
  readonly language: ReviewDisplayLanguage;
  readonly bottomInset: number;
  readonly maxHeight: number;
  readonly submit: () => void;
}
function EditSheetSurface(p: EditSheetSurfaceProps): React.JSX.Element {
  const source = p.source;
  const scrollRef = React.useRef<ScrollView>(null);
  const [handleHeight, setHandleHeight] = React.useState(0);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const [footerHeight, setFooterHeight] = React.useState(0);
  // The name field is min-h-12. Keep room for that actual control rather
  // than letting fixed header/notice/footer consume the entire scroll body.
  const shouldScrollFooter =
    handleHeight > 0 &&
    headerHeight > 0 &&
    footerHeight > 0 &&
    p.maxHeight - p.bottomInset - handleHeight - headerHeight - footerHeight <
      48;
  const isNameFocused = React.useRef(false);
  const scrollViewportHeight = React.useRef<number | null>(null);
  const nameBounds = React.useRef<{
    readonly y: number;
    readonly height: number;
  } | null>(null);
  const revealFocusedName = React.useCallback((): void => {
    if (Platform.OS !== "android" || !isNameFocused.current) return;
    const bounds = nameBounds.current;
    const viewport = scrollViewportHeight.current;
    if (!bounds || viewport === null || viewport <= 0) return;
    // Relative to the real scroll-content layout, not a guessed header height.
    const requiredOffset = Math.max(
      0,
      Math.ceil(bounds.y + bounds.height + 12 - viewport)
    );
    scrollRef.current?.scrollTo({ y: requiredOffset, animated: true });
  }, []);
  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = Keyboard.addListener("keyboardDidShow", revealFocusedName);
    return () => listener.remove();
  }, [revealFocusedName]);
  const footer = (
    <View
      testID="account-review-group-edit-footer-region"
      className={shouldScrollFooter ? "-mx-5" : undefined}
      onLayout={(event) => {
        // Retain the measured fixed-footer height while it is in the scroll
        // body; changes in scroll-content width must not toggle the layout.
        if (shouldScrollFooter) return;
        const height = Math.round(event.nativeEvent.layout.height);
        setFooterHeight((current) => (current === height ? current : height));
      }}
    >
      <EditorFooter
        language={p.language}
        canSubmit={p.canSubmit}
        onCancel={source.onCancel}
        onSubmit={p.submit}
      />
    </View>
  );
  return (
    <View
      testID="account-review-group-edit-sheet"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      className="w-full min-h-0 overflow-hidden rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      style={{ maxHeight: p.maxHeight, paddingBottom: p.bottomInset }}
    >
      <View
        testID="account-review-group-edit-handle-region"
        onLayout={(event) => {
          const height = Math.round(event.nativeEvent.layout.height);
          setHandleHeight((current) => (current === height ? current : height));
        }}
      >
        <ReviewSheetHandle />
      </View>
      <View
        testID="account-review-group-edit-fixed-header"
        className="w-full px-5"
        onLayout={(event) => {
          const height = Math.round(event.nativeEvent.layout.height);
          setHeaderHeight((current) => (current === height ? current : height));
        }}
      >
        <View className="w-full max-w-[350px] self-center">
          <EditSheetHeader
            groupName={source.groupName}
            linkedCount={source.linkedCount}
            language={p.language}
            onClose={source.onCancel}
          />
          <ReviewInlineNotice
            notice={source.reviewFeedback?.modalNotice ?? null}
            surface="modal"
            onDismiss={() => source.reviewFeedback?.dismiss("modal")}
          />
          {source.validationMessage ? (
            <Text
              accessibilityRole="alert"
              className="text-sm leading-5 text-red-600 dark:text-red-500"
            >
              {source.validationMessage}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        testID="account-review-group-edit-scroll"
        className="min-h-0 shrink"
        onLayout={(event) => {
          scrollViewportHeight.current = event.nativeEvent.layout.height;
          revealFocusedName();
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-3"
      >
        <View className="w-full max-w-[350px] self-center gap-3">
          <Text
            className={
              "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
              (p.language === "ar" ? "text-right" : "text-left")
            }
          >
            {displayIdentity(source.identitySummary, p.language)}
          </Text>
          <View
            testID="account-review-group-edit-name-bounds"
            onLayout={(event) => {
              nameBounds.current = {
                y: event.nativeEvent.layout.y,
                height: event.nativeEvent.layout.height,
              };
              revealFocusedName();
            }}
          >
            <EditNameField
              value={p.name}
              onChange={p.setName}
              onFocus={() => {
                isNameFocused.current = true;
                revealFocusedName();
              }}
              onBlur={() => {
                isNameFocused.current = false;
              }}
              language={p.language}
              disabled={source.isBusy}
            />
          </View>
          <EditTypePicker
            options={source.allowedTypeOptions}
            currentId={p.typeOptionId}
            onSelect={p.setTypeOptionId}
            language={p.language}
            disabled={source.isBusy}
          />
          <LockedCurrencyField
            label={source.lockedCurrencyLabel}
            language={p.language}
          />
          <ReviewActionButton
            testID="account-review-group-replace"
            label={reviewCopy("account_review_group_replace", p.language)}
            iconName="swap-horizontal-outline"
            tone="outline"
            disabled={source.isBusy}
            onPress={source.onReplace}
          />
        </View>
        {shouldScrollFooter ? footer : null}
      </ScrollView>
      {shouldScrollFooter ? null : footer}
    </View>
  );
}
export function EditSuggestedAccountSheet(
  props: EditSuggestedAccountSheetProps
): React.JSX.Element | null {
  const { language } = useLocale();
  const { height } = useWindowDimensions();
  const bottomInset = useModalBottomInset();
  const [name, setName] = useState(props.groupName);
  const [typeOptionId, setTypeOptionId] = useState(props.currentTypeOptionId);
  const [keyboardAreaHeight, setKeyboardAreaHeight] = useState<number | null>(
    null
  );
  useEffect(() => {
    setName(props.groupName);
    setTypeOptionId(props.currentTypeOptionId);
  }, [
    props.groupId,
    props.groupName,
    props.currentTypeOptionId,
    props.visible,
  ]);
  const allowed = props.allowedTypeOptions.some(
    (option) => option.id === typeOptionId
  );
  const canSubmit =
    props.canSubmit && !props.isBusy && allowed && name.trim().length > 0;
  const submit = (): void => {
    if (canSubmit) props.onSubmit({ name, typeOptionId });
  };
  // Cap at 80% of the original usable viewport. Android KAV(height) already
  // constrains the sheet to the keyboard-adjusted area; multiplying that
  // smaller area by 0.8 a second time can collapse the scroll body.
  // Bottom inset is applied once inside EditSheetSurface.
  const maxSheetHeight = Math.min(
    Math.max(0, (height - bottomInset) * 0.8),
    Math.max(0, keyboardAreaHeight ?? height)
  );
  if (!props.visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onCancel}
    >
      <KeyboardAvoidingView
        testID="account-review-group-edit-keyboard-area"
        className="flex-1 justify-end"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        onLayout={(event) => {
          const measured = Math.round(event.nativeEvent.layout.height);
          setKeyboardAreaHeight((current) =>
            current === measured ? current : measured
          );
        }}
      >
        <ReviewPointerBackdrop onPress={props.onCancel} />
        <EditSheetSurface
          source={props}
          name={name}
          setName={setName}
          typeOptionId={typeOptionId}
          setTypeOptionId={setTypeOptionId}
          canSubmit={canSubmit}
          language={language}
          submit={submit}
          bottomInset={bottomInset}
          maxHeight={maxSheetHeight}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
