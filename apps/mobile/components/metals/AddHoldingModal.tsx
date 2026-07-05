/**
 * AddHoldingModal Component
 *
 * Bottom sheet modal for adding a new gold or silver holding.
 * Includes metal type toggle, purity selector, weight/price/date inputs,
 * and inline error handling with retry.
 *
 * Architecture & Design Rationale:
 * - Pattern: Container Component (handles form state + service call)
 * - Why: Encapsulates the entire "add holding" workflow. Service call
 *   is delegated to metal-holding-service.ts (separation of concerns).
 * - SOLID: SRP — manages the add-holding form lifecycle only.
 *
 * @module AddHoldingModal
 */

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import type { MetalType } from "@monyvi/db";
import { FINENESS_OPTIONS, GOLD_PURITY_OPTIONS } from "@monyvi/logic";

import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { formatDate } from "@/utils/dateHelpers";
import {
  createMetalHolding,
  type CreateMetalHoldingData,
  type ItemForm,
} from "@/services/metal-holding-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddHoldingModalProps {
  /** Whether the modal is visible */
  readonly visible: boolean;
  /** Callback to close the modal */
  readonly onClose: () => void;
  /** Pre-selected metal type */
  readonly initialMetalType?: MetalType;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCROLL_CONTENT_STYLE = { padding: 24 };
const PURITY_SCROLL_STYLE = { gap: 8 };
const WHITE_COLOR = palette.slate[50];

const ITEM_FORMS: ReadonlyArray<{ value: ItemForm; labelKey: string }> = [
  { value: "COIN", labelKey: "form_coin" },
  { value: "BAR", labelKey: "form_bar" },
  { value: "JEWELRY", labelKey: "form_jewelry" },
];

const ERROR_DISPLAY_DURATION_MS = 5000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom sheet modal for adding a new gold or silver holding.
 */
