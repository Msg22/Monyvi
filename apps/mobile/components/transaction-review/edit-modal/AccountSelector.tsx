import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { AccountType, CurrencyType } from "@monyvi/db";
import { AccountIdentityMark } from "@/components/institutions/AccountIdentityMark";

export interface AccountOption {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyType;
  readonly isPending: boolean;
  readonly type?: AccountType;
  readonly institutionId?: string | null;
}

export interface AccountSelectorProps {
  readonly label: string;
  readonly options: readonly AccountOption[];
  // Display overrides
  readonly placeholder: string;
  readonly hintMessage: string;
  readonly themeColor?: "emerald" | "amber";
  readonly iconName?: keyof typeof Ionicons.glyphMap; // used for lists (like "cash")
  /** Pass true to offset spacing differently when used as a second field */
  readonly isSecondary?: boolean;

  // Selection state
  readonly selectedId: string | null;
  readonly selectedName: string;
  readonly onSelect: (opt: AccountOption) => void;

  // Picker UI State
  readonly isPickerOpen: boolean;
  readonly onTogglePicker: () => void;
  readonly errorMsg?: string;

  // New account state
  readonly allowCreateNew: boolean;
  readonly isCreatingNew: boolean;
  readonly newAccountName: string;
  readonly onNewAccountNameChange: (text: string) => void;
  readonly newAccountError?: string | null;
  readonly onStartNew: () => void;
  readonly onCancelNew: () => void;

  // Currency-aware sorted account groups (optional)
  /** Matching-currency accounts shown first, then others. If not provided, all options shown flat. */
  readonly matchingAccounts?: readonly AccountOption[];
  readonly otherAccounts?: readonly AccountOption[];
  /** Whether to show section headers */
  readonly showSectionHeaders?: boolean;
  /** Label for the matching section header */
  readonly matchingSectionLabel?: string;
}

