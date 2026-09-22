import { render, screen } from "@testing-library/react-native";
import { MetalSoldRateTrust } from "@/components/metals/MetalSoldRateTrust";
import type { MetalDisplayRateTrust } from "@/services/metal-terminal-read-model-service";
import { formatRateAge } from "@monyvi/logic";

jest.mock("react-i18next", () => ({
  useTranslation: (): unknown => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string => {
      if (key === "portfolio.rates_updated") {
        return `Updated ${values?.date} ${values?.time}`;
      }
      if (key === "rate.source") {
        return `Source: ${values?.source}`;
      }
      if (key === "rate.quality") {
        return `Quality: ${values?.quality}`;
      }
      return key;
    },
  }),
}));

it("shows unknown age without inventing a provider timestamp", () => {
  render(
    <MetalSoldRateTrust
      rates={[
        {
          currency: "EUR",
          state: "unknown",
          providerObservedAt: null,
          ageMs: null,
        },
      ]}
    />
  );
  expect(screen.getByText("EUR · rate.short_unknown")).toBeTruthy();
  expect(screen.queryByText(/Updated/)).toBeNull();
});

it("shows the known provider date with fresh status", () => {
  render(
    <MetalSoldRateTrust
      rates={[
        {
          currency: "EGP",
          state: "fresh",
          ageMs: 60_000,
          providerObservedAt: new Date(2026, 8, 1, 12),
        },
      ]}
    />
  );
  expect(screen.getByText("EGP · rate.short_fresh")).toBeTruthy();
  expect(screen.queryByText(/minute ago/)).toBeNull();
  expect(screen.getByText(/Updated 01 Sept 2026 .*PM/)).toBeTruthy();
});

it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "does not invent a relative age for %s",
  (ageMs): void => {
    expect(formatRateAge(ageMs, "en")).toBeNull();
  }
);

it("uses the existing localized age formatter for Arabic", () => {
  expect(formatRateAge(172_800_000, "ar")).toBe(
    new Intl.RelativeTimeFormat("ar", { numeric: "always" }).format(-2, "day")
  );
});

it("renders no trust block without consumed display rates", () => {
  render(<MetalSoldRateTrust rates={[]} />);
  expect(screen.queryByTestId("metal-sold-display-rate-trust")).toBeNull();
});

it("shows the consumed stale rate age alongside status and provider date", () => {
  const rate: MetalDisplayRateTrust = {
    currency: "EGP",
    state: "stale",
    providerObservedAt: new Date(2026, 8, 1, 12),
    ageMs: 172_800_000,
  };
  render(<MetalSoldRateTrust rates={[rate]} />);
  expect(screen.getByText("EGP · rate.short_stale · 2 days ago")).toBeTruthy();
  expect(screen.getByText(/Updated 01 Sept 2026 .*PM/)).toBeTruthy();
});

it("shows the distinct source and quality of each consumed rate", () => {
  render(
    <MetalSoldRateTrust
      rates={[
        {
          currency: "EGP",
          state: "fresh",
          providerObservedAt: new Date(2026, 8, 1, 12),
          ageMs: 0,
          source: "provider-a",
          quality: "valid",
        },
      ]}
    />
  );

  expect(screen.getByText("Source: provider-a")).toBeTruthy();
  expect(screen.getByText("Quality: valid")).toBeTruthy();
});

it("omits source and quality rows when the consumed rate has no provenance", () => {
  render(
    <MetalSoldRateTrust
      rates={[
        {
          currency: "EGP",
          state: "fresh",
          providerObservedAt: null,
          ageMs: null,
        },
      ]}
    />
  );

  expect(screen.queryByText(/^Source:/)).toBeNull();
  expect(screen.queryByText(/^Quality:/)).toBeNull();
});
