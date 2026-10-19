/**
 * #395 T021/T039: shaped review-row presentation, not account resolution.
 * Parent supplies all labels, scopes, affordances, statuses and callbacks.
 */
import { Ionicons } from "@expo/vector-icons";
import type {
  AccountReviewRow,
  AccountReviewSession,
  ReviewableTransaction,
} from "@monyvi/logic";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { palette } from "@/constants/colors";
import {
  getCategoryIconConfig,
  getSafeCategoryIconConfig,
} from "@/utils/category-icon-config";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useLocale } from "@/context/LocaleContext";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { ReviewActionButton } from "./shared-account-presentation";

const rowWritingDirectionStyles = StyleSheet.create({
  rtl: { writingDirection: "rtl" },
  ltr: { writingDirection: "ltr" },
});

export type AccountReviewRowStatusTone = "pending" | "confirmed" | "removed";

export interface AccountReviewRowPresentationProps {
  readonly rowId: AccountReviewRow["rowId"];
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly sharedSelectionDisclosure: string | null;
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string | null;
  /** The canonical owned choice/suggested group type, never inferred from source. */
  readonly accountType?: AccountReviewSession["groups"][number]["type"];
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
    a.accountType === b.accountType &&
    a.accountStatusTone === b.accountStatusTone &&
    a.isBusy === b.isBusy &&
    a.onChooseAccount === b.onChooseAccount &&
    a.onChooseCurrency === b.onChooseCurrency
  );
}

/** An inactive control is never a second, misleading "Change" pill. */
function statusToneColor(tone: AccountReviewRowStatusTone | undefined): string {
  if (tone === "pending") return "text-gold-800 dark:text-gold-400";
  if (tone === "confirmed") return "text-nileGreen-700 dark:text-nileGreen-400";
  if (tone === "removed") return "text-red-600 dark:text-red-500";
  return "text-text-secondary dark:text-text-secondary-dark";
}

function accountTypeIcon(
  type: AccountReviewRowPresentationProps["accountType"]
): keyof typeof Ionicons.glyphMap {
  if (type === "BANK") return "business-outline";
  if (type === "CASH") return "cash-outline";
  if (type === "DIGITAL_WALLET") return "wallet-outline";
  return "help-circle-outline";
}

