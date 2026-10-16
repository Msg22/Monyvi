/**
 * #395 T021/T039: shaped review-row presentation, not account resolution.
 * Parent supplies all labels, scopes, affordances, statuses and callbacks.
 */
import { Ionicons } from "@expo/vector-icons";
import type { AccountReviewRow } from "@monyvi/logic";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import { palette } from "@/constants/colors";
import { shouldUseDenseRowCompactLayout } from "@/constants/ui";
import { useLocale } from "@/context/LocaleContext";

const rowWritingDirectionStyles = StyleSheet.create({
  rtl: { writingDirection: "rtl" },
  ltr: { writingDirection: "ltr" },
});

export type AccountReviewRowStatusTone =
  | "pending"
  | "confirmed"
  | "removed";

export interface AccountReviewRowPresentationProps {
  readonly rowId: AccountReviewRow["rowId"];
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly sharedSelectionDisclosure: string | null;
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string | null;
  /** An optional, parent-shaped semantic tone; never guessed from translated text. */
  readonly accountStatusTone?: AccountReviewRowStatusTone;
  readonly isBusy: boolean;
  readonly onChooseAccount: (rowId: AccountReviewRow["rowId"]) => void;
  readonly onChooseCurrency: (
    rowId: AccountReviewRow["rowId"],
    contextLabel: string
  ) => void;
}

export function areAccountReviewRowPropsEqual(
  a: AccountReviewRowPresentationProps | undefined,
  b: AccountReviewRowPresentationProps | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.rowId === b.rowId &&
    a.accountActionLabel === b.accountActionLabel &&
    a.accountStatusLabel === b.accountStatusLabel &&
    a.sharedSelectionDisclosure === b.sharedSelectionDisclosure &&
    a.currencyActionLabel === b.currencyActionLabel &&
    a.currencyContextLabel === b.currencyContextLabel &&
    a.accountStatusTone === b.accountStatusTone &&
    a.isBusy === b.isBusy &&
    a.onChooseAccount === b.onChooseAccount &&
    a.onChooseCurrency === b.onChooseCurrency
  );
}

function statusInk(tone: AccountReviewRowStatusTone | undefined): string {
  if (tone === "pending") return "text-gold-800 dark:text-gold-400";
  if (tone === "confirmed")
    return "text-nileGreen-700 dark:text-nileGreen-400";
  if (tone === "removed") return "text-red-600 dark:text-red-500";
  return "text-text-secondary dark:text-text-secondary-dark";
}

function statusIcon(
  tone: AccountReviewRowStatusTone | undefined
): keyof typeof Ionicons.glyphMap {
  if (tone === "pending") return "time-outline";
  if (tone === "confirmed") return "checkmark-circle-outline";
  if (tone === "removed") return "close-circle-outline";
  return "information-circle-outline";
}

