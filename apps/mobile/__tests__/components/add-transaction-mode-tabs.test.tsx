import React from "react";
import { I18nManager } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AddTransactionModeTabs } from "@/components/add-transaction/AddTransactionModeTabs";

describe("AddTransactionModeTabs native RTL direction", () => {
  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it.each([false, true])(
    "lets native layout mirror the normal row when RTL=%s",
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
      const tabListClassNames = screen
        .UNSAFE_getAllByProps({ accessibilityRole: "tablist" })
        .flatMap((node: unknown): string[] => {
          if (typeof node !== "object" || node === null || !("props" in node)) {
            throw new Error(
              "Tab list query must return a component with props"
            );
          }
          const props: unknown = node.props;
          if (
            typeof props !== "object" ||
            props === null ||
            !("className" in props)
          ) {
            return [];
          }
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
      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toHaveProp("accessibilityLabel", "Manual");
      expect(tabs[1]).toHaveProp("accessibilityLabel", "Voice");
      expect(tabs[1]).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: true })
      );
      fireEvent.press(tabs[0]);
      expect(onModeChange).toHaveBeenCalledWith("manual");
    }
  );
});
