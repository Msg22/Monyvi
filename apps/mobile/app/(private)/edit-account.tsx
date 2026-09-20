/**
 * Edit Account Screen
 *
 * Pre-populates form fields from an existing account and allows editing
 * name, balance, bank details, and default account toggle.
 * Account type and currency are displayed as read-only locked dropdowns.
 *
 * Architecture & Design Rationale:
 * - Pattern: Screen Component (route-level, receives ID via URL params)
 * - SOLID: SRP — screen orchestration only, delegates to hooks and services
 * - Follows established edit-transaction.tsx pattern for consistency
 *
 * Phase 3 (US5): Route scaffold with param loading + navigation wiring
 * Phase 4 (US1): Full edit form, save flow, and validation
 */

import { AccountPreviewCard } from "@/components/add-account/AccountPreviewCard";
import { InstitutionProviderSection } from "@/components/add-account/InstitutionProviderSection";
import { SmsMatchingSection } from "@/components/add-account/SmsMatchingSection";
import { BalanceChangedSheet } from "@/components/edit-account/BalanceChangedSheet";
import { DeleteAccountSheet } from "@/components/edit-account/DeleteAccountSheet";
import { ReadOnlyDropdown } from "@/components/edit-account/ReadOnlyDropdown";
import { PageHeader } from "@/components/navigation/PageHeader";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { getCurrencyOptions } from "@/constants/accounts";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useEgyptianInstitutionEligibility } from "@/hooks/useEgyptianInstitutionEligibility";
import { useAccountById, UseAccountByIdResult } from "@/hooks/useAccountById";
import { useAccountDisplayName } from "@/hooks/useAccountDisplayNames";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useEditAccountForm } from "@/hooks/useEditAccountForm";
import { useUpdateAccount } from "@/hooks/useUpdateAccount";
import type { UpdateAccountData } from "@/services/edit-account-service";
import { safeNotificationHaptic } from "@/utils/haptics";
import { logger } from "@/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import type { Account } from "@monyvi/db";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditAccountSkeleton } from "@/components/edit-account/EditAccountSkeleton";

// =============================================================================
// Component
// =============================================================================

const FOCUSED_FIELD_KEYBOARD_GAP = 24;

