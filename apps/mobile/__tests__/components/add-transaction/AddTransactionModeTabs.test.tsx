import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { AddTransactionModeTabs } from "@/components/add-transaction/AddTransactionModeTabs";
import { arabicFontFamily, fontFamily } from "@/constants/typography";

let mockIsRTL = false;

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => {
    const { arabicFontFamily, fontFamily } =
      jest.requireActual<typeof import("@/constants/typography")>(
        "@/constants/typography"
      );
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

    const manual = screen.getByRole("tab", { name: "Manual" });
    const voice = screen.getByRole("tab", { name: "Voice" });

    expect(manual).toHaveProp("accessibilityState", {
      selected: true,
      disabled: false,
    });
    expect(voice).toHaveProp("accessibilityState", {
      selected: false,
      disabled: false,
    });
    fireEvent.press(manual);
    expect(onModeChange).not.toHaveBeenCalled();
    fireEvent.press(voice);
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("voice");
  });

  it("renders the selected tab as an underline, not as the old filled pill", () => {
    renderTabs("voice");
    const selected = screen.getByRole("tab", { name: "Voice" });
    const selectedStyle = String(selected.props.className ?? "") +
      JSON.stringify(selected.props.style ?? {});
    const tablistStyle = String(selected.parent?.props.className ?? "");

    expect(selectedStyle).toMatch(/border-b-2|borderBottomWidth[^0-9]*2/);
    expect(selectedStyle).not.toContain("rounded-xl");
    expect(tablistStyle).not.toContain("rounded-2xl");
    expect(selected).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
  });

  it("keeps both tabs disabled while the Voice flow or consent start is locked", () => {
    const onModeChange = jest.fn();
    renderTabs("voice", true, onModeChange);

    for (const label of ["Manual", "Voice"]) {
      const tab = screen.getByRole("tab", { name: label });
      expect(tab).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ disabled: true })
      );
      fireEvent.press(tab);
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
      const tab = screen.getByRole("tab", { name: voiceLabel });
      const tablist = tab.parent;
      const outerFrame = tablist?.parent;

      expect(String(tablist?.props.className ?? "")).toContain(
        "max-w-[560px]"
      );
      expect(String(tablist?.props.className ?? "")).toContain("self-center");
      expect(String(outerFrame?.props.className ?? "")).toContain("px-4");
      expect(String(outerFrame?.props.className ?? "")).toContain("w-full");
    }
  );

  it("reverses visual/accessible order for Arabic while preserving selection", () => {
    mockIsRTL = true;
    renderTabs("voice");
    expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel))
      .toEqual(["صوتي", "يدوي"]);
    expect(screen.getByRole("tab", { name: "صوتي" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
  });
});
