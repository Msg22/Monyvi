import { fireEvent, render, screen } from "@testing-library/react-native";
import { getSelectableEgyptianInstitutions } from "@monyvi/logic";

import {
  InstitutionPicker,
  getInstitutionPickerLogoTestId,
} from "../../../components/add-account/InstitutionPicker";
import { palette } from "../../../constants/colors";

interface InstitutionLabelFixture {
  readonly shortName: string;
  readonly fullName: string;
  readonly nameAr?: string;
}

const translations: Record<string, string> = {
  institution_bank_dropdown_accessibility: "Choose bank",
  institution_bank_dropdown_close: "Close bank list",
  institution_bank_dropdown_placeholder: "Choose a bank",
  institution_wallet_dropdown_accessibility: "Choose wallet",
  institution_wallet_dropdown_close: "Close wallet list",
  institution_wallet_dropdown_placeholder: "Choose a wallet",
  institution_search_placeholder: "Search",
  institution_other: "Other",
  institution_bank_label: "Bank",
  institution_wallet_label: "Wallet",
};

let mockCurrentLanguage = "en";
let mockBottomInset = 0;
let mockIsDark = false;

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly language: string };
  } => ({
    t: (key: string): string => translations[key] ?? key,
    i18n: { language: mockCurrentLanguage },
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaInsetsContext:
    jest.requireActual<typeof import("react")>("react").createContext({
      top: 0,
      right: 0,
      get bottom(): number {
        return mockBottomInset;
      },
      left: 0,
    }),
  useSafeAreaInsets: (): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } => ({
    top: 0,
    right: 0,
    bottom: mockBottomInset,
    left: 0,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({
    isDark: mockIsDark,
  }),
}));

function normalizeInstitutionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRedundantInstitutionFullName(
  shortName: string,
  fullName: string
): boolean {
  const normalizedShortName = normalizeInstitutionName(shortName);
  const normalizedFullName = normalizeInstitutionName(fullName);

  if (!normalizedShortName || !normalizedFullName) {
    return false;
  }

  if (normalizedShortName === normalizedFullName) {
    return true;
  }

  if (!normalizedFullName.startsWith(`${normalizedShortName} `)) {
    return false;
  }

  const genericWords = new Set(["bank", "egypt", "misr", "plc"]);
  const remainingWords = normalizedFullName
    .slice(normalizedShortName.length)
    .trim()
    .split(" ")
    .filter(Boolean);

  return (
    remainingWords.length > 0 &&
    remainingWords.every((word) => genericWords.has(word))
  );
}

function getExpectedInstitutionLabel(
  institution: InstitutionLabelFixture
): string {
  if (
    isRedundantInstitutionFullName(institution.shortName, institution.fullName)
  ) {
    return institution.shortName;
  }

  return `${institution.shortName} (${institution.fullName})`;
}