export default function EditAccount(): React.ReactNode {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");

  // ---------------------------------------------------------------------------
  // Data Hooks
  // ---------------------------------------------------------------------------
  const { account, bankDetails, isLoading } = useAccountById(id);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return <EditAccountSkeleton />;
  }

  // ---------------------------------------------------------------------------
  // Not Found State
  // ---------------------------------------------------------------------------
  if (!account) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background dark:bg-background-dark">
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={palette.slate[400]}
        />
        <Text className="mt-4 text-lg font-semibold text-slate-500 dark:text-slate-400 text-center">
          {t("account_not_found")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 rounded-xl bg-nileGreen-500"
        >
          <Text className="text-white font-semibold">{tCommon("back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — Account Loaded
  // ---------------------------------------------------------------------------
  return (
    <EditAccountForm
      account={account}
      bankDetails={bankDetails}
      isDark={isDark}
      bottomInset={insets.bottom}
    />
  );
}

// =============================================================================
// EditAccountForm — extracted to allow hooks after conditional returns
// =============================================================================

interface EditAccountFormProps {
  readonly account: Account;
  readonly bankDetails: UseAccountByIdResult["bankDetails"];
  readonly isDark: boolean;
  readonly bottomInset: number;
}

function EditAccountForm({
  account,
  bankDetails,
  isDark,
  bottomInset,
}: EditAccountFormProps): React.JSX.Element {
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");
  const { height: windowHeight } = useWindowDimensions();
  const { showToast } = useToast();
  // Resolve a display name (with currency suffix on duplicate names) so the
  // header + delete sheet show e.g. "Cash (EGP)" instead of an ambiguous
  // "Cash" — per spec 026-followup.
  const displayName = useAccountDisplayName(account);
  const {
    formData,
    errors,
    isValid,
    isDirty,
    isCheckingUniqueness,
    accountType,
    currency,
    isDefault,
    originalBalance,
    updateField,
    selectKnownInstitution,
    selectOtherInstitution,
    updateSenderNames,
    toggleDefault,
    validate,
  } = useEditAccountForm(account, bankDetails);
  const { isEligible: isKnownProviderEligible } =
    useEgyptianInstitutionEligibility();

  const [isSmsMatchingExpanded, setIsSmsMatchingExpanded] = useState(false);
  const [showBalanceSheet, setShowBalanceSheet] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const activeKeyboardTargetRef = useRef<React.RefObject<View | null> | null>(
    null
  );
  const balanceFieldRef = useRef<View>(null);
  const smsMatchingSectionRef = useRef<View>(null);

  const scrollTargetAboveKeyboard = useCallback(
    (targetRef: React.RefObject<View | null>): void => {
      activeKeyboardTargetRef.current = targetRef;

      requestAnimationFrame(() => {
        targetRef.current?.measureInWindow((_x, y, _width, height) => {
          const visibleBottom =
            windowHeight -
            keyboardHeightRef.current -
            bottomInset -
            FOCUSED_FIELD_KEYBOARD_GAP;
          const overflow = y + height - visibleBottom;

          if (overflow > 0) {
            scrollViewRef.current?.scrollTo({
              y: currentScrollYRef.current + overflow,
              animated: true,
            });
          }
        });
      });
    },
    [bottomInset, windowHeight]
  );

  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener("keyboardDidShow", (event) => {
      const nextKeyboardHeight = event.endCoordinates.height;
      keyboardHeightRef.current = nextKeyboardHeight;
      setKeyboardHeight(nextKeyboardHeight);

      if (activeKeyboardTargetRef.current) {
        scrollTargetAboveKeyboard(activeKeyboardTargetRef.current);
      }
    });
    const keyboardDidHide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      activeKeyboardTargetRef.current = null;
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, [scrollTargetAboveKeyboard]);

  const handleSmsFieldFocus = useCallback((): void => {
    scrollTargetAboveKeyboard(smsMatchingSectionRef);
  }, [scrollTargetAboveKeyboard]);

  const handleBalanceFieldFocus = useCallback((): void => {
    scrollTargetAboveKeyboard(balanceFieldRef);
  }, [scrollTargetAboveKeyboard]);

  const { performUpdate, isSubmitting } = useUpdateAccount();
  const {
    performDelete,
    isDeleting,
    linkedCounts,
    isLoadingCounts,
    loadCounts,
  } = useDeleteAccount(account.id);

  // Look up display values for read-only fields
  const accountTypeLabel = useMemo(() => {
    return t(`type_${accountType.toLowerCase()}`);
  }, [accountType, t]);

  const accountTypeIcon = useMemo((): string => {
    const emojiMap: Record<string, string> = {
      CASH: "💵",
      BANK: "🏦",
      DIGITAL_WALLET: "📱",
    };
    return emojiMap[accountType] ?? "💰";
  }, [accountType]);

  const currencyOptions = getCurrencyOptions();

  const currencyLabel =
    currencyOptions.find((c) => c.value === currency)?.label ?? currency;

  const currencyIcon =
    currencyOptions.find((c) => c.value === currency)?.icon ?? "💵";

  /** Build the update data payload. */
  const buildUpdateData = useCallback((): UpdateAccountData | null => {
    const parsedBalance = parseFloat(formData.balance);
    if (isNaN(parsedBalance)) return null;

    return {
      name: formData.name,
      balance: parsedBalance,
      isDefault,
      institutionId: formData.institutionId ?? null,
      providerDisplayName: formData.providerDisplayName,
      senderNames: formData.senderNames,
      bankName: formData.bankName,
      cardLast4: formData.cardLast4,
      smsSenderName: formData.smsSenderName,
    };
  }, [formData, isDefault]);

  /**
   * Handle save — validates form, checks for balance change,
   * and either saves directly or shows the BalanceChangedSheet.
   */
  const handleSave = useCallback((): void => {
    if (isSubmitting || !isDirty) return;
    if (!validate()) return;

    const data = buildUpdateData();
    if (!data) {
      // Defense-in-depth: validate() already rejects malformed balances via
      // the regex refine, but if anything slips through (e.g. parseFloat
      // overflow on extremely long input) surface the failure to the user
      // instead of bailing silently.
      safeNotificationHaptic(
        Haptics.NotificationFeedbackType.Error,
        "editAccount_invalid_balance"
      );
      showToast({
        type: "error",
        title: t("validation_balance_invalid_title"),
        message: t("validation_balance_invalid"),
      });
      return;
    }

    // Check if balance has actually changed
    const balanceChanged = data.balance !== originalBalance;

    if (balanceChanged) {
      // Show the balance change sheet for user to decide
      setShowBalanceSheet(true);
    } else {
      // No balance change, save directly
      performUpdate(account.id, data).catch((err: unknown) =>
        logger.error("[EditAccount] Save failed", err)
      );
    }
  }, [
    isSubmitting,
    isDirty,
    validate,
    buildUpdateData,
    originalBalance,
    account.id,
    performUpdate,
    showToast,
    t,
  ]);

  /**
   * Handle the user's choice from the BalanceChangedSheet.
   */
  const handleBalanceSheetConfirm = useCallback(
    (option: "silent" | "tracked"): void => {
      setShowBalanceSheet(false);

      const data = buildUpdateData();
      if (!data) return;

      const balanceAdjustment =
        option === "tracked"
          ? {
              trackAsTransaction: true as const,
              currency,
            }
          : undefined;

      performUpdate(account.id, data, balanceAdjustment).catch((err: unknown) =>
        logger.error("[EditAccount] Save failed", err)
      );
    },
    [buildUpdateData, currency, account.id, performUpdate]
  );

  const handleProviderDisplayNameChange = useCallback(
    (value: string): void => {
      updateField("providerDisplayName", value);
    },
    [updateField]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
      />
      <PageHeader
        title={t("edit_account")}
        showBackButton={true}
        backIcon="arrow"
        rightAction={{
          label: tCommon("save"),
          onPress: () => {
            handleSave();
          },
          loading: isSubmitting,
          disabled: !isDirty || !isValid || isCheckingUniqueness,
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        onScroll={(event) => {
          currentScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: bottomInset + 160,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4">
          <AccountPreviewCard
            accountType={accountType}
            accountName={formData.name || displayName || account.name}
            balance={formData.balance}
            currency={currency}
            institutionId={formData.institutionId ?? null}
            providerDisplayName={formData.providerDisplayName ?? ""}
          />

          <ReadOnlyDropdown
            label={t("account_type")}
            displayValue={accountTypeLabel}
            icon={accountTypeIcon}
          />

          <ReadOnlyDropdown
            label={t("currency")}
            displayValue={currencyLabel}
            icon={currencyIcon}
          />

          <TextField
            label={t("account_name")}
            testID="account-name-input"
            placeholder={t("account_name_placeholder_bank")}
            value={formData.name}
            onChangeText={(text) => updateField("name", text)}
            error={errors.name}
            maxLength={50}
          />

          {(accountType === "BANK" || accountType === "DIGITAL_WALLET") && (
            <InstitutionProviderSection
              accountType={accountType}
              isKnownProviderEligible={isKnownProviderEligible}
              institutionId={formData.institutionId ?? null}
              providerDisplayName={formData.providerDisplayName ?? ""}
              providerDisplayNameError={errors.providerDisplayName}
              senderNames={formData.senderNames ?? []}
              showSenderChips={false}
              showHelpText={false}
              className="mb-1"
              onSelectKnownInstitution={selectKnownInstitution}
              onSelectOtherInstitution={selectOtherInstitution}
              onProviderDisplayNameChange={handleProviderDisplayNameChange}
              onSenderNamesChange={updateSenderNames}
            />
          )}

          <View ref={balanceFieldRef}>
            <TextField
              label={t("balance")}
              testID="initial-balance-input"
              placeholder="0"
              value={formData.balance}
              onChangeText={(text) => {
                updateField("balance", text);
              }}
              error={errors.balance}
              keyboardType="numeric"
              onFocus={handleBalanceFieldFocus}
            />
          </View>

          {/* Default Account Toggle */}
          <TouchableOpacity
            onPress={toggleDefault}
            activeOpacity={0.7}
            className="flex-row items-center justify-between py-4 px-1 mb-3"
          >
            <View className="flex-row items-center flex-1">
              <Ionicons
                name={isDefault ? "star" : "star-outline"}
                size={22}
                color={
                  isDefault
                    ? palette.nileGreen[500]
                    : isDark
                      ? palette.slate[400]
                      : palette.slate[500]
                }
              />
              <View className="ms-3 flex-1">
                <Text className="text-base font-semibold text-slate-800 dark:text-white">
                  {t("default_account")}
                </Text>
                <Text className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {t("default_account_description")}
                </Text>
              </View>
            </View>
            <View
              className={`w-12 h-7 rounded-full justify-center px-0.5 ${
                isDefault
                  ? "bg-nileGreen-500"
                  : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <View
                className={`w-6 h-6 rounded-full bg-white ${
                  isDefault ? "self-end" : "self-start"
                }`}
                // eslint-disable-next-line react-native/no-inline-styles
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              />
            </View>
          </TouchableOpacity>

          <View ref={smsMatchingSectionRef}>
            <SmsMatchingSection
              accountType={accountType}
              institutionId={formData.institutionId ?? null}
              senderNames={formData.senderNames ?? []}
              cardLast4={formData.cardLast4 ?? ""}
              cardLast4Error={errors.cardLast4}
              expanded={isSmsMatchingExpanded}
              onToggleExpanded={() =>
                setIsSmsMatchingExpanded(!isSmsMatchingExpanded)
              }
              onSenderNamesChange={updateSenderNames}
              onFieldFocus={handleSmsFieldFocus}
              onCardLast4Change={(val) => {
                const cleaned = val.replace(/\D/g, "").slice(0, 4);
                updateField("cardLast4", cleaned);
              }}
            />
          </View>

          {/* Danger Zone */}
          <View className="mt-8 rounded-2xl border border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/10 p-4">
            <Text className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">
              {t("danger_zone")}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("delete_account_warning")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowDeleteSheet(true);
                loadCounts();
              }}
              activeOpacity={0.7}
              className="flex-row items-center justify-center py-3 rounded-xl border border-red-300 dark:border-red-700"
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={palette.red[500]}
              />
              <Text className="ms-2 text-base font-semibold text-red-500">
                {t("delete_account")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {keyboardHeight > 0 ? (
          <View
            // eslint-disable-next-line react-native/no-inline-styles
            style={{ height: keyboardHeight }}
          />
        ) : null}
      </ScrollView>

      {/* Balance Changed Sheet */}
      <BalanceChangedSheet
        visible={showBalanceSheet}
        onConfirm={handleBalanceSheetConfirm}
        onCancel={() => setShowBalanceSheet(false)}
        previousBalance={originalBalance}
        newBalance={parseFloat(formData.balance) || 0}
        currencyCode={currency}
        isSubmitting={isSubmitting}
      />
      {/* Delete Account Sheet */}
      <DeleteAccountSheet
        visible={showDeleteSheet}
        onConfirm={() => {
          performDelete(account.id).catch((err: unknown) =>
            logger.error("[EditAccount] Delete failed", err)
          );
        }}
        onCancel={() => setShowDeleteSheet(false)}
        accountName={displayName || account.name}
        accountBalance={account.balance}
        currencyCode={currency}
        linkedRecords={linkedCounts}
        isLoadingCounts={isLoadingCounts}
        isDeleting={isDeleting}
      />
    </KeyboardAvoidingView>
  );
}
