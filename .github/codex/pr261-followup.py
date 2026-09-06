from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


# 1) Stats screen: wait for preference/discovery, show retryable error, and key
# sections by selected currency so stale hook results cannot be relabeled.
stats = "apps/mobile/app/(private)/(tabs)/stats.tsx"
replace_once(
    stats,
    'import { ScrollView, View } from "react-native";',
    'import { ScrollView, Text, TouchableOpacity, View } from "react-native";',
)
replace_once(
    stats,
    '''  const { preferredCurrency } = usePreferredCurrency();
  const {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
  } = useStatsCurrencyFilter(preferredCurrency);
''',
    '''  const {
    preferredCurrency,
    isLoading: isPreferredCurrencyLoading,
  } = usePreferredCurrency();
  const {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading,
    error,
    retry,
  } = useStatsCurrencyFilter(
    preferredCurrency,
    isPreferredCurrencyLoading
  );
''',
)
replace_once(
    stats,
    '''        <View className="px-5 pt-4">
          <QuickStats currency={selectedCurrency} />
          <MonthlyExpenseChart currency={selectedCurrency} />
          <CategoryDrilldownCard currency={selectedCurrency} />
        </View>
''',
    '''        <View className="px-5 pt-4">
          {isLoading ? (
            <View
              testID="stats-currency-loading"
              className="py-10 items-center"
            >
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("loading")}
              </Text>
            </View>
          ) : error ? (
            <View
              testID="stats-currency-error"
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("error_generic")}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={retry}
                className="mt-3 self-start rounded-xl border border-nileGreen-500 px-4 py-2"
              >
                <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                  {t("retry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <QuickStats
                key={`quick-stats-${selectedCurrency}`}
                currency={selectedCurrency}
              />
              <MonthlyExpenseChart
                key={`monthly-chart-${selectedCurrency}`}
                currency={selectedCurrency}
              />
              <CategoryDrilldownCard
                key={`category-drilldown-${selectedCurrency}`}
                currency={selectedCurrency}
              />
            </>
          )}
        </View>
''',
)

# 2) Hook: defer initialization until profile currency is settled and expose retry.
hook = "apps/mobile/hooks/useStatsCurrencyFilter.ts"
replace_once(
    hook,
    '''  readonly isLoading: boolean;
  readonly error: Error | null;
}''',
    '''  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}''',
)
replace_once(
    hook,
    '''export function useStatsCurrencyFilter(
  preferredCurrency: CurrencyType
): UseStatsCurrencyFilterResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requestedCurrency, setRequestedCurrency] =
    useState<CurrencyType>(preferredCurrency);
  const [isLoading, setIsLoading] = useState(true);
''',
    '''export function useStatsCurrencyFilter(
  preferredCurrency: CurrencyType,
  isPreferredCurrencyLoading: boolean = false
): UseStatsCurrencyFilterResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requestedCurrency, setRequestedCurrency] =
    useState<CurrencyType | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
''',
)
replace_once(hook, '      setIsLoading(true);', '      setIsDiscoveryLoading(true);')
replace_once(hook, '      setIsLoading(false);', '      setIsDiscoveryLoading(false);')
replace_once(hook, '    setIsLoading(true);', '    setIsDiscoveryLoading(true);')
replace_once(hook, '          setIsLoading(false);', '          setIsDiscoveryLoading(false);')
replace_once(hook, '          setIsLoading(false);', '          setIsDiscoveryLoading(false);')
replace_once(
    hook,
    '''  }, [userId, isResolvingUser]);''',
    '''  }, [userId, isResolvingUser, retryVersion]);''',
)
replace_once(
    hook,
    '''      resolveSelectedCurrency(
        requestedCurrency,
        availableCurrencies,
        preferredCurrency
      ),
    [requestedCurrency, availableCurrencies, preferredCurrency]
  );

  useEffect(() => {
    setRequestedCurrency(selectedCurrency);
  }, [selectedCurrency]);
''',
    '''      resolveSelectedCurrency(
        isPreferredCurrencyLoading ? null : requestedCurrency,
        availableCurrencies,
        preferredCurrency
      ),
    [
      requestedCurrency,
      availableCurrencies,
      preferredCurrency,
      isPreferredCurrencyLoading,
    ]
  );

  useEffect(() => {
    if (!isPreferredCurrencyLoading) {
      setRequestedCurrency(selectedCurrency);
    }
  }, [isPreferredCurrencyLoading, selectedCurrency]);
''',
)
replace_once(
    hook,
    '''  return {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading,
    error,
  };
}''',
    '''  const retry = useCallback((): void => {
    setRetryVersion((current) => current + 1);
  }, []);

  return {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading: isDiscoveryLoading || isPreferredCurrencyLoading,
    error,
    retry,
  };
}''',
)
replace_once(
    hook,
    '''function resolveSelectedCurrency(
  requestedCurrency: CurrencyType,
''',
    '''function resolveSelectedCurrency(
  requestedCurrency: CurrencyType | null,
''',
)
replace_once(
    hook,
    '''  if (availableCurrencies.includes(requestedCurrency)) {
    return requestedCurrency;
  }
''',
    '''  if (
    requestedCurrency !== null &&
    availableCurrencies.includes(requestedCurrency)
  ) {
    return requestedCurrency;
  }

  if (availableCurrencies.includes(preferredCurrency)) {
    return preferredCurrency;
  }
''',
)

