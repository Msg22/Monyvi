import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import {
  VoiceTransactionEntry,
  type VoiceTransactionEntryState,
} from "@/components/add-transaction/VoiceTransactionEntry";
import { arabicFontFamily, fontFamily } from "@/constants/typography";

let mockLanguage: "en" | "ar" = "en";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => {
    const { arabicFontFamily, fontFamily } = jest.requireActual<
      typeof import("@/constants/typography")
    >("@/constants/typography");
    return {
      language: mockLanguage,
      isRTL: mockLanguage === "ar",
      fontFamily: mockLanguage === "ar" ? arabicFontFamily : fontFamily,
    };
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    top: 24,
    right: 0,
    bottom: 34,
    left: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (namespace: "common" | "transactions") => ({
    t: (
      key: string,
      values?: Readonly<Record<string, string | number>>
    ): string => {
      const dictionary = jest.requireActual<Record<string, string>>(
        "@/locales/" + mockLanguage + "/" + namespace + ".json"
      );
      const text = dictionary[key] ?? key;
      return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(values?.[name] ?? "{{" + name + "}}")
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID={"ionicon-" + name} />;
  },
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="voice-gradient">{children}</View>;
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="voice-loading-skeleton" />;
  },
}));

const callbacks = {
  onStart: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onSubmit: jest.fn(),
  onDiscard: jest.fn(),
  onTryAgain: jest.fn(),
  onUseManual: jest.fn(),
  onRefreshAvailability: jest.fn(),
  onOpenSettings: jest.fn(),
  onPermissionContinue: jest.fn(),
  onPermissionCancel: jest.fn(),
};

const baseProps: React.ComponentProps<typeof VoiceTransactionEntry> = {
  state: "idle",
  remaining: 3,
  dailyLimit: 5,
  durationMs: 0,
  errorMessage: null,
  ...callbacks,
};

function renderVoice(
  props: Partial<React.ComponentProps<typeof VoiceTransactionEntry>> = {}
): ReturnType<typeof render> {
  return render(<VoiceTransactionEntry {...baseProps} {...props} />);
}

