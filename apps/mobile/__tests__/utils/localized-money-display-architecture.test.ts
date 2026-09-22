import { readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const MOBILE_ROOT = resolve(__dirname, "../..");
const PRODUCTION_ROOTS = ["app", "components", "hooks", "services", "utils"];
const LOCALIZED_MONEY_ADAPTER = resolve(
  MOBILE_ROOT,
  "utils/localized-money-display.ts"
);

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

function readMobileSource(relativePath: string): string {
  return readFileSync(resolve(MOBILE_ROOT, relativePath), "utf8");
}

describe("localized money display architecture", () => {
  it("routes direct money-formatting calls through the mobile adapter", () => {
    const bypasses = PRODUCTION_ROOTS.flatMap((directory) =>
      listSourceFiles(resolve(MOBILE_ROOT, directory))
    )
      .filter((path) => path !== LOCALIZED_MONEY_ADAPTER)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return /\b(?:formatCurrency|formatMoneyAmount)\s*\(/u.test(source);
      })
      .map((path) => path.replace(`${MOBILE_ROOT}\\`, ""));

    expect(bypasses).toEqual([]);
  });

  it("localizes remaining manual rate and transfer output", () => {
    const liveRatesHook = readMobileSource("hooks/useLiveRatesScreen.ts");
    const dashboardRates = readMobileSource(
      "components/dashboard/LiveRates.tsx"
    );
    const liveRatesReadModel = readMobileSource(
      "services/live-rates-screen-read-model-service.ts"
    );
    const transferFields = readMobileSource(
      "components/add-transaction/TransferFields.tsx"
    );
    const metalsRates = readMobileSource(
      "components/metals/LiveRatesStrip.tsx"
    );
    const goldHero = readMobileSource("components/live-rates/GoldHeroCard.tsx");
    const metalCard = readMobileSource("components/live-rates/MetalCard.tsx");

    expect(liveRatesHook).not.toContain("formatCurrency");
    expect(liveRatesReadModel).toContain("formatLocalizedMoneyAmount");
    expect(liveRatesReadModel).not.toContain("getCurrencyAmountLabel");
    expect(dashboardRates).toContain("formatLocalizedMoneyAmount");
    expect(dashboardRates).toContain("price_per_gram");
    expect(dashboardRates).not.toMatch(/\.toLocaleString\(|\.toFixed\(|\/g/u);
    expect(transferFields).toContain("formatLocalizedMoneyAmount");
    expect(transferFields).not.toContain("exchangeRate.toFixed");
    expect(metalsRates).toContain("formatLocalizedMoneyAmount");
    expect(metalsRates).toContain("price_per_ounce");
    expect(metalsRates).toContain("price_per_gram");
    expect(metalsRates).not.toMatch(
      /goldPerOz\.toFixed|silverPricePerGramUsd\.toFixed|\/oz|\/g/u
    );
    expect(goldHero).toContain("price_per_gram");
    expect(metalCard).toContain("price_per_gram");
    expect([goldHero, metalCard].join("\n")).not.toMatch(
      /\{currencySymbol\}|\/g/u
    );
  });

  it("keeps monetary signs inside the localized amount adapter", () => {
    const sources = [
      "components/recurring-payments/RecurringPaymentSummaryCard.tsx",
      "components/metals/MetalsHeroCard.tsx",
      "components/transactions/GroupHeader.tsx",
    ].map(readMobileSource);

    for (const source of sources) {
      expect(source).toContain("signDisplay");
      expect(source).not.toMatch(/(?:const\s+sign\s*=|\{sign\}|\$\{sign\})/u);
    }
  });

  it("prevents manual currency and amount interpolation in production components", () => {
    const bypasses = listSourceFiles(resolve(MOBILE_ROOT, "components"))
      .filter((path) => path !== LOCALIZED_MONEY_ADAPTER)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return /\$\{(?:currency|currencyCode|preferredCurrency)\}\s+\$\{|\$\{[^}]+\}\s+\$\{(?:currency|currencyCode|preferredCurrency)\}/u.test(
          source
        );
      })
      .map((path) => path.replace(`${MOBILE_ROOT}\\`, ""));

    expect(bypasses).toEqual([]);
  });

  it("routes onboarding monetary examples through the localized adapter", () => {
    const onboardingSources = [
      "components/onboarding/Slide1Voice.tsx",
      "components/onboarding/Slide2Offline.tsx",
      "components/onboarding/Slide2SMS.tsx",
      "components/onboarding/Slide3LiveMarket.tsx",
    ].map(readMobileSource);

    for (const source of onboardingSources) {
      expect(source).toContain("formatLocalizedMoney");
    }
    expect(onboardingSources.join("\n")).not.toMatch(
      /(?:EGP\s+342,180|−40 EGP|−2,000 EGP|\+500 EGP|200 EGP|85 EGP|340 EGP|485\s*\{?" "?\}?\s*EGP|4,218 EGP\/g|54\.20 EGP\/g)/u
    );
  });
});
