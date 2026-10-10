import React from "react";
import { I18nManager } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AddTransactionModeTabs } from "@/components/add-transaction/AddTransactionModeTabs";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../test-utils/test-instance-props";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => {
    const { I18nManager } =
      jest.requireActual<typeof import("react-native")>("react-native");
    const { fontFamily, arabicFontFamily } =
      jest.requireActual<typeof import("@/constants/typography")>(
        "@/constants/typography"
      );

    return {
      isRTL: I18nManager.isRTL,
      language: I18nManager.isRTL ? "ar" : "en",
      fontFamily: I18nManager.isRTL ? arabicFontFamily : fontFamily,
    };
  },
}));

describe("AddTransactionModeTabs native RTL direction", () => {
  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it.each([false, true])(
    "keeps the approved locale tab order on a native row when RTL=%s",
    (isRTL): void => {
      jest.replaceProperty(I18nManager, "isRTL", isRTL);
      const onModeChange = jest.fn();
      render(
        <AddTransactionModeTabs
          mode="voice"
          manualLabel="Manual"
          voiceLabel="Voice"
          onModeChange={onModeChange}
        />
      );
      const tabListClassNames = getTestInstances(
        screen.UNSAFE_getAllByProps({ accessibilityRole: "tablist" })
      ).flatMap((node: unknown): string[] => {
        const props = getTestInstanceProps(node);
        return typeof props.className === "string" ? [props.className] : [];
      });
      expect(
        tabListClassNames.some((className: string): boolean =>
          /\bflex-row\b/.test(className)
        )
      ).toBe(true);
      expect(
        tabListClassNames.some((className: string): boolean =>
          className.includes("flex-row-reverse")
        )
      ).toBe(false);
      const tabs: readonly unknown[] = getTestInstances(
        screen.getAllByRole("tab")
      );
      const expectedLabels = isRTL
        ? ["Voice", "Manual"]
        : ["Manual", "Voice"];
      expect(tabs).toHaveLength(2);
      expectedLabels.forEach((label, index) => {
        expect(getTestInstanceProps(tabs[index]).accessibilityLabel).toBe(label);
      });
      const selectedVoice: unknown = screen.getByRole("tab", { name: "Voice" });
      expect(getTestInstanceProps(selectedVoice).accessibilityState).toEqual(
        expect.objectContaining({ selected: true })
      );
      fireEvent.press(screen.getByRole("tab", { name: "Manual" }));
      expect(onModeChange).toHaveBeenCalledTimes(1);
      expect(onModeChange).toHaveBeenCalledWith("manual");
    }
  );
});
