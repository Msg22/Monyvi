from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))

card = "apps/mobile/components/stats/CategoryDrilldownCard.tsx"
replace_once(
    card,
    '''                hasChildren={cat.childrenIds.length > 0}
              />''',
    '''                hasChildren={cat.childrenIds.length > 0}
                currency={currency}
              />''',
)

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