function RowStatus({
  label,
  tone,
  rtl,
}: {
  readonly label: string;
  readonly tone: AccountReviewRowStatusTone | undefined;
  readonly rtl: boolean;
}): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const tint =
    tone === "pending"
      ? dark ? palette.gold[400] : palette.gold[800]
      : tone === "confirmed"
        ? dark ? palette.nileGreen[400] : palette.nileGreen[700]
        : tone === "removed"
          ? dark ? palette.red[500] : palette.red[600]
          : palette.slate[500];
  return (
    <View
      className={
        "items-center gap-2 " + (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <Ionicons
        name={statusIcon(tone)}
        color={tint}
        size={18}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        testID="account-review-row-status"
        className={
          "min-w-0 flex-1 text-xs font-semibold leading-[18px] " +
          statusInk(tone) +
          (rtl ? " text-right" : " text-left")
        }
        style={rtl ? rowWritingDirectionStyles.rtl : rowWritingDirectionStyles.ltr}
      >
        {label}
      </Text>
    </View>
  );
}

interface RowChoiceProps {
  readonly label: string;
  readonly context: string | null;
  readonly testID: string;
  readonly iconName: "pencil-outline" | "globe-outline";
  readonly disabled: boolean;
  readonly rtl: boolean;
  readonly onPress: () => void;
}

function RowChoiceButton(props: RowChoiceProps): React.JSX.Element {
  const { colorScheme } = useColorScheme();
  const iconColor = props.disabled
    ? palette.slate[400]
    : colorScheme === "dark"
      ? palette.nileGreen[400]
      : palette.nileGreen[700];
  return (
    <TouchableOpacity
      testID={props.testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        props.context ? props.label + ", " + props.context : props.label
      }
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={() => {
        if (!props.disabled) props.onPress();
      }}
      activeOpacity={0.8}
      className={
        "min-h-11 min-w-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 dark:border-border-dark dark:bg-surface-dark " +
        (props.rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <Ionicons
        name={props.iconName}
        color={iconColor}
        size={18}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        className={
          "min-w-0 shrink text-center text-sm font-semibold leading-5 " +
          (props.disabled
            ? "text-text-muted dark:text-text-muted-dark"
            : "text-nileGreen-700 dark:text-nileGreen-400")
        }
      >
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

interface RowChoiceBarProps {
  readonly source: AccountReviewRowPresentationProps;
  readonly compact: boolean;
  readonly rtl: boolean;
}

function RowChoiceBar(props: RowChoiceBarProps): React.JSX.Element | null {
  const { source, compact, rtl } = props;
  if (
    source.accountActionLabel === null &&
    source.currencyActionLabel === null
  ) {
    return null;
  }
  return (
    <View
      className={
        "w-full gap-2 " +
        (compact
          ? "flex-col"
          : rtl
            ? "flex-row-reverse flex-wrap"
            : "flex-row flex-wrap")
      }
    >
      {source.accountActionLabel !== null ? (
        <RowChoiceButton
          testID="account-review-row-account-action"
          label={source.accountActionLabel}
          context={null}
          iconName="pencil-outline"
          rtl={rtl}
          disabled={source.isBusy}
          onPress={() => source.onChooseAccount(source.rowId)}
        />
      ) : null}
      {source.currencyActionLabel !== null ? (
        <RowChoiceButton
          testID="account-review-row-currency-action"
          label={source.currencyActionLabel}
          context={source.currencyContextLabel}
          iconName="globe-outline"
          rtl={rtl}
          disabled={source.isBusy || source.currencyContextLabel === null}
          onPress={() => {
            if (source.currencyContextLabel !== null) {
              source.onChooseCurrency(source.rowId, source.currencyContextLabel);
            }
          }}
        />
      ) : null}
    </View>
  );
}

export function AccountReviewRowPresentation({
  source,
}: {
  readonly source: AccountReviewRowPresentationProps;
}): React.JSX.Element | null {
  const { language } = useLocale();
  const { width, fontScale } = useWindowDimensions();
  const rtl = language === "ar";
  const compact = shouldUseDenseRowCompactLayout(width, fontScale);
  const directionStyle = rtl
    ? rowWritingDirectionStyles.rtl
    : rowWritingDirectionStyles.ltr;
  if (
    source.accountStatusLabel === null &&
    source.sharedSelectionDisclosure === null &&
    source.accountActionLabel === null &&
    source.currencyActionLabel === null
  ) {
    return null;
  }
  return (
    <View
      testID="account-review-row-presentation"
      className="w-full gap-2 px-4 pb-3"
    >
      {source.accountStatusLabel !== null ? (
        <RowStatus
          label={source.accountStatusLabel}
          tone={source.accountStatusTone}
          rtl={rtl}
        />
      ) : null}
      {source.sharedSelectionDisclosure !== null ? (
        <Text
          testID="account-review-row-shared-disclosure"
          className={
            "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
          style={directionStyle}
        >
          {source.sharedSelectionDisclosure}
        </Text>
      ) : null}
      <RowChoiceBar source={source} compact={compact} rtl={rtl} />
    </View>
  );
}