interface AccountMetadataProps {
  readonly source: AccountReviewRowPresentationProps;
  readonly name: string | null;
  readonly rtl: boolean;
  readonly dense: boolean;
}
function AccountMetadata(props: AccountMetadataProps): React.JSX.Element {
  const { source, name, rtl, dense } = props;
  const textAlign = rtl ? "text-right" : "text-left";
  const direction = rtl
    ? rowWritingDirectionStyles.rtl
    : rowWritingDirectionStyles.ltr;
  const action = source.accountActionLabel;
  const title = name ?? action;
  const status = source.accountStatusLabel;
  const content = (
    <>
      {title !== null || source.accountType ? (
        <View className="h-5 w-5 shrink-0 items-center justify-center">
          <Ionicons
            testID="account-review-account-type-icon"
            name={accountTypeIcon(source.accountType)}
            color={palette.slate[500]}
            size={dense ? 18 : 20}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      ) : null}
      <View className="min-w-0 grow shrink">
        {title !== null ? (
          <Text
            testID={
              name !== null
                ? "transaction-account-match"
                : "account-review-account-label"
            }
            className={
              (dense
                ? "text-[13px] font-semibold leading-[18px] "
                : "text-sm font-semibold leading-5 ") +
              "text-text-primary dark:text-text-primary-dark " +
              textAlign
            }
            style={direction}
          >
            {title}
          </Text>
        ) : null}
        {status !== null ? (
          <Text
            testID="account-review-row-status"
            className={
              "text-xs leading-[18px] " +
              statusToneColor(source.accountStatusTone) +
              " " +
              textAlign
            }
            style={direction}
          >
            {status}
          </Text>
        ) : null}
      </View>
      {action !== null && name !== null ? (
        <View className="h-4 w-4 shrink-0 items-center justify-center">
          <Ionicons
            name="pencil-outline"
            size={dense ? 14 : 16}
            color={palette.slate[500]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      ) : null}
    </>
  );
  const classes =
    "w-full min-w-0 " +
    (dense ? "items-start gap-1 " : "items-center gap-1.5 ") +
    (rtl ? "flex-row-reverse" : "flex-row");
  if (action === null) {
    return <View className={classes}>{content}</View>;
  }
  return (
    <TouchableOpacity
      testID="account-review-row-account-action"
      accessible
      accessibilityRole="button"
      accessibilityLabel={[action, name, status].filter(Boolean).join(", ")}
      accessibilityState={{ disabled: source.isBusy }}
      disabled={source.isBusy}
      onPress={() => source.onChooseAccount(source.rowId)}
      activeOpacity={0.8}
      className={"min-h-11 rounded-lg " + classes}
    >
      {content}
    </TouchableOpacity>
  );
}

interface RowPresentationProps {
  readonly source: AccountReviewRowPresentationProps;
  readonly accountName?: string | null;
  readonly categoryId?: ReviewableTransaction["categoryId"];
  readonly categoryDisplayName?: string;
}
export function AccountReviewRowPresentation({
  source,
  accountName = null,
  categoryId,
  categoryDisplayName,
}: RowPresentationProps): React.JSX.Element | null {
  const { language } = useLocale();
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = React.useState<number | null>(null);
  const rtl = language === "ar";
  // Canonical TransactionItem allocates 44 dp for selection, 32 dp gutters,
  // and a 4 dp gap. Once measured, the actual row takes precedence.
  const availableWidth = measuredWidth ?? Math.max(0, width - 80);
  const dense = availableWidth < 288 || fontScale > 1.35;
  const accountHasContent =
    accountName !== null ||
    source.accountActionLabel !== null ||
    source.accountStatusLabel !== null ||
    source.accountType !== undefined;
  const accountMinimum =
    20 +
    6 +
    Math.ceil(78 * fontScale) +
    (accountName !== null && source.accountActionLabel !== null ? 22 : 0);
  const categoryMinimum = 20 + 6 + Math.ceil(78 * fontScale);
  const compact =
    accountHasContent &&
    Boolean(categoryDisplayName) &&
    availableWidth < accountMinimum + categoryMinimum + (dense ? 8 : 12);
  const categoryMap = useCategoryLookup();
  const category = categoryId ? categoryMap.get(categoryId) : null;
  const categoryIcon = category
    ? getCategoryIconConfig(category)
    : getSafeCategoryIconConfig(
        "pricetag-outline",
        "Ionicons",
        palette.slate[500]
      );
  const context = source.currencyContextLabel;
  if (
    accountName === null &&
    source.accountStatusLabel === null &&
    source.accountActionLabel === null &&
    source.currencyActionLabel === null &&
    source.sharedSelectionDisclosure === null &&
    !categoryDisplayName
  )
    return null;
  return (
    <View testID="account-review-row-presentation" className="mt-1.5 gap-1.5">
      <View
        testID="account-review-row-metadata"
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setMeasuredWidth((previous) => (previous === next ? previous : next));
        }}
        className={
          (dense ? "gap-x-2 gap-y-1.5 " : "gap-x-3 gap-y-2 ") +
          (compact
            ? "items-start flex-col"
            : rtl
              ? "items-center flex-row-reverse"
              : "items-center flex-row")
        }
      >
        {accountName !== null ||
        source.accountActionLabel !== null ||
        source.accountStatusLabel !== null ||
        source.accountType ? (
          <View className={compact ? "w-full" : "min-w-0 flex-1"}>
            <AccountMetadata
              source={source}
              name={accountName}
              rtl={rtl}
              dense={dense}
            />
          </View>
        ) : null}
        {categoryDisplayName ? (
          <View
            testID="account-review-row-category"
            className={
              "min-w-0 " +
              (dense ? "items-start gap-1 " : "items-center gap-1.5 ") +
              (compact ? "w-full " : "flex-1 ") +
              (rtl ? "flex-row-reverse" : "flex-row")
            }
          >
            <View className="h-5 w-5 shrink-0 items-center justify-center">
              <CategoryIcon
                iconName={categoryIcon.iconName}
                iconLibrary={categoryIcon.iconLibrary}
                color={categoryIcon.iconColor}
                size={dense ? 16 : 18}
              />
            </View>
            <Text
              className={
                "min-w-0 grow shrink " +
                (dense ? "text-[13px] leading-[18px] " : "text-sm leading-5 ") +
                "text-text-secondary dark:text-text-secondary-dark " +
                (rtl ? "text-right" : "text-left")
              }
              style={
                rtl
                  ? rowWritingDirectionStyles.rtl
                  : rowWritingDirectionStyles.ltr
              }
            >
              {categoryDisplayName}
            </Text>
          </View>
        ) : null}
      </View>
      {source.currencyActionLabel !== null && context !== null ? (
        <TouchableOpacity
          testID="account-review-row-currency-action"
          accessible
          accessibilityRole="button"
          accessibilityLabel={source.currencyActionLabel + ", " + context}
          accessibilityState={{ disabled: source.isBusy }}
          disabled={source.isBusy}
          onPress={() => source.onChooseCurrency(source.rowId, context)}
          activeOpacity={0.8}
          className={
            "min-h-12 min-w-11 self-start items-center gap-1.5 rounded-lg border border-border px-3 dark:border-border-dark " +
            (rtl ? "flex-row-reverse" : "flex-row")
          }
        >
          <Ionicons
            name="globe-outline"
            size={18}
            color={palette.nileGreen[700]}
          />
          <Text className="text-sm font-semibold leading-5 text-nileGreen-700 dark:text-nileGreen-400">
            {source.currencyActionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
      {source.sharedSelectionDisclosure !== null ? (
        <Text
          testID="account-review-row-shared-disclosure"
          className={
            "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
          style={
            rtl ? rowWritingDirectionStyles.rtl : rowWritingDirectionStyles.ltr
          }
        >
          {source.sharedSelectionDisclosure}
        </Text>
      ) : null}
    </View>
  );
}

/** Existing ATM destination recovery remains a separate, compact target. */
export interface AtmDestinationStatusProps {
  readonly label: string;
  readonly destinationName: string | null;
  readonly missingLabel: string;
  readonly disabled: boolean;
  readonly onChoose: () => void;
}
export function AtmDestinationStatus(
  props: AtmDestinationStatusProps
): React.JSX.Element {
  return (
    <View
      testID="account-review-atm-destination"
      className="flex-row flex-wrap items-center gap-2 px-4 pb-3"
    >
      <Text
        testID="account-review-atm-destination-status"
        className="min-w-0 flex-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
      >
        {props.label}: {props.destinationName ?? props.missingLabel}
      </Text>
      <ReviewActionButton
        testID="account-review-atm-destination-action"
        label={props.label}
        iconName="pencil-outline"
        disabled={props.disabled}
        onPress={props.onChoose}
      />
    </View>
  );
}
