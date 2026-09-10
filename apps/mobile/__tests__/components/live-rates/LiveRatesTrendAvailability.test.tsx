import { render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("@expo/vector-icons", () => ({
  FontAwesome5: (): null => null,
  MaterialIcons: (): null => null,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Readonly<Record<string, unknown>>): string =>
      options?.price === undefined ? key : String(options.price),
  }),
}));

import { CurrencyRow } from "@/components/live-rates/CurrencyRow";
import { GoldHeroCard } from "@/components/live-rates/GoldHeroCard";
import { MetalCard } from "@/components/live-rates/MetalCard";

describe("Live Rates historical trend availability", () => {
  it("hides Gold trend only when historical comparison is unavailable", () => {
    render(
      <GoldHeroCard
        price24k="3,100"
        price21k="2,712"
        price18k="2,325"
        trendPercent={null}
        currencySymbol="E£"
      />
    );

    expect(screen.queryByText("0.0%")).toBeNull();
  });

  it("renders a genuine flat Gold trend instead of treating it as unavailable", () => {
    render(
      <GoldHeroCard
        price24k="3,100"
        price21k="2,712"
        price18k="2,325"
        trendPercent={0}
        currencySymbol="E£"
      />
    );

    expect(screen.getByText("0.0%")).toBeTruthy();
  });

  it("hides Silver trend only when historical comparison is unavailable", () => {
    render(
      <MetalCard
        metalName="Silver"
        price="40"
        trendPercent={null}
        borderColor="#ffffff"
        currencySymbol="E£"
      />
    );

    expect(screen.queryByText("0.0%")).toBeNull();
  });

  it("renders a genuine flat Silver trend", () => {
    render(
      <MetalCard
        metalName="Silver"
        price="40"
        trendPercent={0}
        borderColor="#ffffff"
        currencySymbol="E£"
      />
    );

    expect(screen.getByText("0.0%")).toBeTruthy();
  });

  it("hides a currency trend only when historical comparison is unavailable", () => {
    render(
      <CurrencyRow
        flag="🇺🇸"
        code="USD"
        name="US Dollar"
        rate="50 E£"
        changePercent={null}
      />
    );

    expect(screen.queryByText("0.00%")).toBeNull();
  });

  it("renders a genuine flat currency trend", () => {
    render(
      <CurrencyRow
        flag="🇺🇸"
        code="USD"
        name="US Dollar"
        rate="50 E£"
        changePercent={0}
      />
    );

    expect(screen.getByText("0.00%")).toBeTruthy();
  });
});
