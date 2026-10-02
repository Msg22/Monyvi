import { act, fireEvent, render, screen } from "@testing-library/react-native";
import i18next, { type i18n } from "i18next";
import React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

import { Dropdown } from "@/components/ui/Dropdown";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const CURRENCY_ITEMS = [
  { value: "EGP", label: "EGP" },
  { value: "USD", label: "USD" },
];

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

interface StableWrapper {
  readonly className: string;
  readonly keepsFlattenOptOut: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

/**
 * Reads the Dropdown's outer wrapper view — the node that owns the
 * `collapsable={false}` flatten opt-out and the disabled dimming class — instead
 * of counting every `collapsable={false}` view in the tree, which would also
 * match the always-collapsed trigger.
 */
function readStableWrapper(tree: unknown): StableWrapper {
  if (!isRecord(tree)) throw new Error("dropdown_wrapper_missing");
  const props = tree["props"];
  if (!isRecord(props)) throw new Error("dropdown_wrapper_props_missing");
  const classNameValue = props["className"];
  return {
    className: typeof classNameValue === "string" ? classNameValue : "",
    keepsFlattenOptOut: props["collapsable"] === false,
  };
}

describe("Dropdown native hierarchy stability across submit state", () => {
  it("keeps the outer wrapper flatten opt-out across disabled false, true, false while preserving the dimmed and press flow", () => {
    const onToggle = jest.fn();
    const onChange = jest.fn();
    const sharedProps = {
      label: "Purchase currency",
      items: CURRENCY_ITEMS,
      value: "EGP",
      isOpen: false,
      onToggle,
      onChange,
      useModal: false as const,
      variant: "outlined" as const,
      testID: "purchase-currency",
    };

    const { rerender, toJSON } = render(
      <Dropdown {...sharedProps} disabled={false} />
    );

    const enabled = readStableWrapper(toJSON());
    expect(enabled.keepsFlattenOptOut).toBe(true);
    expect(enabled.className).not.toContain("opacity-50");
    fireEvent.press(screen.getByTestId("purchase-currency-trigger"));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Dropdown {...sharedProps} disabled={true} />);
    const whileDisabled = readStableWrapper(toJSON());
    expect(whileDisabled.keepsFlattenOptOut).toBe(true);
    expect(whileDisabled.className).toContain("opacity-50");
    fireEvent.press(screen.getByTestId("purchase-currency-trigger"));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Dropdown {...sharedProps} disabled={false} />);
    const restored = readStableWrapper(toJSON());
    expect(restored.keepsFlattenOptOut).toBe(true);
    expect(restored.className).not.toContain("opacity-50");
    fireEvent.press(screen.getByTestId("purchase-currency-trigger"));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("renders red asterisk and the localized required hint on the trigger when required is true", async () => {
    const instance = await createTestI18n();

    render(
      <I18nextProvider i18n={instance}>
        <Dropdown
          label="Currency"
          required
          items={CURRENCY_ITEMS}
          value="EGP"
          isOpen={false}
          onToggle={jest.fn()}
          onChange={jest.fn()}
          useModal={false}
          testID="currency"
        />
      </I18nextProvider>
    );

    expect(screen.getByText("Currency *")).toBeOnTheScreen();
    expect(screen.getByTestId("currency-trigger")).toHaveProp(
      "accessibilityHint",
      enCommon.required_field
    );

    await act(async (): Promise<void> => {
      await instance.changeLanguage("ar");
    });

    expect(screen.getByTestId("currency-trigger")).toHaveProp(
      "accessibilityHint",
      arCommon.required_field
    );
  });
});
