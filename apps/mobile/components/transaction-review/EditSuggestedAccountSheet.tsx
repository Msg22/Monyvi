/**
 * #395 T031 B1 R1-07 — controlled visibility/permissions, local form draft.
 * No persistence, account-eligibility, group reducer or currency mutation.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
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
import { shouldUseCompactLayout } from "@/constants/ui";
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
  language,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (text: string) => void;
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
          {props.options.map((option) => (
            <TouchableOpacity
              key={option.id}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ checked: option.id === props.currentId }}
              onPress={() => {
                props.onSelect(option.id);
                setExpanded(false);
              }}
              className="min-h-11 justify-center rounded-md px-3"
            >
              <Text className="text-base text-text-primary dark:text-text-primary-dark">
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
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
  readonly compact: boolean;
}
function EditorFooter(props: EditorFooterProps): React.JSX.Element {
  return (
    <View
      className={
        props.compact
          ? "w-full gap-3 px-5 pt-2 pb-3"
          : props.language === "ar"
            ? "w-full flex-row-reverse gap-3 px-5 pt-2 pb-3"
            : "w-full flex-row gap-3 px-5 pt-2 pb-3"
      }
    >
      <View className="flex-1">
        <ReviewActionButton
          label={reviewCopy("account_review_group_edit_cancel", props.language)}
          tone="outline"
          onPress={props.onCancel}
        />
      </View>
      <View className="flex-1">
        <ReviewActionButton
          testID="account-review-group-edit-submit"
          label={reviewCopy("account_review_group_edit_submit", props.language)}
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
  readonly compact: boolean;
  readonly bottomInset: number;
  readonly maxHeight: number;
  readonly submit: () => void;
}
function EditSheetSurface(p: EditSheetSurfaceProps): React.JSX.Element {
  const source = p.source;
  return (
    <View
      testID="account-review-group-edit-sheet"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      className="w-full overflow-hidden rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      style={{ maxHeight: p.maxHeight, paddingBottom: p.bottomInset }}
    >
      <ReviewSheetHandle />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-3"
      >
        <View className="w-full max-w-[350px] self-center gap-3">
          <EditSheetHeader
            groupName={source.groupName}
            linkedCount={source.linkedCount}
            language={p.language}
            onClose={source.onCancel}
          />
          <Text
            className={
              "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
              (p.language === "ar" ? "text-right" : "text-left")
            }
          >
            {displayIdentity(source.identitySummary, p.language)}
          </Text>
          <EditNameField
            value={p.name}
            onChange={p.setName}
            language={p.language}
            disabled={source.isBusy}
          />
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
          {source.validationMessage ? (
            <Text
              accessibilityRole="alert"
              className="text-sm leading-5 text-red-600 dark:text-red-500"
            >
              {source.validationMessage}
            </Text>
          ) : null}
          <ReviewActionButton
            testID="account-review-group-replace"
            label={reviewCopy("account_review_group_replace", p.language)}
            iconName="swap-horizontal-outline"
            tone="outline"
            disabled={source.isBusy}
            onPress={source.onReplace}
          />
        </View>
      </ScrollView>
      <EditorFooter
        compact={p.compact}
        language={p.language}
        canSubmit={p.canSubmit}
        onCancel={source.onCancel}
        onSubmit={p.submit}
      />
    </View>
  );
}
export function EditSuggestedAccountSheet(
  props: EditSuggestedAccountSheetProps
): React.JSX.Element | null {
  const { language } = useLocale();
  const { width, height, fontScale } = useWindowDimensions();
  const bottomInset = useModalBottomInset();
  const [name, setName] = useState(props.groupName);
  const [typeOptionId, setTypeOptionId] = useState(props.currentTypeOptionId);
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
        className="flex-1 justify-end"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
          compact={shouldUseCompactLayout(width, fontScale)}
          bottomInset={bottomInset}
          maxHeight={Math.max(0, (height - bottomInset) * 0.8)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
