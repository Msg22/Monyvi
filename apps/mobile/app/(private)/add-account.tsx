import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountPreviewCard } from "@/components/add-account/AccountPreviewCard";
import { AccountTypeSelector } from "@/components/add-account/AccountTypeSelector";
import { InstitutionProviderSection } from "@/components/add-account/InstitutionProviderSection";
import { SmsMatchingSection } from "@/components/add-account/SmsMatchingSection";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { PageHeader } from "@/components/navigation/PageHeader";
import { TextField } from "@/components/ui/TextField";
import { getCurrencyOptions } from "@/constants/accounts";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import {
  useAccountForm,
  useCreateAccount,
  useEgyptianInstitutionEligibility,
} from "@/hooks";
import type { CurrencyType } from "@monyvi/db";

const FOCUSED_FIELD_KEYBOARD_GAP = 24;

interface CurrencySelectFieldProps {
  readonly value: CurrencyType;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onChange: (currency: CurrencyType) => void;
  readonly label: string;
}

function CurrencySelectField({
  value,
  isOpen,
  onOpen,
  onClose,
  onChange,
  label,
}: CurrencySelectFieldProps): React.JSX.Element {
  const selectedCurrency = getCurrencyOptions().find(
    (currency) => currency.value === value
  );

  return (
    <View className="mb-3">
      <Text className="input-label mb-2">{label}</Text>
      <View className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="p-4"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center">
              <Text className="me-3 w-8 text-xl">{selectedCurrency?.icon}</Text>
              <Text className="flex-1 text-base font-medium text-slate-900 dark:text-white">
                {selectedCurrency?.label ?? value}
              </Text>
            </View>
            <Ionicons
              name="chevron-down"
              size={18}
              color={palette.slate[500]}
            />
          </View>
        </TouchableOpacity>
      </View>

      <CurrencyPicker
        visible={isOpen}
        selectedCurrency={value}
        onSelect={onChange}
        onClose={onClose}
      />
    </View>
  );
}

export default function AddAccount(): React.ReactNode {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");

  // Optional `?type=` URL param — used by deep-links (e.g.
  // OnboardingGuideCard's "Add bank account" step) to pre-select the
  // account type so the user lands on the right radio option without an
  // extra tap. Only the three known types are honored; anything else
  // falls through to the default ("CASH") to avoid arbitrary-string state.
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const initialAccountType = useMemo(() => {
    return typeParam === "BANK" ||
      typeParam === "CASH" ||
      typeParam === "DIGITAL_WALLET"
      ? typeParam
      : undefined;
  }, [typeParam]);

  // Custom hooks for form state and business logic
  const {
    formData,
    errors,
    updateField,
    selectKnownInstitution,
    selectOtherInstitution,
    updateSenderNames,
    validate,
    isValid,
    isCheckingUniqueness,
  } = useAccountForm({
    initialAccountType,
  });

  const { createAccount, isSubmitting } = useCreateAccount();
  const { isEligible: isKnownProviderEligible } =
    useEgyptianInstitutionEligibility();

  // Local UI state
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isSmsMatchingExpanded, setIsSmsMatchingExpanded] = useState(false);
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
            insets.bottom -
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
    [insets.bottom, windowHeight]
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

  /**
   * Handles the save action by validating the form and calling the creation hook.
   */
  const handleSave = async (): Promise<void> => {
    if (isSubmitting) return;

    if (validate()) {
      await createAccount(formData);
    }
  };

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
        title={t("add_account")}
        showBackButton={true}
        backIcon="arrow"
        rightAction={{
          label: isSubmitting ? t("saving") : tCommon("save"),
          onPress: () => {
            void handleSave();
          },
          loading: isSubmitting,
          disabled: isSubmitting || isCheckingUniqueness || !isValid,
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
          paddingBottom: insets.bottom + 160,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4">
          <AccountPreviewCard
            accountType={formData.accountType}
            accountName={formData.name}
            balance={formData.balance}
            currency={formData.currency}
            institutionId={formData.institutionId ?? null}
            providerDisplayName={formData.providerDisplayName ?? ""}
          />

          <AccountTypeSelector
            value={formData.accountType}
            onChange={(accountType) => updateField("accountType", accountType)}
          />

          <TextField
            label={t("account_name")}
            testID="account-name-input"
            placeholder={
              formData.accountType === "BANK"
                ? t("account_name_placeholder_bank")
                : formData.accountType === "DIGITAL_WALLET"
                  ? t("account_name_placeholder_wallet")
                  : t("account_name_placeholder_cash")
            }
            value={formData.name}
            onChangeText={(text) => updateField("name", text)}
            error={errors.name}
            maxLength={50}
          />

          {(formData.accountType === "BANK" ||
            formData.accountType === "DIGITAL_WALLET") && (
            <InstitutionProviderSection
              accountType={formData.accountType}
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

          <CurrencySelectField
            label={t("currency")}
            value={formData.currency}
            isOpen={isCurrencyOpen}
            onOpen={() => setIsCurrencyOpen(true)}
            onClose={() => setIsCurrencyOpen(false)}
            onChange={(currency) => updateField("currency", currency)}
          />

          <View ref={balanceFieldRef}>
            <TextField
              label={t("initial_balance")}
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

          <View ref={smsMatchingSectionRef}>
            <SmsMatchingSection
              accountType={formData.accountType}
              institutionId={formData.institutionId ?? null}
              senderNames={formData.senderNames ?? []}
              cardLast4={formData.cardLast4 || ""}
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
        </View>
        {keyboardHeight > 0 ? (
          <View
            // eslint-disable-next-line react-native/no-inline-styles
            style={{ height: keyboardHeight }}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
