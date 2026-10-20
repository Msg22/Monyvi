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
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/constants/colors";
import {
  getCategoryIconConfig,
  getSafeCategoryIconConfig,
} from "@/utils/category-icon-config";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useLocale } from "@/context/LocaleContext";
import { useCategoryLookup } from "@/context/CategoriesContext";

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
  readonly canEditCategory?: boolean;
  readonly onEditCategory?: (rowId: AccountReviewRow["rowId"]) => void;
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
    a.canEditCategory === b.canEditCategory &&
    a.onEditCategory === b.onEditCategory &&
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
}

function AccountMetadata(props: AccountMetadataProps): React.JSX.Element {
  const { source, name, rtl } = props;
  const textAlign = rtl ? "text-right" : "text-left";
  const direction = rtl
    ? rowWritingDirectionStyles.rtl
    : rowWritingDirectionStyles.ltr;
  const ordering = rtl ? "flex-row-reverse" : "flex-row";
  const action = source.accountActionLabel;
  const title = name ?? action;
  const status = source.accountStatusLabel;

  return (
    <View
      testID="account-review-row-account"
      className={"min-w-0 max-w-full shrink items-start gap-1 " + ordering}
    >
      {title !== null || source.accountType ? (
        <View className="h-8 w-7 shrink-0 items-center justify-center">
          <Ionicons
            testID="account-review-account-type-icon"
            name={accountTypeIcon(source.accountType)}
            color={palette.slate[500]}
            size={20}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      ) : null}
      <View
        testID="account-review-account-name-and-pencil"
        className={
          "min-h-12 min-w-0 max-w-full shrink items-start gap-x-1 " + ordering
        }
      >
        <View className="min-w-0 max-w-full shrink gap-0.5">
          {title !== null ? (
            <View className="min-h-8 min-w-0 max-w-full shrink justify-center">
              <Text
                testID={
                  name !== null
                    ? "transaction-account-match"
                    : "account-review-account-label"
                }
                className={
                  "min-w-0 max-w-full shrink text-sm font-semibold leading-5 " +
                  "text-text-primary dark:text-text-primary-dark " +
                  textAlign
                }
                style={direction}
              >
                {title}
              </Text>
            </View>
          ) : null}
          {status !== null ? (
            <Text
              testID="account-review-row-status"
              className={
                "text-xs leading-5 " +
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
        {action !== null ? (
          <TouchableOpacity
            testID="account-review-row-account-action"
            accessible
            accessibilityRole="button"
            accessibilityLabel={[action, name, status]
              .filter(Boolean)
              .join(", ")}
            accessibilityState={{ disabled: source.isBusy }}
            disabled={source.isBusy}
            onPress={(event) => {
              event.stopPropagation();
              source.onChooseAccount(source.rowId);
            }}
            className="h-[48px] w-[48px] shrink-0 items-center justify-start"
          >
            <View
              pointerEvents="none"
              className="h-[32px] w-[32px] items-center justify-center"
            >
              <Ionicons
                name="create-outline"
                size={17}
                color={palette.slate[500]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
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
  const { t } = useTranslation("transactions");
  const rtl = language === "ar";
  const ordering = rtl ? "flex-row-reverse" : "flex-row";
  // Use intrinsic labels and real 48dp controls; flex-wrap makes the decision
  // from available row space rather than viewport or character-width estimates.
  const categoryMap = useCategoryLookup();
  const category = categoryId ? categoryMap.get(categoryId) : null;
  const categoryIcon = category
    ? getCategoryIconConfig(category)
    : getSafeCategoryIconConfig(
        "pricetag-outline",
        "Ionicons",
        palette.slate[500]
      );
  if (
    accountName === null &&
    source.accountStatusLabel === null &&
    source.accountActionLabel === null &&
    source.currencyActionLabel === null &&
    source.sharedSelectionDisclosure === null &&
    !categoryDisplayName &&
    !source.canEditCategory
  )
    return null;
  return (
    <View testID="account-review-row-presentation" className="mt-0 gap-1">
      <View
        testID="account-review-row-metadata"
        className={"flex-wrap items-start gap-x-2 gap-y-1 " + ordering}
      >
        {accountName !== null ||
        source.accountActionLabel !== null ||
        source.accountStatusLabel !== null ||
        source.accountType ? (
          <AccountMetadata source={source} name={accountName} rtl={rtl} />
        ) : null}
        {categoryDisplayName || source.canEditCategory ? (
          <View
            testID="account-review-row-category"
            className={
              "min-w-0 max-w-full shrink items-start gap-1 " + ordering
            }
          >
            <View className="h-8 w-7 shrink-0 items-center justify-center">
              <CategoryIcon
                iconName={categoryIcon.iconName}
                iconLibrary={categoryIcon.iconLibrary}
                color={categoryIcon.iconColor}
                size={18}
              />
            </View>
            <View
              testID="account-review-category-name-and-pencil"
              className={
                "min-h-12 min-w-0 max-w-full shrink items-start gap-x-1 " +
                ordering
              }
            >
              <View className="min-h-8 min-w-0 max-w-full shrink justify-center">
                <Text
                  className={
                    "min-w-0 max-w-full shrink text-sm leading-5 " +
                    "text-text-secondary dark:text-text-secondary-dark " +
                    (rtl ? "text-right" : "text-left")
                  }
                  style={
                    rtl
                      ? rowWritingDirectionStyles.rtl
                      : rowWritingDirectionStyles.ltr
                  }
                >
                  {categoryDisplayName || t("account_review_issue_category")}
                </Text>
              </View>
              {source.canEditCategory && source.onEditCategory ? (
                <TouchableOpacity
                  testID="account-review-row-category-pencil"
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={t("edit_category")}
                  accessibilityState={{ disabled: source.isBusy }}
                  disabled={source.isBusy}
                  onPress={(event) => {
                    event.stopPropagation();
                    source.onEditCategory?.(source.rowId);
                  }}
                  className="h-[48px] w-[48px] shrink-0 items-center justify-start"
                >
                  <View
                    pointerEvents="none"
                    className="h-[32px] w-[32px] items-center justify-center"
                  >
                    <Ionicons
                      name="create-outline"
                      size={17}
                      color={palette.slate[500]}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
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
      <TouchableOpacity
        testID="account-review-atm-destination-action"
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          props.label + ": " + (props.destinationName ?? props.missingLabel)
        }
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={props.onChoose}
        className="h-11 w-11 shrink-0 items-center justify-center"
      >
        <Ionicons
          name="create-outline"
          size={18}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    </View>
  );
}