describe("VoiceTransactionEntry approved state compositions", () => {
  beforeEach(() => {
    mockLanguage = "en";
    jest.clearAllMocks();
  });

  it.each([
    [
      "English",
      "en",
      fontFamily,
      "Limited free voice usage",
      "Tap and speak your transaction",
      "Try saying something like",
      "Speak naturally. We’ll extract the details for you.",
      "Daily voice limit reached",
      "Voice recording unavailable",
    ],
    [
      "Arabic",
      "ar",
      arabicFontFamily,
      "الاستخدام الصوتي المجاني محدود",
      "اضغط وتحدث لإضافة معاملة",
      "أمثلة على ما يمكنك قوله",
      "سنتعرف تلقائيًا على المبلغ والتاجر والتصنيف من ملاحظتك الصوتية.",
      "تم الوصول إلى الحد اليومي للاستخدام الصوتي",
      "إدخال صوتي غير متاح الآن",
    ],
  ] as const)(
    "applies registered %s font weights to Voice idle and daily headings",
    (
      _label,
      language,
      families,
      allowanceTitle,
      idleTitle,
      examplesHeading,
      description,
      dailyTitle,
      unavailableTitle
    ) => {
      mockLanguage = language;
      const view = renderVoice();

      for (const heading of [allowanceTitle, idleTitle, examplesHeading]) {
        expect(screen.getByText(heading)).toHaveStyle({
          fontFamily: families.bold,
        });
      }
      expect(screen.getByText(description)).toHaveStyle({
        fontFamily: families.regular,
      });

      view.rerender(
        <VoiceTransactionEntry
          {...baseProps}
          state="daily-limit"
          remaining={0}
          dailyLimit={5}
        />
      );
      for (const heading of [dailyTitle, unavailableTitle]) {
        expect(screen.getByText(heading)).toHaveStyle({
          fontFamily: families.bold,
        });
      }
    }
  );

  it("renders EN idle with unboxed mic and exactly the ordered pictured glyphs", () => {
    renderVoice();
    expect(screen.getByText("Limited free voice usage")).toBeOnTheScreen();
    expect(
      screen.getByText("Tap and speak your transaction")
    ).toBeOnTheScreen();
    expect(screen.getByText("Try saying something like")).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-mic-outline", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-bulb-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-restaurant-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-car-outline", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-cafe-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("ionicon-chatbubble-ellipses-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    for (const example of [
      "I paid 120 pounds at Talabat for food",
      "50 pounds for Uber today",
      "A coffee from Costa for 75 pounds",
    ]) {
      expect(screen.getByText(example)).toBeOnTheScreen();
    }
    fireEvent.press(
      screen.getByRole("button", { name: "Tap and speak your transaction" })
    );
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
  });

  it("uses props for a changing continuous EN allowance, rather than fixed five-use policy", () => {
    renderVoice({ remaining: 1, dailyLimit: 7 });
    expect(screen.getByText(/1 voice uses left today/)).toBeOnTheScreen();
    expect(screen.getByText("1 / 7")).toBeOnTheScreen();
    const progress: unknown = screen.getByTestId(
      "voice-allowance-progress-fill"
    );
    const width = JSON.stringify(getTestInstanceProps(progress).style);
    expect(width).toMatch(/14\.28/);
    expect(screen.getByText(/Resets tomorrow/)).toBeOnTheScreen();
    expect(screen.queryByText(/same time|24 hours/i)).toBeNull();
  });

  it("uses AR segmented allowance and quoted examples without English example icons", () => {
    mockLanguage = "ar";
    renderVoice({ remaining: 2, dailyLimit: 5 });
    expect(
      screen.getByText("الاستخدام الصوتي المجاني محدود")
    ).toBeOnTheScreen();
    expect(screen.getByText("اضغط وتحدث لإضافة معاملة")).toBeOnTheScreen();
    expect(screen.getByText("أمثلة على ما يمكنك قوله")).toBeOnTheScreen();
    expect(
      getTestInstances(screen.getAllByTestId("voice-allowance-segment"))
    ).toHaveLength(5);
    expect(
      screen.getByTestId("ionicon-bulb-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId("ionicon-restaurant-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("ionicon-car-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("ionicon-cafe-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("ionicon-chatbubble-ellipses-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    for (const text of [
      "دفعت ٥٠ جنيه في كافيه ستاربكس",
      "اشتريت بقالة من كارفور بـ ٣٢٠ جنيه",
      "أوبر ١٢٠ جنيه للمواصلات",
    ]) {
      expect(screen.getByText(new RegExp(text))).toBeOnTheScreen();
    }
  });

  it("renders English exhaustion as horizontal alert, disabled mic and two distinct actions", () => {
    renderVoice({ state: "daily-limit", remaining: 0, dailyLimit: 7 });
    expect(screen.getByText("Daily voice limit reached")).toBeOnTheScreen();
    expect(
      screen.getByText("You used all 7 voice uses today")
    ).toBeOnTheScreen();
    expect(screen.getByText("Voice recording unavailable")).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-ban-outline", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-mic", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      String(
        getTestInstanceProps(screen.getByTestId("voice-daily-alert")).className
      )
    ).toContain("flex-row");
    const retry: unknown = screen.getByRole("button", {
      name: "Try again tomorrow",
    });
    expect(getTestInstanceProps(retry).accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(screen.getByRole("button", { name: "Try again tomorrow" }));
    expect(callbacks.onTryAgain).not.toHaveBeenCalled();
    const useManual: unknown = screen.getByRole("button", {
      name: "Use manual entry",
    });
    expect(String(getTestInstanceProps(useManual).className)).not.toContain(
      "bg-nileGreen-500"
    );
    fireEvent.press(screen.getByRole("button", { name: "Use manual entry" }));
    expect(callbacks.onUseManual).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Try saying something like")).toBeNull();
    expect(
      screen.queryByTestId("ionicon-restaurant-outline", {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });

  it("renders distinct Arabic exhaustion with reset strip and a single Manual action", () => {
    mockLanguage = "ar";
    renderVoice({ state: "daily-limit", remaining: 0, dailyLimit: 5 });
    expect(
      screen.getByText("تم الوصول إلى الحد اليومي للاستخدام الصوتي")
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-ban-outline", { includeHiddenElements: true })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("ionicon-calendar-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      String(
        getTestInstanceProps(screen.getByTestId("voice-daily-alert")).className
      )
    ).toContain("items-center");
    expect(screen.getByText("إدخال صوتي غير متاح الآن")).toBeOnTheScreen();
    expect(
      screen.getByText(/سيكون الإدخال الصوتي متاحًا غدًا/)
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Try again tomorrow" })
    ).toBeNull();
    expect(
      getTestInstances(
        screen.getAllByRole("button", { name: "استخدم الإدخال اليدوي" })
      )
    ).toHaveLength(1);
    const useManual: unknown = screen.getByRole("button", {
      name: "استخدم الإدخال اليدوي",
    });
    expect(String(getTestInstanceProps(useManual).className)).toContain(
      "bg-nileGreen-500"
    );
    fireEvent.press(
      screen.getByRole("button", { name: "استخدم الإدخال اليدوي" })
    );
    expect(callbacks.onUseManual).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("أمثلة على ما يمكنك قوله")).toBeNull();
  });

  it("renders loading skeletons without claiming zero or a guessed allowance", () => {
    renderVoice({ state: "loading", remaining: null, dailyLimit: null });
    expect(
      getTestInstances(screen.getAllByTestId("voice-loading-skeleton")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("0 / 5")).toBeNull();
    expect(screen.queryByText("Daily voice limit reached")).toBeNull();
    expect(screen.queryByText("Limited free voice usage")).toBeNull();
  });

  it("renders a short unavailable heading and existing failure body, not exhausted state", () => {
    renderVoice({ state: "unavailable", remaining: null, dailyLimit: null });
    expect(screen.getByText("Voice unavailable")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "We couldn't check your voice uses. Try again, or add your transaction manually."
      )
    ).toBeOnTheScreen();
    expect(screen.queryByText("Daily voice limit reached")).toBeNull();
    expect(screen.queryByText("Limited free voice usage")).toBeNull();
    expect(screen.queryByText("Try saying something like")).toBeNull();
    expect(
      screen.getByTestId("ionicon-cloud-offline-outline", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    fireEvent.press(screen.getByRole("button", { name: "Use Manual" }));
    expect(callbacks.onRefreshAvailability).toHaveBeenCalledTimes(1);
    expect(callbacks.onUseManual).toHaveBeenCalledTimes(1);
  });

  it("keeps burst/replay/error recovery distinct from exhausted daily quota", () => {
    for (const state of ["burst-limit", "replay", "error"] as const) {
      const view = renderVoice({
        state,
        remaining: null,
        dailyLimit: null,
        errorMessage: state === "error" ? "Recording failed" : null,
      });
      expect(
        screen.getByRole("button", { name: "Try again" })
      ).toBeOnTheScreen();
      expect(
        screen.getByRole("button", { name: "Use Manual" })
      ).toBeOnTheScreen();
      expect(screen.queryByText("Daily voice limit reached")).toBeNull();
      view.unmount();
    }
  });

  it.each([
    ["recording", "Stop", "Pause", "Discard", "voice-action-pause"],
    ["paused", "Resume", "Stop", "Discard", "voice-action-resume"],
  ] as const)(
    "retains %s recorder actions and dispatches each to its own callback",
    (state, first, second, third, distinctAction) => {
      renderVoice({
        state: state as VoiceTransactionEntryState,
        durationMs: 61_000,
      });
      expect(screen.getByText("01:01")).toBeOnTheScreen();
      for (const action of [first, second, third]) {
        expect(
          getTestInstances(screen.getAllByRole("button", { name: action }))
            .length
        ).toBeGreaterThan(0);
      }

      fireEvent.press(screen.getByTestId("voice-action-stop"));
      fireEvent.press(screen.getByTestId(distinctAction));
      fireEvent.press(screen.getByTestId("voice-action-discard"));

      expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
      expect(callbacks.onDiscard).toHaveBeenCalledTimes(1);
      if (state === "recording") {
        expect(callbacks.onPause).toHaveBeenCalledTimes(1);
        expect(callbacks.onResume).not.toHaveBeenCalled();
      } else {
        expect(callbacks.onResume).toHaveBeenCalledTimes(1);
        expect(callbacks.onPause).not.toHaveBeenCalled();
      }
    }
  );

  it("does not expose a second native permission prompt inside the passive Voice surface", () => {
    renderVoice({
      state: "permission-explanation",
      remaining: null,
      dailyLimit: null,
    });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