export function AccountSelector({
  label,
  options,
  placeholder,
  hintMessage,
  themeColor = "emerald",
  iconName,
  isSecondary = false,
  selectedId,
  selectedName,
  onSelect,
  isPickerOpen,
  onTogglePicker,
  errorMsg,
  allowCreateNew,
  isCreatingNew,
  newAccountName,
  onNewAccountNameChange,
  newAccountError,
  onStartNew,
  onCancelNew,
  matchingAccounts,
  otherAccounts,
  showSectionHeaders = false,
  matchingSectionLabel,
}: AccountSelectorProps): React.JSX.Element {
  const hasOptions = options.length > 0;
  const { t } = useTranslation("transactions");
  const selectedOption = options.find((option) => option.id === selectedId);

  // Tailwind dynamic mappings
  const themeClasses = {
    emerald: {
      borderCreating: "border-emerald-500/60",
      pillBg: "bg-emerald-500/15",
      pillText: "text-emerald-400",
      hintBg: "bg-emerald-500/10",
      hintBorder: "border-emerald-500/20",
      hintIcon: palette.nileGreen[400],
      selectedRowBg: "bg-emerald-500/10",
      selectedRowText: "text-emerald-400",
    },
    amber: {
      borderCreating: "border-amber-500/60",
      pillBg: "bg-amber-500/15",
      pillText: "text-amber-400",
      hintBg: "bg-amber-500/10",
      hintBorder: "border-amber-500/20",
      hintIcon: palette.gold[400],
      selectedRowBg: "bg-amber-500/10",
      selectedRowText: "text-amber-400",
    },
  }[themeColor];

  return (
    <View
      className={
        isSecondary && !hasOptions ? "mt-5" : isSecondary ? "mt-4" : "mb-6"
      }
    >
      {/* Down arrow indicator for secondary field (ATM Cash) */}
      {isSecondary && (
        <View className="items-center -my-3 z-10 relative">
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-full w-8 h-8 items-center justify-center">
            <Ionicons name="arrow-down" size={16} color={palette.slate[400]} />
          </View>
        </View>
      )}

      {/* Label & Actions */}
      <View
        className={`flex-row items-center justify-between mb-2 ${
          isSecondary ? "mt-2" : ""
        }`}
      >
        <Text className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          {label}
        </Text>

        {allowCreateNew && isCreatingNew && (
          <TouchableOpacity
            onPress={onCancelNew}
            activeOpacity={0.7}
            className="flex-row items-center bg-red-500/15 px-2.5 py-1 rounded-full"
          >
            <Ionicons name="close" size={14} color={palette.red[400]} />
            <Text className="text-xs text-red-400 font-semibold ms-0.5">
              {t("cancel")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mode: Text Input (Creating new or no options) */}
      {allowCreateNew && (isCreatingNew || !hasOptions) ? (
        <View>
          <View
            className={`bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex-row items-center border ${
              isCreatingNew
                ? themeClasses.borderCreating
                : "border-slate-200 dark:border-slate-700/50"
            }`}
          >
            {iconName && (
              <View
                className={`w-6 h-6 rounded-full items-center justify-center me-2 ${themeClasses.pillBg}`}
              >
                <Ionicons
                  name={iconName}
                  size={12}
                  color={themeClasses.hintIcon}
                />
              </View>
            )}
            <TextInput
              value={newAccountName}
              onChangeText={onNewAccountNameChange}
              className="text-slate-800 dark:text-white text-base font-semibold flex-1"
              placeholderTextColor={palette.slate[600]}
              placeholder={
                isSecondary
                  ? t("account_name_placeholder_cash")
                  : t("account_name")
              }
              autoFocus={isCreatingNew}
            />
          </View>
          {newAccountError && (
            <Text className="text-xs text-red-400 mt-1.5 ms-1">
              {newAccountError}
            </Text>
          )}

          <View
            className={`flex-row items-start p-3 rounded-xl mt-3 border ${themeClasses.hintBg} ${themeClasses.hintBorder}`}
          >
            <Ionicons
              name={isSecondary ? "information-circle" : "checkmark-circle"}
              size={16}
              color={themeClasses.hintIcon}
            />
            <Text
              className={`text-[10px] font-bold ms-2 flex-1 leading-4 pt-0.5 uppercase ${themeClasses.pillText}`}
            >
              {hintMessage}
            </Text>
          </View>
        </View>
      ) : (
        /* Mode: Dropdown (options exist, not creating) */
        <View>
          <TouchableOpacity
            onPress={onTogglePicker}
            activeOpacity={0.7}
            className={`bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex-row items-center justify-between border ${
              errorMsg
                ? "border-red-500/60"
                : "border-slate-200 dark:border-slate-700/50"
            }`}
          >
            <View className="flex-row items-center flex-1">
              {(iconName ||
                selectedOption?.type ||
                selectedOption?.institutionId) && (
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center me-2 ${themeClasses.pillBg}`}
                >
                  <AccountIdentityMark
                    account={
                      selectedOption
                        ? {
                            type: selectedOption.type ?? null,
                            institutionId: selectedOption.institutionId,
                          }
                        : null
                    }
                    size="micro"
                    testID="sms-edit-selected-account-identity"
                    fallback={
                      iconName ? (
                        <Ionicons
                          name={iconName}
                          size={12}
                          color={themeClasses.hintIcon}
                        />
                      ) : undefined
                    }
                  />
                </View>
              )}
              <Text
                className="text-base text-slate-800 dark:text-white font-semibold flex-1"
                numberOfLines={1}
              >
                {selectedName || placeholder}
              </Text>
            </View>
            <Ionicons
              name={isPickerOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={palette.slate[500]}
            />
          </TouchableOpacity>
          {errorMsg && (
            <Text className="text-xs text-red-400 mt-1.5 ms-1">{errorMsg}</Text>
          )}

          {isPickerOpen && (
            <View className="mt-2 bg-white dark:bg-slate-800/80 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/40">
              {/* Section headers + grouped accounts (when available) */}
              {showSectionHeaders &&
                matchingAccounts &&
                matchingAccounts.length > 0 && (
                  <Text className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {matchingSectionLabel ?? t("matching_currency")}
                  </Text>
                )}
              {(showSectionHeaders && matchingAccounts
                ? matchingAccounts
                : options
              ).map((opt) => {
                const isSelected = opt.id === selectedId;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => onSelect(opt)}
                    activeOpacity={0.7}
                    className={`px-4 py-3 flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700/30 ${
                      isSelected ? themeClasses.selectedRowBg : ""
                    }`}
                  >
                    <View className="flex-row items-center flex-1">
                      {(iconName || opt.type || opt.institutionId) && (
                        <View
                          className={`w-5 h-5 rounded-full items-center justify-center me-2 ${themeClasses.pillBg}`}
                        >
                          <AccountIdentityMark
                            account={{
                              type: opt.type ?? null,
                              institutionId: opt.institutionId,
                            }}
                            size="micro"
                            testID={"sms-edit-account-identity-" + opt.id}
                            fallback={
                              iconName ? (
                                <Ionicons
                                  name={iconName}
                                  size={10}
                                  color={themeClasses.hintIcon}
                                />
                              ) : undefined
                            }
                          />
                        </View>
                      )}
                      <Text
                        className={`text-sm font-medium flex-shrink ${
                          isSelected
                            ? themeClasses.selectedRowText
                            : "text-slate-800 dark:text-white"
                        }`}
                        numberOfLines={1}
                      >
                        {opt.name}
                      </Text>
                      <Text className="text-slate-500 text-xs ms-1.5">
                        ({opt.currency})
                      </Text>

                      {opt.isPending && (
                        <View className="bg-amber-500/20 px-1.5 py-0.5 rounded ms-2">
                          <Text className="text-[10px] font-bold text-amber-400">
                            {t("new_badge")}
                          </Text>
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons
                        name={isSecondary ? "checkmark-circle" : "checkmark"}
                        size={18}
                        color={themeClasses.hintIcon}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Other accounts section (when section headers enabled) */}
              {showSectionHeaders &&
                otherAccounts &&
                otherAccounts.length > 0 && (
                  <>
                    <Text className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-200 dark:border-slate-700/40">
                      {t("other_accounts")}
                    </Text>
                    {otherAccounts.map((opt) => {
                      const isSelected = opt.id === selectedId;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => onSelect(opt)}
                          activeOpacity={0.7}
                          className={`px-4 py-3 flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700/30 ${
                            isSelected ? themeClasses.selectedRowBg : ""
                          }`}
                        >
                          <View className="flex-row items-center flex-1">
                            {(iconName || opt.type || opt.institutionId) && (
                              <View
                                className={`w-5 h-5 rounded-full items-center justify-center me-2 ${themeClasses.pillBg}`}
                              >
                                <AccountIdentityMark
                                  account={{
                                    type: opt.type ?? null,
                                    institutionId: opt.institutionId,
                                  }}
                                  size="micro"
                                  testID={"sms-edit-account-identity-" + opt.id}
                                  fallback={
                                    iconName ? (
                                      <Ionicons
                                        name={iconName}
                                        size={10}
                                        color={themeClasses.hintIcon}
                                      />
                                    ) : undefined
                                  }
                                />
                              </View>
                            )}
                            <Text
                              className={`text-sm font-medium flex-shrink ${
                                isSelected
                                  ? themeClasses.selectedRowText
                                  : "text-slate-800 dark:text-white"
                              }`}
                              numberOfLines={1}
                            >
                              {opt.name}
                            </Text>
                            <Text className="text-slate-500 text-xs ms-1.5">
                              ({opt.currency})
                            </Text>
                            {opt.isPending && (
                              <View className="bg-amber-500/20 px-1.5 py-0.5 rounded ms-2">
                                <Text className="text-[10px] font-bold text-amber-400">
                                  {t("new_badge")}
                                </Text>
                              </View>
                            )}
                          </View>
                          {isSelected && (
                            <Ionicons
                              name={
                                isSecondary ? "checkmark-circle" : "checkmark"
                              }
                              size={18}
                              color={themeClasses.hintIcon}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

              {/* "Create a new account" button — last item in dropdown */}
              {allowCreateNew && (
                <TouchableOpacity
                  onPress={onStartNew}
                  activeOpacity={0.7}
                  className="px-4 py-3 flex-row items-center border-t border-slate-200 dark:border-slate-700/40"
                >
                  <View
                    className={`w-5 h-5 rounded-full items-center justify-center me-2 ${themeClasses.pillBg}`}
                  >
                    <Ionicons
                      name="add"
                      size={12}
                      color={themeClasses.hintIcon}
                    />
                  </View>
                  <Text
                    className={`text-sm font-semibold ${themeClasses.pillText}`}
                  >
                    {t("create_new_account")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
