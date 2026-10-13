import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next, { type i18n } from "i18next";
import React from "react";
import { Pressable, Text, TextInput } from "react-native";
import { I18nextProvider, initReactI18next } from "react-i18next";

import { TextField } from "@/components/ui/TextField";
import { getTestInstanceProps } from "../../test-utils/test-instance-props";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

async function createTestI18n(lng: "en" | "ar" = "en"): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng,
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

  it("renders red asterisk and the localized required accessible name", async () => {
    const instance = await createTestI18n();

    render(
      <I18nextProvider i18n={instance}>
        <TextField label="Full Name" required value="" />
      </I18nextProvider>
    );

    expect(screen.getByText("Full Name *")).toBeOnTheScreen();
    const requiredInput: unknown = screen.getByLabelText(
      "Full Name, " + enCommon.required_field
    );
    expect(requiredInput).toHaveProp(
      "accessibilityLabel",
      "Full Name, " + enCommon.required_field
    );
    expect(requiredInput).not.toHaveProp(
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
describe("T007 TextField required names and feedback", () => {
  it.each([
    ["en", "Initial balance", "Required field", ", "],
    ["ar", "الرصيد", "حقل مطلوب", "، "],
  ] as const)(
    "announces requiredness exactly once in %s",
    async (locale, label, requiredText, separator) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            testID="localized-required-text"
            label={label}
            required
            value=""
          />
        </I18nextProvider>
      );

      const expectedName = label + separator + requiredText;
      const input: unknown = screen.getByTestId("localized-required-text");
      expect(input).toHaveProp("accessibilityLabel", expectedName);
      expect(
        (getTestInstanceProps(input).accessibilityLabel as string).split(
          requiredText
        )
      ).toHaveLength(2);
      expect(input).not.toHaveProp("accessibilityHint", requiredText);
      expect(screen.getByText(label + " *")).toBeOnTheScreen();
    }
  );

  it.each([
    ["en", "Amount", "Custom amount, Required field"],
    ["ar", "الرصيد", "رصيد الحساب، حقل مطلوب"],
  ] as const)(
    "keeps a prequalified explicit accessible-name override once in %s",
    async (locale, label, override) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            label={label}
            accessibilityLabel={override}
            testID="override-required-text"
            required
          />
        </I18nextProvider>
      );

      const input: unknown = screen.getByTestId("override-required-text");
      expect(input).toHaveProp("accessibilityLabel", override);
      expect(screen.getByText(label + " *")).toBeOnTheScreen();
    }
  );

  it.each([
    ["en", "Amount", "Custom amount", "Custom amount, Required field"],
    ["ar", "الرصيد", "رصيد الحساب", "رصيد الحساب، حقل مطلوب"],
  ] as const)(
    "adds requiredness to an unqualified override in %s",
    async (locale, label, override, expectedName) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            label={label}
            accessibilityLabel={override}
            required
            testID="override-unqualified"
          />
        </I18nextProvider>
      );

      expect(screen.getByTestId("override-unqualified")).toHaveProp(
        "accessibilityLabel",
        expectedName
      );
    }
  );

  it("keeps optional and disabled non-required inputs unmarked", () => {
    render(
      <>
        <TextField label="Notes" testID="optional-notes" value="" />
        <TextField
          label="Disabled note"
          testID="disabled-note"
          editable={false}
          value="Stored"
        />
      </>
    );

    expect(screen.getByTestId("optional-notes")).toHaveProp(
      "accessibilityLabel",
      "Notes"
    );
    expect(screen.getByTestId("disabled-note")).toHaveProp(
      "accessibilityLabel",
      "Disabled note"
    );
    expect(screen.getByTestId("disabled-note")).toHaveProp("editable", false);
    expect(screen.queryByText("Notes *")).toBeNull();
    expect(screen.queryByText("Disabled note *")).toBeNull();
  });

  it("retains a caller's actionable correction hint without duplicating the required default", async () => {
    const instance = await createTestI18n();
    render(
      <I18nextProvider i18n={instance}>
        <TextField
          label="Amount"
          testID="required-with-hint"
          required
          accessibilityHint="Enter a value using a dot for decimals"
        />
      </I18nextProvider>
    );

    const input: unknown = screen.getByTestId("required-with-hint");
    expect(input).toHaveProp("accessibilityLabel", "Amount, Required field");
    expect(input).toHaveProp(
      "accessibilityHint",
      "Enter a value using a dot for decimals"
    );
  });

  it("prioritizes a focused error over warning and helper without losing correction hint", () => {
    render(
      <TextField
        label="Amount"
        testID="invalid-text-field"
        value="abc12345"
        required
        error="Enter a valid amount"
        warning="Advisory only"
        helperText="Supplementary helper"
        accessibilityHint="Remove letters before saving"
      />
    );

    const input: unknown = screen.getByTestId("invalid-text-field");
    fireEvent(input, "focus", {});
    expect(input).toHaveDisplayValue("abc12345");
    expect(input).toHaveProp("aria-invalid", true);
    expect(input).toHaveProp(
      "accessibilityHint",
      "Remove letters before saving"
    );
    expect(
      screen.getByRole("alert", { name: "Enter a valid amount" })
    ).toBeOnTheScreen();
    expect(screen.queryByText("Advisory only")).toBeNull();
    expect(screen.queryByText("Supplementary helper")).toBeNull();
  });

  it("renders advisory warning before helper without making the input invalid", () => {
    const { rerender } = render(
      <TextField
        label="Amount"
        testID="advisory-text"
        warning="Review this value"
        helperText="A useful tip"
      />
    );

    expect(screen.getByText("Review this value")).toBeOnTheScreen();
    expect(screen.queryByText("A useful tip")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("advisory-text")).toHaveProp(
      "aria-invalid",
      false
    );

    rerender(
      <TextField
        label="Amount"
        testID="advisory-text"
        helperText="A useful tip"
      />
    );
    expect(screen.getByText("A useful tip")).toBeOnTheScreen();
    expect(screen.queryByText("Review this value")).toBeNull();
  });

  it("does not add a focus ring or hide an existing error after focus and blur", () => {
    const { rerender } = render(
      <TextField
        label="Amount"
        testID="error-focus"
        error="Incorrect amount"
        value="bad"
      />
    );
    const input: unknown = screen.getByTestId("error-focus");
    const initialClass = getTestInstanceProps(input).className as string;

    fireEvent(input, "focus", {});
    expect(
      getTestInstanceProps(screen.getByTestId("error-focus")).className
    ).toBe(initialClass);
    expect(screen.getByText("Incorrect amount")).toBeOnTheScreen();

    rerender(
      <TextField
        label="Amount"
        testID="error-focus"
        error="Incorrect amount"
        value="bad"
      />
    );
    fireEvent(screen.getByTestId("error-focus"), "blur", {});
    expect(screen.getByText("Incorrect amount")).toBeOnTheScreen();
  });
});
describe("T007 Q2/Q5 required qualifier boundaries and feedback fallback", () => {
  it.each([
    [
      "en",
      "Amount",
      "Required field help",
      "Required field help, Required field",
    ],
    ["en", "Amount", "UnRequired field", "UnRequired field, Required field"],
    [
      "ar",
      "الرصيد",
      "معلومات حقل مطلوب إضافية",
      "معلومات حقل مطلوب إضافية، حقل مطلوب",
    ],
  ] as const)(
    "does not mistake a partial/ordinary required phrase for a complete qualifier in %s",
    async (locale, label, override, expectedName) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            label={label}
            required
            accessibilityLabel={override}
            testID="partial-required-phrase"
          />
        </I18nextProvider>
      );

      expect(screen.getByTestId("partial-required-phrase")).toHaveProp(
        "accessibilityLabel",
        expectedName
      );
    }
  );

  it.each([
    ["en", "Amount", "  Custom amount, Required field  "],
    ["ar", "الرصيد", "  رصيد الحساب، حقل مطلوب  "],
  ] as const)(
    "preserves complete prequalified %s override including punctuation and whitespace",
    async (locale, label, override) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            label={label}
            required
            accessibilityLabel={override}
            testID="padded-required-phrase"
          />
        </I18nextProvider>
      );

      expect(screen.getByTestId("padded-required-phrase")).toHaveProp(
        "accessibilityLabel",
        override
      );
    }
  );

  it.each([
    ["en", "Notes", "Required field help"],
    ["ar", "ملاحظات", "معلومات حقل مطلوب إضافية"],
  ] as const)(
    "preserves an optional %s override verbatim without requiredness",
    async (locale, label, override) => {
      const instance = await createTestI18n(locale);
      render(
        <I18nextProvider i18n={instance}>
          <TextField
            label={label}
            accessibilityLabel={override}
            testID="optional-override"
          />
        </I18nextProvider>
      );

      expect(screen.getByTestId("optional-override")).toHaveProp(
        "accessibilityLabel",
        override
      );
      expect(screen.queryByText(label + " *")).toBeNull();
    }
  );

  it("falls through empty error/warning and uses approved advisory gold without marking invalid", () => {
    const { rerender } = render(
      <TextField
        label="Amount"
        testID="feedback-fallback"
        value="12"
        error=""
        warning="Review this value"
        helperText="Input guidance"
      />
    );

    expect(screen.getByText("Review this value")).toHaveProp(
      "className",
      expect.stringContaining("text-gold-600")
    );
    expect(screen.queryByText("Input guidance")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("feedback-fallback")).toHaveProp(
      "aria-invalid",
      false
    );

    rerender(
      <TextField
        label="Amount"
        testID="feedback-fallback"
        value="12"
        error=""
        warning=""
        helperText="Input guidance"
      />
    );
    expect(screen.getByText("Input guidance")).toBeOnTheScreen();
    expect(screen.queryByText("Review this value")).toBeNull();

    rerender(
      <TextField
        label="Amount"
        testID="feedback-fallback"
        value="12"
        error="Enter a valid amount"
        warning=""
        helperText="Input guidance"
        accessibilityHint="Remove invalid characters"
      />
    );
    fireEvent(screen.getByTestId("feedback-fallback"), "focus", {});
    expect(
      screen.getByRole("alert", { name: "Enter a valid amount" })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("feedback-fallback")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getByTestId("feedback-fallback")).toHaveProp(
      "accessibilityHint",
      "Remove invalid characters"
    );
    expect(screen.queryByText("Input guidance")).toBeNull();
  });
});
