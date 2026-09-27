import React from "react";
import { Text, I18nManager, Platform } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { LocaleProvider, useLocale } from "@/context/LocaleContext";

jest.mock("@/i18n", (): object => ({
  __esModule: true,
  default: { language: "ar", on: jest.fn(), off: jest.fn() },
}));
function Consumer(): React.JSX.Element {
  const locale = useLocale();
  return <Text>{`${locale.language}:${locale.isRTL}`}</Text>;
}

it("sets web subtree direction and context from selected language despite native shim", (): void => {
  const platform = Object.getOwnPropertyDescriptor(Platform, "OS");
  const direction = Object.getOwnPropertyDescriptor(I18nManager, "isRTL");
  try {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: false,
    });
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByText("ar:true")).toBeOnTheScreen();
    expect(screen.getByTestId("web-locale-root")).toHaveProp("dir", "rtl");
  } finally {
    if (platform) Object.defineProperty(Platform, "OS", platform);
    if (direction) Object.defineProperty(I18nManager, "isRTL", direction);
  }
});
