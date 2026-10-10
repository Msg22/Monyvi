import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  getTestInstanceChildren,
  getTestInstanceParent,
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { AddTransactionModeTabs } from "@/components/add-transaction/AddTransactionModeTabs";
import { arabicFontFamily, fontFamily } from "@/constants/typography";

let mockIsRTL = false;

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => {
    const { arabicFontFamily, fontFamily } = jest.requireActual<
      typeof import("@/constants/typography")
    >("@/constants/typography");
    return {
      language: mockIsRTL ? "ar" : "en",
      isRTL: mockIsRTL,
      fontFamily: mockIsRTL ? arabicFontFamily : fontFamily,
    };
  },
}));

function renderTabs(
  mode: "manual" | "voice",
  disabled = false,
  onModeChange = jest.fn()
): void {
  render(
    <AddTransactionModeTabs
      mode={mode}
      disabled={disabled}
      onModeChange={onModeChange}
      manualLabel={mockIsRTL ? "يدوي" : "Manual"}
      voiceLabel={mockIsRTL ? "صوتي" : "Voice"}
    />
  );
}

describe("AddTransactionModeTabs approved underline contract", () => {
  beforeEach(() => {
    mockIsRTL = false;
    jest.clearAllMocks();
  });

  it("exposes two equally selectable labeled tabs and changes only to the other mode", () => {
    const onModeChange = jest.fn();
    renderTabs("manual", false, onModeChange);

    const manual: unknown = screen.getByRole("tab", { name: "Manual" });
    const voice: unknown = screen.getByRole("tab", { name: "Voice" });

    expect(getTestInstanceProps(manual).accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(getTestInstanceProps(voice).accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
    expect(onModeChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("tab", { name: "Voice" }));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("voice");
  });

  it("renders the selected tab as an underline, not as the old filled pill", () => {
    renderTabs("voice");
    const selected: unknown = screen.getByRole("tab", { name: "Voice" });
    const selectedProps = getTestInstanceProps(selected);
    const selectedClassName = selectedProps.className;
    const selectedStyle =
      (typeof selectedClassName === "string" ? selectedClassName : "") +
      JSON.stringify(selectedProps.style ?? {});
    const tablistClassName = getTestInstanceProps(
      getTestInstanceParent(selected)
    ).className;
    if (typeof tablistClassName !== "string") {
      throw new Error("Expected mode tablist to expose a string className");
    }

    expect(selectedStyle).toMatch(/border-b-2|borderBottomWidth[^0-9]*2/);
    expect(selectedStyle).not.toContain("rounded-xl");
    expect(tablistClassName).not.toContain("rounded-2xl");
    expect(getTestInstanceProps(selected).accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it("keeps both tabs disabled while the Voice flow or consent start is locked", () => {
    const onModeChange = jest.fn();
    renderTabs("voice", true, onModeChange);

    for (const label of ["Manual", "Voice"]) {
      const tab: unknown = screen.getByRole("tab", { name: label });
      expect(getTestInstanceProps(tab).accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(screen.getByRole("tab", { name: label }));
    }
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it.each([
    ["English", false, "Manual", "Voice", fontFamily.semiBold],
    ["Arabic", true, "يدوي", "صوتي", arabicFontFamily.semiBold],
  ] as const)(
    "uses the declared %s semibold font for both tab labels",
    (_locale, rtl, manual, voice, expectedFamily) => {
      mockIsRTL = rtl;
      renderTabs("manual");
      expect(screen.getByText(manual)).toHaveStyle({
        fontFamily: expectedFamily,
      });
      expect(screen.getByText(voice)).toHaveStyle({
        fontFamily: expectedFamily,
      });
    }
  );

  it.each([false, true])(
    "keeps 16dp outer gutters and centers the max-560dp tab row (RTL=%s)",
    (rtl) => {
      mockIsRTL = rtl;
      renderTabs("voice");
      const voiceLabel = rtl ? "صوتي" : "Voice";
      const tab: unknown = screen.getByRole("tab", { name: voiceLabel });
      const tablist: unknown = screen.getByTestId(
        "add-transaction-modes-tablist"
      );
      const outerFrame: unknown = screen.getByTestId(
        "add-transaction-modes-frame"
      );

      const tablistProps = getTestInstanceProps(tablist);
      const outerProps = getTestInstanceProps(outerFrame);
      expect(tablistProps.accessibilityRole).toBe("tablist");
      expect(getTestInstanceChildren(tablist).length).toBeGreaterThan(0);
      expect(getTestInstanceProps(tab).accessibilityLabel).toBe(voiceLabel);
      expect(tablistProps.className).toEqual(
        expect.stringContaining("max-w-[560px]")
      );
      expect(tablistProps.className).toEqual(
        expect.stringContaining("self-center")
      );
      expect(tablistProps.className).toEqual(expect.stringContaining("w-full"));
      expect(outerProps.className).toEqual(expect.stringContaining("px-4"));
      expect(outerProps.className).toEqual(expect.stringContaining("w-full"));
    }
  );

  it("reverses visual/accessible order for Arabic while preserving selection", () => {
    mockIsRTL = true;
    renderTabs("voice");
    expect(
      getTestInstances(screen.getAllByRole("tab")).map(
        (tab) => getTestInstanceProps(tab).accessibilityLabel
      )
    ).toEqual(["صوتي", "يدوي"]);
    expect(
      getTestInstanceProps(screen.getByRole("tab", { name: "صوتي" }))
        .accessibilityState
    ).toEqual(expect.objectContaining({ selected: true }));
  });
});