describe("InstitutionPicker", () => {
  beforeEach(() => {
    mockCurrentLanguage = "en";
    mockBottomInset = 0;
    mockIsDark = false;
  });

  it("shows only selectable banks with short-name-first labels", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    expect(screen.getByText("Bank")).toBeTruthy();
    expect(
      screen.getByText("ADCB (Abu Dhabi Commercial Bank Egypt)")
    ).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "CIB");
    expect(
      screen.getByText("CIB (Commercial International Bank)")
    ).toBeTruthy();
    expect(screen.getByTestId(getInstitutionPickerLogoTestId("bank", "cib")))
      .toBeTruthy();
    expect(screen.queryByText("Vodafone Cash")).toBeNull();
  });

  it("shows only selectable wallets and supports Other", () => {
    const onSelectOther = jest.fn();

    render(
      <InstitutionPicker
        type="wallet"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={onSelectOther}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose wallet"));

    expect(screen.getByText("Wallet")).toBeTruthy();
    expect(screen.getByText("Vodafone Cash")).toBeTruthy();
    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("wallet", "vodafone-cash")
      )
    ).toBeTruthy();
    expect(screen.getByText("e& money")).toBeTruthy();
    expect(
      screen.queryByText("CIB (Commercial International Bank)")
    ).toBeNull();

    fireEvent.press(screen.getByText("Other"));
    expect(onSelectOther).toHaveBeenCalledTimes(1);
  });

  it("does not clear manual provider data when the selected Other row is tapped again", () => {
    const onSelectOther = jest.fn();

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        isOtherSelected={true}
        onSelectInstitution={jest.fn()}
        onSelectOther={onSelectOther}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.press(screen.getAllByText("Other")[1]);

    expect(onSelectOther).not.toHaveBeenCalled();
  });

  it("filters providers by search text", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "standard");

    expect(screen.getByText("Standard Chartered")).toBeTruthy();
    expect(
      screen.queryByText("CIB (Commercial International Bank)")
    ).toBeNull();
  });

  it("omits redundant parenthesized names from provider labels", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "Al Baraka");

    expect(screen.getByText("Al Baraka")).toBeTruthy();
    expect(screen.queryByText("Al Baraka (Al Baraka Bank Egypt)")).toBeNull();
  });

  it("omits country or bank suffixes for acronym brand labels", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "QNB");

    expect(screen.getByText("QNB")).toBeTruthy();
    expect(screen.queryByText("QNB (QNB Egypt)")).toBeNull();
  });

  it("centers the picker title in the modal header", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    expect(screen.getByTestId("institution-picker-title")).toHaveProp(
      "className",
      expect.stringContaining("text-center")
    );
  });

  it("uses transparent fixed logo viewports inside the modal", () => {
    render(
      <InstitutionPicker
        type="wallet"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose wallet"));

    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("wallet", "vodafone-cash")
      )
    ).toHaveProp(
      "className",
      expect.stringContaining("h-12 w-16")
    );
    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("wallet", "vodafone-cash")
      )
    ).toHaveProp(
      "className",
      expect.stringContaining("bg-transparent")
    );
    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("wallet", "vodafone-cash")
      )
    ).toHaveProp(
      "className",
      expect.not.stringContaining("dark:bg-white")
    );
    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("wallet", "vodafone-cash")
      )
    ).toHaveProp(
      "className",
      expect.stringContaining("overflow-hidden")
    );
  });

  it("crops square logo canvases without changing the row viewport", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "NBK");

    expect(
      screen.getByTestId(getInstitutionPickerLogoTestId("bank", "nbk-egypt"))
    ).toHaveProp(
      "className",
      expect.stringContaining("h-12 w-16")
    );
    expect(
      screen.getByTestId(
        `${getInstitutionPickerLogoTestId("bank", "nbk-egypt")} image`
      )
    ).toHaveProp("resizeMode", "cover");
  });

  it("renders edge-sensitive bank logos inside the fixed row viewport", () => {
    const edgeSensitiveBanks = [
      {
        id: "suez-canal-bank",
        search: "SC Bank",
        label: "SC Bank (Suez Canal Bank)",
      },
      {
        id: "kfh-egypt",
        search: "KFH Egypt",
        label: "KFH Egypt",
      },
      {
        id: "fab-misr",
        search: "FAB Misr",
        label: "FAB Misr (First Abu Dhabi Bank Misr)",
      },
      {
        id: "credit-agricole-egypt",
        search: "Credit Agricole",
        label: "Credit Agricole",
      },
      {
        id: "bank-nxt",
        search: "Bank NXT",
        label: "Bank NXT",
      },
      {
        id: "abk-egypt",
        search: "ABK Egypt",
        label: "ABK Egypt (Al Ahli Bank of Kuwait - Egypt)",
      },
      {
        id: "agricultural-bank-of-egypt",
        search: "ABE",
        label: "ABE (Agricultural Bank of Egypt)",
      },
    ] as const;

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    for (const bank of edgeSensitiveBanks) {
      fireEvent.changeText(screen.getByPlaceholderText("Search"), bank.search);

      expect(screen.getByText(bank.label)).toBeTruthy();
      expect(
        screen.getByTestId(getInstitutionPickerLogoTestId("bank", bank.id))
      ).toHaveProp(
        "className",
        expect.stringContaining("h-12 w-16")
      );
    }
  });

  it("keeps light-mode dropdown logos transparent unless a row surface is required", () => {
    const surfaceFixtures = [
      {
        id: "adcb-egypt",
        search: "ADCB",
        label: "ADCB (Abu Dhabi Commercial Bank Egypt)",
      },
      {
        id: "arab-international-bank",
        search: "AIB",
        label: "AIB (Arab International Bank)",
      },
      {
        id: "bank-nxt",
        search: "Bank NXT",
        label: "Bank NXT",
      },
      {
        id: "hdb-egypt",
        search: "HDB",
        label: "HDB (Housing and Development Bank)",
      },
      {
        id: "qnb-egypt",
        search: "QNB",
        label: "QNB",
      },
    ] as const;

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    for (const fixture of surfaceFixtures) {
      fireEvent.changeText(
        screen.getByPlaceholderText("Search"),
        fixture.search
      );

      expect(screen.getByText(fixture.label)).toBeTruthy();
      expect(
        screen.getByTestId(getInstitutionPickerLogoTestId("bank", fixture.id))
      ).not.toHaveProp("style");
    }
  });

  it("keeps required contrast logo surfaces readable in dark mode", () => {
    mockIsDark = true;

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    const contrastFixtures = [
      {
        id: "qnb-egypt",
        search: "QNB",
        label: "QNB",
        expectsContrastSurface: true,
      },
      {
        id: "adcb-egypt",
        search: "ADCB",
        label: "ADCB (Abu Dhabi Commercial Bank Egypt)",
        expectsContrastSurface: true,
      },
      {
        id: "bank-nxt",
        search: "Bank NXT",
        label: "Bank NXT",
        expectsContrastSurface: false,
      },
      {
        id: "nasser-social-bank",
        search: "Nasser Social",
        label: "Nasser Social Bank",
        expectsContrastSurface: true,
      },
    ] as const;

    for (const fixture of contrastFixtures) {
      fireEvent.changeText(
        screen.getByPlaceholderText("Search"),
        fixture.search
      );

      expect(screen.getByText(fixture.label)).toBeTruthy();
      if (fixture.expectsContrastSurface) {
        expect(
          screen.getByTestId(
            getInstitutionPickerLogoTestId("bank", fixture.id)
          )
        ).toHaveProp(
          "style",
          expect.objectContaining({
            backgroundColor: palette.slate[25],
            borderColor: palette.slate[600],
          })
        );
      } else {
        expect(
          screen.getByTestId(
            getInstitutionPickerLogoTestId("bank", fixture.id)
          )
        ).not.toHaveProp("style");
      }
    }
  });

  it("keeps required wallet logo surfaces readable in dark mode", () => {
    mockIsDark = true;

    render(
      <InstitutionPicker
        type="wallet"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose wallet"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "WE");

    expect(screen.getByText("WE Pay")).toBeTruthy();
    expect(
      screen.getByTestId(getInstitutionPickerLogoTestId("wallet", "we-pay"))
    ).toHaveProp(
      "style",
      expect.objectContaining({
        backgroundColor: palette.slate[25],
        borderColor: palette.slate[600],
      })
    );
  });

  it("does not add contrast surfaces to curated logos in dark mode", () => {
    mockIsDark = true;

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "AIB");

    const label = "AIB (Arab International Bank)";

    expect(screen.getByText(label)).toBeTruthy();
    expect(
      screen.getByTestId(
        getInstitutionPickerLogoTestId("bank", "arab-international-bank")
      )
    ).not.toHaveProp("style");
  });

  it("renders NBE inside the fixed row viewport", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "NBE");

    const label = "NBE (National Bank of Egypt)";

    expect(screen.getByText(label)).toBeTruthy();
    expect(
      screen.getByTestId(getInstitutionPickerLogoTestId("bank", "nbe"))
    ).toHaveProp(
      "className",
      expect.stringContaining("h-12 w-16")
    );
    expect(
      screen.getByTestId(getInstitutionPickerLogoTestId("bank", "nbe"))
    ).not.toHaveProp("style");
  });

  it("adds bottom safe-area space so Other stays above Android navigation", () => {
    mockBottomInset = 34;

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    expect(screen.getByTestId("institution-picker-sheet")).toHaveStyle({
      paddingBottom: 58,
    });
  });

  it("renders a logo for every selectable bank in the dropdown", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));

    for (const bank of getSelectableEgyptianInstitutions("bank")) {
      fireEvent.changeText(
        screen.getByPlaceholderText("Search"),
        bank.shortName
      );
      const label = getExpectedInstitutionLabel(bank);

      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(getInstitutionPickerLogoTestId("bank", bank.id)))
        .toBeTruthy();
    }
  });

  it("renders a logo for every selectable wallet in the dropdown", () => {
    render(
      <InstitutionPicker
        type="wallet"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose wallet"));

    for (const wallet of getSelectableEgyptianInstitutions("wallet")) {
      fireEvent.changeText(
        screen.getByPlaceholderText("Search"),
        wallet.shortName
      );
      const label = getExpectedInstitutionLabel(wallet);

      expect(screen.getByText(label)).toBeTruthy();
      expect(
        screen.getByTestId(getInstitutionPickerLogoTestId("wallet", wallet.id))
      ).toBeTruthy();
    }
  });

  it("filters providers by Arabic metadata in English UI", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(
      screen.getByPlaceholderText("Search"),
      "التجاري الدولي"
    );

    expect(
      screen.getByText("CIB (Commercial International Bank)")
    ).toBeTruthy();
    expect(screen.queryByText("NBE (National Bank of Egypt)")).toBeNull();
  });

  it("renders Arabic provider names in Arabic UI", () => {
    mockCurrentLanguage = "ar";

    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "CIB");

    expect(screen.getByText("CIB (البنك التجاري الدولي)")).toBeTruthy();
  });

  it("clears search text when switching provider type", () => {
    const { rerender } = render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "CIB");

    expect(
      screen.getByText("CIB (Commercial International Bank)")
    ).toBeTruthy();
    expect(screen.queryByText("Vodafone Cash")).toBeNull();

    rerender(
      <InstitutionPicker
        type="wallet"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose wallet"));
    expect(screen.getByPlaceholderText("Search")).toHaveProp("value", "");
    expect(screen.getByText("Vodafone Cash")).toBeTruthy();
  });

  it("clears stale search text when reopening the dropdown", () => {
    render(
      <InstitutionPicker
        type="bank"
        selectedInstitutionId={null}
        onSelectInstitution={jest.fn()}
        onSelectOther={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "CIB");

    expect(
      screen.getByText("CIB (Commercial International Bank)")
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Close bank list"));
    fireEvent.press(screen.getByLabelText("Choose bank"));

    expect(screen.getByPlaceholderText("Search")).toHaveProp("value", "");
    expect(
      screen.getByText("ADCB (Abu Dhabi Commercial Bank Egypt)")
    ).toBeTruthy();
  });
});