# 3) Selector: retain all transaction currencies, localize names, and expose selected state.
filter_path = "apps/mobile/components/stats/StatsCurrencyFilter.tsx"
replace_once(
    filter_path,
    'import React, { useMemo, useState } from "react";',
    'import React, { useMemo, useState } from "react";\nimport { useLocale } from "@/context/LocaleContext";',
)
replace_once(
    filter_path,
    '''  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
''',
    '''  const { t } = useTranslation("common");
  const { language } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
''',
)
replace_once(
    filter_path,
    '''              const isSelected = item.code === selectedCurrency;

              return (
                <TouchableOpacity
''',
    '''              const isSelected = item.code === selectedCurrency;
              const localizedName = getLocalizedCurrencyName(item, language);

              return (
                <TouchableOpacity
''',
)
replace_once(
    filter_path,
    '''                  key={item.code}
                  testID={`stats-currency-option-${item.code}`}
                  activeOpacity={0.7}
''',
    '''                  key={item.code}
                  testID={`stats-currency-option-${item.code}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${item.code}, ${localizedName}`}
                  accessibilityState={{ selected: isSelected }}
                  activeOpacity={0.7}
''',
)
replace_once(filter_path, '                      {item.name}', '                      {localizedName}')
replace_once(
    filter_path,
    '''function getCurrencyItems(
  availableCurrencies: readonly CurrencyType[]
): CurrencyInfo[] {
  const availableSet = new Set(availableCurrencies);
  return SORTED_SUPPORTED_CURRENCIES.filter((currency) =>
    availableSet.has(currency.code)
  );
}
''',
    '''function getCurrencyItems(
  availableCurrencies: readonly CurrencyType[]
): CurrencyInfo[] {
  const metadataByCode = new Map(
    SORTED_SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency])
  );

  return availableCurrencies.map((code) => {
    const metadata = metadataByCode.get(code);
    if (metadata) return metadata;

    return {
      code,
      name: code,
      symbol: code === "BTC" ? "₿" : code,
      flag: code === "BTC" ? "₿" : "💱",
    };
  });
}

function getLocalizedCurrencyName(
  item: CurrencyInfo,
  language: string
): string {
  try {
    const currencyPart = new Intl.NumberFormat(language, {
      style: "currency",
      currency: item.code,
      currencyDisplay: "name",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;

    if (currencyPart && currencyPart !== item.code) {
      return currencyPart;
    }
  } catch {
    // Fall through to a language-neutral code when Intl lacks metadata.
  }

  return language.startsWith("en") ? item.name : item.code;
}
''',
)

# 4) Drilldown rows: use page-selected currency, never global preference.
row = "apps/mobile/components/stats/drilldown/DrilldownCategoryItem.tsx"
replace_once(row, 'import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";\n', '')
replace_once(row, 'import { formatCurrency } from "@monyvi/logic";', 'import type { CurrencyType } from "@monyvi/db";\nimport { formatCurrency } from "@monyvi/logic";')
replace_once(
    row,
    '''  readonly hasChildren: boolean;
}''',
    '''  readonly hasChildren: boolean;
  readonly currency: CurrencyType;
}''',
)
replace_once(
    row,
    '''  onPress,
  hasChildren,
}: DrilldownCategoryItemProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { language } = useLocale();
  const { preferredCurrency } = usePreferredCurrency();
''',
    '''  onPress,
  hasChildren,
  currency,
}: DrilldownCategoryItemProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { language } = useLocale();
''',
)
row_text = Path(row).read_text().replace('currency: preferredCurrency', 'currency')
Path(row).write_text(row_text)

card = "apps/mobile/components/stats/CategoryDrilldownCard.tsx"
replace_once(
    card,
    '''                hasChildren={cat.childrenIds.length > 0}
              />''',
    '''                hasChildren={cat.childrenIds.length > 0}
                currency={currency}
              />''',
)

# 5) Update component test mocks/coverage for locale, BTC completeness and a11y.
test = "apps/mobile/__tests__/components/stats/StatsCurrencyFilter.test.tsx"
replace_once(
    test,
    '''jest.mock("react-i18next", () => ({''',
    '''jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

jest.mock("react-i18next", () => ({''',
)
replace_once(
    test,
    '''  it("disables the selector when only one transaction currency exists", () => {''',
    '''  it("keeps valid transaction currencies that are missing from the fiat catalog", () => {
    render(
      <StatsCurrencyFilter
        availableCurrencies={["BTC", "EGP"]}
        selectedCurrency="BTC"
        onSelectCurrency={jest.fn()}
      />
    );

    expect(screen.getByTestId("stats-currency-trigger")).not.toBeDisabled();
    fireEvent.press(screen.getByTestId("stats-currency-trigger"));
    expect(screen.getByTestId("stats-currency-option-BTC")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-EGP")).toBeOnTheScreen();
    expect(screen.getByTestId("stats-currency-option-BTC")).toHaveAccessibilityState({
      selected: true,
    });
  });

  it("disables the selector when only one transaction currency exists", () => {''',
)
