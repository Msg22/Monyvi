import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next, { type i18n } from "i18next";
import React from "react";
import { Pressable, Text, TextInput } from "react-native";
import { I18nextProvider, initReactI18next } from "react-i18next";

import { TextField } from "@/components/ui/TextField";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

async function createTestI18n(): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    ns: ["common"],
    defaultNS: "common",
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

describe("TextField", () => {
  it("reserves measured currency width for enlarged outlined inputs", () => {
    render(
      <TextField
        variant="outlined"
        testID="amount"
        label="Amount"
        value="47800"
        leadingAdornment={<Text>EGP</Text>}
      />
    );
    fireEvent(screen.getByTestId("amount-leading-adornment"), "layout", {
      nativeEvent: { layout: { width: 80, height: 44, x: 0, y: 0 } },
    });
    expect(screen.getByLabelText("Amount")).toHaveStyle({ paddingStart: 88 });
  });
  it("keeps fast typed text visible while a focused parent render is stale", () => {
    const onChangeText = jest.fn();
    const { rerender } = render(
      <TextField
        label="Amount"
        value=""
        onChangeText={onChangeText}
        keyboardType="numeric"
      />
    );
    fireEvent(screen.getByLabelText("Amount"), "focus", {});
    fireEvent.changeText(screen.getByLabelText("Amount"), "2");
    fireEvent.changeText(screen.getByLabelText("Amount"), "22");
    rerender(
      <TextField
        label="Amount"
        value="2"
        onChangeText={onChangeText}
        keyboardType="numeric"
      />
    );

    expect(screen.getByLabelText("Amount")).toHaveDisplayValue("22");
    expect(onChangeText).toHaveBeenCalledWith("2");
    expect(onChangeText).toHaveBeenCalledWith("22");
  });

  it("syncs external value changes while not focused", () => {
    const { rerender } = render(<TextField label="Amount" value="10" />);

    rerender(<TextField label="Amount" value="25" />);

    expect(screen.getByLabelText("Amount")).toHaveDisplayValue("25");
  });

  it("aligns adornments and reserves the approved input space", () => {
    render(
      <TextField
        testID="password-field"
        label="Password"
        leadingAdornment={<Text>lock</Text>}
        trailingAdornment={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show password"
          >
            <Text>eye</Text>
          </Pressable>
        }
      />
    );

    expect(screen.getByText("lock")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Password")).toHaveStyle({
      paddingStart: 43,
      paddingEnd: 48,
    });
    expect(screen.getByTestId("password-field-leading-adornment")).toHaveStyle({
      position: "absolute",
      top: 0,
      bottom: 0,
      start: 0,
      width: 47,
      alignItems: "center",
      justifyContent: "center",
    });
    expect(screen.getByTestId("password-field-trailing-adornment")).toHaveStyle(
      {
        position: "absolute",
        top: 0,
        bottom: 0,
        end: 0,
        width: 50,
        alignItems: "center",
        justifyContent: "center",
      }
    );
  });

  it("associates inline errors with the input and announces them", () => {
    render(
      <TextField label="Email" error="Enter a valid email." value="invalid" />
    );

    expect(
      screen.getByRole("alert", { name: "Enter a valid email." })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveProp("aria-invalid", true);
  });

  it("accepts localized font styles for labels and errors", () => {
    render(
      <TextField
        label="Email"
        error="Invalid email"
        labelStyle={{ fontFamily: "NotoSansArabic_600SemiBold" }}
        errorStyle={{ fontFamily: "NotoSansArabic_400Regular" }}
      />
    );

    expect(screen.getByText("Email")).toHaveStyle({
      fontFamily: "NotoSansArabic_600SemiBold",
    });
    expect(screen.getByRole("alert")).toHaveStyle({
      fontFamily: "NotoSansArabic_400Regular",
    });
  });

  it("renders red asterisk and the localized accessibilityHint when required is true", async () => {
    const instance = await createTestI18n();

    render(
      <I18nextProvider i18n={instance}>
        <TextField label="Full Name" required value="" />
      </I18nextProvider>
    );

    expect(screen.getByText("Full Name *")).toBeOnTheScreen();
    expect(screen.getByLabelText("Full Name")).toHaveProp(
      "accessibilityHint",
      enCommon.required_field
    );
  });
  it("forwards no-soft-keyboard, focus lifecycle, and the native input ref", () => {
    const inputRef = React.createRef<TextInput>();
    const onFocus = jest.fn();
    const onBlur = jest.fn();

    render(
      <TextField
        testID="focus-field"
        label="Amount"
        value="120"
        inputRef={inputRef}
        showSoftInputOnFocus={false}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );

    const input: unknown = screen.getByTestId("focus-field");
    expect(input).toHaveProp("showSoftInputOnFocus", false);
    expect(inputRef.current).not.toBeNull();

    fireEvent(input, "focus", {});
    expect(onFocus).toHaveBeenCalledTimes(1);

    fireEvent(input, "blur", {});
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
