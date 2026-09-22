import { render, screen } from "@testing-library/react-native";
import React from "react";
import { LiveRates } from "@/components/dashboard/LiveRates";
import { completeFixtureA } from "../../fixtures/market-rate-snapshot";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";

jest.mock("@monyvi/db", (): unknown => ({ database: { get: jest.fn() } }));
jest.mock("@/context/ThemeContext", (): unknown => ({
  useTheme: (): unknown => ({ isDark: false }),
}));
jest.mock("expo-router", (): unknown => ({ router: { push: jest.fn() } }));
jest.mock("react-i18next", (): unknown => ({
  useTranslation: (): unknown => ({ t: (key: string): string => key }),
}));
jest.mock("@expo/vector-icons", (): unknown => ({
  FontAwesome5: (): null => null,
  Ionicons: (): null => null,
  MaterialIcons: (): null => null,
}));

const fixture = completeFixtureA();
const snapshot = selectMarketRateSnapshot(
  fixture.roots,
  fixture.observations,
  Date.parse("2026-09-09T11:00:00Z")
);

it.each(["EGP", "USD", "BTC"] as const)(
  "respects the fiat-only rate preview for preferred %s",
  (preferredCurrency): void => {
    expect(snapshot).not.toBeNull();
    render(
      <LiveRates
        selectedSnapshot={snapshot}
        previousDayRate={null}
        isLoading={false}
        lastUpdated={null}
        isStale={false}
        preferredCurrency={preferredCurrency}
      />
    );
    expect(screen.queryByText("USD/BTC:")).toBeNull();
    if (preferredCurrency === "BTC") {
      expect(screen.queryByText("gold_24k_pill:")).toBeNull();
      expect(screen.queryByText("silver_pill:")).toBeNull();
    } else {
      expect(
        screen.getByText(preferredCurrency === "USD" ? "USD/EUR:" : "USD/EGP:")
      ).toBeTruthy();
      expect(screen.getByText("gold_24k_pill:")).toBeTruthy();
      expect(screen.getByText("silver_pill:")).toBeTruthy();
    }
    expect(screen.getByText("view_all_rates")).toBeTruthy();
  }
);