export function AddHoldingModal({
  visible,
  onClose,
  initialMetalType = "GOLD",
}: AddHoldingModalProps): React.JSX.Element {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferredCurrency } = usePreferredCurrency();
  const { t } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");
  const { showToast } = useToast();

  // Sync metalType when initialMetalType changes (e.g., opening from different tab)
  useEffect(() => {
    setMetalType(initialMetalType);
  }, [initialMetalType]);

  // Form state
  const [metalType, setMetalType] = useState<MetalType>(initialMetalType);
  const [name, setName] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPurityIndex, setSelectedPurityIndex] = useState(0);
  const [selectedItemForm, setSelectedItemForm] = useState<
    ItemForm | undefined
  >(undefined);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronous ref guard to prevent race condition on rapid double-taps.
  // State updates (setIsSaving) are async and can be outrun by fast taps.
  const inFlightRef = useRef(false);

  // Clean up error auto-dismiss timeout on unmount or when errorMessage changes
  useEffect(() => {
    if (!errorMessage) return undefined;

    const timerId = setTimeout(() => {
      setErrorMessage(null);
    }, ERROR_DISPLAY_DURATION_MS);

    return (): void => {
      clearTimeout(timerId);
    };
  }, [errorMessage]);

  // Derived
  const purityOptions = useMemo(
    () => (metalType === "GOLD" ? GOLD_PURITY_OPTIONS : FINENESS_OPTIONS),
    [metalType]
  );

  const selectedPurity = purityOptions[selectedPurityIndex];

  const isFormValid = useMemo((): boolean => {
    const weight = parseFloat(weightGrams);
    const price = parseFloat(purchasePrice);
    return (
      name.trim().length > 0 &&
      Number.isFinite(weight) &&
      weight > 0 &&
      Number.isFinite(price) &&
      price > 0
    );
  }, [name, weightGrams, purchasePrice]);

  // Reset form when modal opens with new initialMetalType
  const handleClose = useCallback((): void => {
    if (isSaving) return;
    setName("");
    setWeightGrams("");
    setPurchasePrice("");
    setPurchaseDate(new Date());
    setSelectedPurityIndex(0);
    setSelectedItemForm(undefined);
    setErrorMessage(null);
    onClose();
  }, [isSaving, onClose]);

  const handleMetalTypeChange = useCallback((type: MetalType): void => {
    setMetalType(type);
    setSelectedPurityIndex(0);
  }, []);

  const handleDateChange = useCallback(
    (_event: unknown, selectedDate?: Date): void => {
      setShowDatePicker(Platform.OS === "ios");
      if (selectedDate) {
        setPurchaseDate(selectedDate);
      }
    },
    []
  );

  const handleSaveAsync = useCallback(async (): Promise<void> => {
    // Synchronous guard — blocks rapid taps immediately
    if (inFlightRef.current) return;
    if (!isFormValid || isSaving) return;

    inFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage(null);

    const data: CreateMetalHoldingData = {
      name: name.trim(),
      metalType,
      weightGrams: parseFloat(weightGrams),
      purityFraction: selectedPurity?.fraction ?? 1,
      purchasePrice: parseFloat(purchasePrice),
      purchaseDate,
      currency: preferredCurrency,
      itemForm: selectedItemForm,
    };

    try {
      await createMetalHolding(data);
      showToast({
        type: "success",
        title: t("holding_created"),
        message: t("holding_created_message"),
      });
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("error_save_failed");
      setErrorMessage(message);
      showToast({
        type: "error",
        title: t("holding_create_failed"),
        message,
      });
      // Auto-dismiss is handled by the useEffect above
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  }, [
    isFormValid,
    isSaving,
    name,
    metalType,
    weightGrams,
    selectedPurity,
    purchasePrice,
    purchaseDate,
    preferredCurrency,
    selectedItemForm,
    handleClose,
    showToast,
    t,
  ]);

  const handleSave = useCallback((): void => {
    void handleSaveAsync();
  }, [handleSaveAsync]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View className="flex-1 justify-end bg-black/50">
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <View
                className="rounded-t-[32px] bg-white dark:bg-slate-800"
                style={{ paddingBottom: insets.bottom + 24 }}
              >
                <ScrollView
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={SCROLL_CONTENT_STYLE}
                >
                  {/* Handle */}
                  <View className="mb-6 h-1 w-10 self-center rounded-full bg-slate-200 dark:bg-slate-600" />

                  {/* Title */}
                  <Text className="mb-6 self-center text-xl font-bold text-slate-800 dark:text-white">
                    {t("add_new_holding")}
                  </Text>

                  {/* Metal Type Toggle */}
                  <View className="mb-5 flex-row rounded-2xl bg-slate-100 dark:bg-slate-700 p-1">
                    {(["GOLD", "SILVER"] as const).map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => handleMetalTypeChange(type)}
                        activeOpacity={0.8}
                        className={`flex-1 items-center rounded-xl py-3 ${
                          metalType === type ? "" : "bg-transparent"
                        }`}
                        style={
                          metalType === type
                            ? {
                                backgroundColor:
                                  type === "GOLD"
                                    ? palette.gold[600]
                                    : palette.slate[500],
                              }
                            : undefined
                        }
                      >
                        <Text
                          className={`font-semibold capitalize ${
                            metalType === type
                              ? "text-white"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {t(type === "GOLD" ? "gold" : "silver")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Purity Selection */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("purity")}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-5"
                    contentContainerStyle={PURITY_SCROLL_STYLE}
                  >
                    {purityOptions.map((option, index) => {
                      const isSelected = index === selectedPurityIndex;
                      const isGold = metalType === "GOLD";
                      return (
                        <TouchableOpacity
                          key={option.label}
                          onPress={() => setSelectedPurityIndex(index)}
                          activeOpacity={0.8}
                          className={`items-center rounded-full px-4 py-2 border ${
                            isSelected
                              ? isGold
                                ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-600"
                                : "border-slate-500 bg-slate-100 dark:bg-slate-600 dark:border-slate-500"
                              : "border-slate-200 dark:border-slate-600 bg-transparent"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              isSelected
                                ? isGold
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-slate-700 dark:text-white"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Name Input */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("name")}
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={t("name_placeholder")}
                    placeholderTextColor={
                      isDark ? palette.slate[500] : palette.slate[400]
                    }
                    className="mb-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-base text-slate-800 dark:text-white"
                    maxLength={100}
                  />

                  {/* Weight Input */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("weight_grams")}
                  </Text>
                  <TextInput
                    value={weightGrams}
                    onChangeText={setWeightGrams}
                    placeholder={t("weight_placeholder")}
                    placeholderTextColor={
                      isDark ? palette.slate[500] : palette.slate[400]
                    }
                    keyboardType="decimal-pad"
                    className="mb-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-base text-slate-800 dark:text-white"
                  />

                  {/* Purchase Price Input */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("purchase_price_currency", {
                      currency: preferredCurrency,
                    })}
                  </Text>
                  <TextInput
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                    placeholder={t("purchase_price_placeholder")}
                    placeholderTextColor={
                      isDark ? palette.slate[500] : palette.slate[400]
                    }
                    keyboardType="decimal-pad"
                    className="mb-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-base text-slate-800 dark:text-white"
                  />

                  {/* Purchase Date */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("purchase_date")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    className="mb-5 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-4 py-3"
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={isDark ? palette.slate[400] : palette.slate[500]}
                    />
                    <Text className="ms-2 text-base text-slate-800 dark:text-white">
                      {formatDate(purchaseDate, "MMM d, yyyy")}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={purchaseDate}
                      mode="date"
                      maximumDate={new Date()}
                      onChange={handleDateChange}
                    />
                  )}

                  {/* Item Form (Optional) */}
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    {t("form_optional")}
                  </Text>
                  <View className="flex-row gap-2 mb-6">
                    {ITEM_FORMS.map((form) => {
                      const isSelected = selectedItemForm === form.value;
                      return (
                        <TouchableOpacity
                          key={form.value}
                          onPress={() =>
                            setSelectedItemForm(
                              isSelected ? undefined : form.value
                            )
                          }
                          activeOpacity={0.8}
                          className={`flex-1 items-center rounded-xl py-2.5 border ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600"
                              : "border-slate-200 dark:border-slate-600 bg-transparent"
                          }`}
                        >
                          <Text
                            className={`text-sm font-medium ${
                              isSelected
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {t(form.labelKey)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Error Toast (Inline) */}
                  {errorMessage ? (
                    <View className="mb-4 flex-row items-center rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
                      <Ionicons
                        name="alert-circle"
                        size={18}
                        color={palette.red[500]}
                      />
                      <Text className="ms-2 flex-1 text-sm text-red-700 dark:text-red-400">
                        {errorMessage}
                      </Text>
                      <TouchableOpacity onPress={handleSave}>
                        <Text className="text-sm font-bold text-red-600 dark:text-red-400">
                          {tCommon("retry")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Save Button */}
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={!isFormValid || isSaving}
                    activeOpacity={0.85}
                    className={`items-center rounded-2xl py-4 ${
                      !isFormValid || isSaving ? "opacity-50" : ""
                    }`}
                    style={{
                      backgroundColor:
                        metalType === "GOLD"
                          ? palette.gold[600]
                          : palette.slate[500],
                    }}
                  >
                    {isSaving ? (
                      <ActivityIndicator color={WHITE_COLOR} />
                    ) : (
                      <Text className="text-lg font-bold text-white">
                        {t("add_to_savings")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
