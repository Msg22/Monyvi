import { render, screen } from "@testing-library/react-native";
import { MetalSoldRateTrust } from "@/components/metals/MetalSoldRateTrust";

jest.mock("react-i18next", () => ({
  useTranslation: (): unknown => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string =>
      key === "portfolio.rates_updated"
        ? `Updated ${values?.date} ${values?.time}`
        : key,
  }),
}));

it("shows unknown age without inventing a provider timestamp", () => {
  render(
    <MetalSoldRateTrust
      rates={[{ currency: "EUR", state: "unknown", providerObservedAt: null }]}
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
          providerObservedAt: new Date(2026, 8, 1, 12),
        },
      ]}
    />
  );
  expect(screen.getByText("EGP · rate.short_fresh")).toBeTruthy();
  expect(screen.getByText(/Updated 01 Sept 2026 .*PM/)).toBeTruthy();
});

it("renders no trust block without consumed display rates", () => {
  render(<MetalSoldRateTrust rates={[]} />);
  expect(screen.queryByTestId("metal-sold-display-rate-trust")).toBeNull();
});
