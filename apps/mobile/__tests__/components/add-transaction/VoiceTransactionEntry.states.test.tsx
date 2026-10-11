import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  getTestInstanceParent,
  getTestInstanceProps,
  getTestInstanceChildren,
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
  Ionicons: ({
    name,
    accessible,
    accessibilityElementsHidden,
    importantForAccessibility,
  }: {
    readonly name: string;
    readonly accessible?: boolean;
    readonly accessibilityElementsHidden?: boolean;
    readonly importantForAccessibility?:
      | "auto"
      | "yes"
      | "no"
      | "no-hide-descendants";
  }): React.JSX.Element => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <Text
        testID={"ionicon-" + name}
        accessible={accessible}
        accessibilityElementsHidden={accessibilityElementsHidden}
        importantForAccessibility={importantForAccessibility}
      />
    );
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
  onDismissExamples: jest.fn(),
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

function findDecorativeAncestor(start: unknown): unknown {
  let current: unknown = start;
  while (current !== null && current !== undefined) {
    const props = getTestInstanceProps(current);
    if (props.importantForAccessibility === "no-hide-descendants") {
      return current;
    }
    current = getTestInstanceParent(current);
  }
  throw new Error("Expected a no-hide-descendants decorative ancestor");
}

function ancestry(value: unknown): readonly unknown[] {
  const chain: unknown[] = [];
  let current: unknown = value;
  while (current !== null && current !== undefined) {
    chain.push(current);
    current = getTestInstanceParent(current);
  }
  return chain;
}

function expectPhysicalRecorderOrder(
  submit: unknown,
  center: unknown,
  discard: unknown
): void {
  const branches = [submit, center, discard].map(ancestry);
  const common = branches[0].find(
    (candidate) =>
      branches[1].includes(candidate) && branches[2].includes(candidate)
  );
  if (common === undefined) {
    throw new Error("Expected the three recorder controls in a shared action row");
  }
  const children = getTestInstanceChildren(common);
  const indices = branches.map((chain) =>
    children.findIndex((child) => chain.includes(child))
  );
  expect(indices.every((index) => index >= 0)).toBe(true);
  expect(indices[0]).toBeLessThan(indices[1]);
  expect(indices[1]).toBeLessThan(indices[2]);
  expect(String(getTestInstanceProps(common).className)).not.toContain(
    "flex-row-reverse"
  );
}

jest.mock("@/services/reduced-motion-service", () => ({
  readReducedMotion: (): Promise<boolean> => Promise.resolve(false),
  subscribeReducedMotion: (): (() => void) => (): void => {},
}));

describe("VoiceTransactionEntry approved state compositions", () => {
  beforeEach(() => {
    mockLanguage = "en";
    jest.clearAllMocks();
  });

  it.each([
    ["en", "Starting…", "Getting ready to listen…", "Cancel"],
    ["ar", "نجهّز التسجيل…", "لحظة ونكون جاهزين لسماعك…", "إلغاء"],
  ] as const)(
    "renders approved %s Starting without a false timer",
    (language, title, body, cancel): void => {
      mockLanguage = language;
      render(
        <VoiceTransactionEntry
          {...baseProps}
          {...{ state: "starting" as const }}
        />
      );
      expect(screen.getByText(title)).toBeOnTheScreen();
      expect(screen.getByText(body)).toBeOnTheScreen();
      expect(screen.queryByText("00:00")).toBeNull();
      expect(screen.queryByText("Listening")).toBeNull();
      expect(screen.queryByText("Try saying something like")).toBeNull();
      fireEvent.press(screen.getByRole("button", { name: cancel }));
      expect(callbacks.onDiscard).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [
      "en",
      "Turning your words into a transaction",
      "Getting the details ready…",
    ],
    ["ar", "نحوّل كلامك إلى معاملة", "نجهّز التفاصيل…"],
  ] as const)(
    "renders %s parsing illustration without skeleton or fictitious results",
    (language, title, body): void => {
      mockLanguage = language;
      renderVoice({ state: "processing" });
      expect(screen.getByText(title)).toBeOnTheScreen();
      expect(screen.getByText(body)).toBeOnTheScreen();
      expect(screen.queryByTestId("voice-loading-skeleton")).toBeNull();
      expect(
        screen.getByTestId("voice-parsing-illustration", {
          includeHiddenElements: true,
        })
      ).toBeTruthy();
      expect(screen.queryByText(/\d+%/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    }
  );

  it("hides the starting mic decoration from both platform a11y trees while title and Cancel stay accessible", (): void => {
    renderVoice({ state: "starting" });
    const mic: unknown = screen.getByTestId("ionicon-mic", {
      includeHiddenElements: true,
    });
    const wrapper = findDecorativeAncestor(mic);
    const wrapperProps = getTestInstanceProps(wrapper);
    expect(wrapperProps.accessible).toBe(false);
    expect(wrapperProps.accessibilityElementsHidden).toBe(true);
    expect(wrapperProps.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.getByText("Starting…")).toBeOnTheScreen();
    expect(screen.getByText("Getting ready to listen…")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
  });

  it("hides the parsing illustration and receipt glyph from both platform a11y trees while the title stays accessible", (): void => {
    renderVoice({ state: "processing" });
    const illustration: unknown = screen.getByTestId(
      "voice-parsing-illustration",
      { includeHiddenElements: true }
    );
    const wrapperProps = getTestInstanceProps(illustration);
    expect(wrapperProps.accessible).toBe(false);
    expect(wrapperProps.accessibilityElementsHidden).toBe(true);
    expect(wrapperProps.importantForAccessibility).toBe("no-hide-descendants");
    const receipt: unknown = screen.getByTestId("ionicon-receipt-outline", {
      includeHiddenElements: true,
    });
    expect(getTestInstanceProps(receipt).accessible).toBe(false);
    expect(
      screen.getByText("Turning your words into a transaction")
    ).toBeOnTheScreen();
    expect(screen.getByText("Getting the details ready…")).toBeOnTheScreen();
  });

  it.each([
    ["en", "Your limits reset tomorrow."],
    ["ar", "يتجدد حد استخدامك غدًا."],
  ] as const)(
    "uses approved %s reset copy only in daily context",
    (language, text): void => {
      mockLanguage = language;
      renderVoice();
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  );

  it.each([
    ["en", "Dismiss examples"],
    ["ar", "إخفاء الأمثلة"],
  ] as const)(
    "provides localized %s dismissal and hides the entire examples surface",
    (language, label): void => {
      mockLanguage = language;
      const view = render(
        <VoiceTransactionEntry
          {...baseProps}
          {...{
            onDismissExamples: callbacks.onDismissExamples,
            showExamples: true,
          }}
        />
      );
      fireEvent.press(screen.getByRole("button", { name: label }));
      expect(callbacks.onDismissExamples).toHaveBeenCalledTimes(1);
      view.rerender(
        <VoiceTransactionEntry
          {...baseProps}
          {...{
            onDismissExamples: callbacks.onDismissExamples,
            showExamples: false,
          }}
        />
      );
      expect(screen.queryByTestId("voice-examples-card")).toBeNull();
      expect(
        screen.queryByTestId("ionicon-restaurant-outline", {
          includeHiddenElements: true,
        })
      ).toBeNull();
      expect(screen.getByTestId("voice-allowance-card")).toBeOnTheScreen();
    }
  );

  it.each([
    [
      "en",
      "Allow your microphone",
      "Monyvi needs access to your microphone to record your transaction.",
      "Allow microphone",
    ],
    [
      "ar",
      "اسمح باستخدام الميكروفون",
      "يحتاج Monyvi إلى الميكروفون لتسجيل معاملتك.",
      "السماح بالميكروفون",
    ],
  ] as const)(
    "renders approved inline %s permission explanation before native request",
    (language, title, body, action): void => {
      mockLanguage = language;
      renderVoice({ state: "permission-explanation" });
      expect(screen.getByText(title)).toBeOnTheScreen();
      expect(screen.getByText(body)).toBeOnTheScreen();
      expect(callbacks.onPermissionContinue).not.toHaveBeenCalled();
      fireEvent.press(screen.getByRole("button", { name: action }));
      expect(callbacks.onPermissionContinue).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText("Voice input - record a transaction")
      ).toBeNull();
    }
  );

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
    expect(screen.getByText("Your limits reset tomorrow.")).toBeOnTheScreen();
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

  const panels = [
    {
      language: "en",
      state: "recording",
      durationMs: 12_750,
      title: "Listening...",
      second: "Pause",
      secondId: "voice-action-pause",
    },
    {
      language: "en",
      state: "paused",
      durationMs: 12_750,
      title: "Recording paused",
      second: "Resume",
      secondId: "voice-action-resume",
    },
    {
      language: "en",
      state: "completed",
      durationMs: 30_100,
      title: "Recording complete",
      second: "Pause",
      secondId: "voice-action-pause",
    },
    {
      language: "ar",
      state: "recording",
      durationMs: 12_750,
      title: "جاري الاستماع...",
      second: "إيقاف مؤقت",
      secondId: "voice-action-pause",
    },
    {
      language: "ar",
      state: "paused",
      durationMs: 12_750,
      title: "التسجيل متوقف مؤقتًا",
      second: "متابعة",
      secondId: "voice-action-resume",
    },
    {
      language: "ar",
      state: "completed",
      durationMs: 30_100,
      title: "التسجيل مكتمل",
      second: "إيقاف مؤقت",
      secondId: "voice-action-pause",
    },
  ] as const;

  it.each(panels)(
    "uses physical Submit / $second / Discard for $language $state",
    ({ language, state, durationMs, title, second, secondId }): void => {
      mockLanguage = language;
      renderVoice({ state, durationMs, remaining: 3 });
      const submitLabel = language === "ar" ? "إرسال" : "Submit";
      const discardLabel = language === "ar" ? "تجاهل" : "Discard";
      expect(screen.getByText(title)).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: submitLabel })).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: second })).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: discardLabel })).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
      expect(screen.queryByTestId("voice-action-stop")).toBeNull();

      const submit = screen.getByTestId("voice-action-submit");
      const center = screen.getByTestId(secondId);
      const discard = screen.getByTestId("voice-action-discard");
      // React tree order (not translated flex-row-reverse) proves the stable
      // physical LEFT/CENTER/RIGHT identity even for RTL content.
      expectPhysicalRecorderOrder(submit, center, discard);

      const completed = state === "completed";
      expect(getTestInstanceProps(center).accessibilityState).toEqual(
        expect.objectContaining({ disabled: completed })
      );
      expect(screen.queryByTestId("voice-action-resume")).toBe(
        state === "paused" ? center : null
      );
      const timer = completed ? "00:30 / 00:30" : "00:12 / 00:30";
      expect(screen.getByText(timer)).toBeOnTheScreen();
      expect(screen.queryByText("01:01")).toBeNull();
      expect(screen.queryByText(/tap to stop|keep speaking|speak now/i)).toBeNull();

      fireEvent.press(submit);
      fireEvent.press(center);
      fireEvent.press(discard);
      expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
      expect(callbacks.onDiscard).toHaveBeenCalledTimes(1);
      expect(callbacks.onPause).toHaveBeenCalledTimes(
        state === "recording" ? 1 : 0
      );
      expect(callbacks.onResume).toHaveBeenCalledTimes(state === "paused" ? 1 : 0);
    }
  );

  it.each([
    ["recording", 30_000, "00:30 / 00:30"],
    ["paused", 83_000, "00:30 / 00:30"],
    ["completed", 2_500, "00:30 / 00:30"],
  ] as const)(
    "clamps %s time from %sms and retains max-cap presentation",
    (state, durationMs, expectedTimer): void => {
      renderVoice({ state, durationMs });
      expect(screen.getByText(expectedTimer)).toBeOnTheScreen();
      expect(screen.queryByText("01:23")).toBeNull();
    }
  );

  it("keeps retained completed audio a presentation-only state until explicit Submit", (): void => {
    renderVoice({ state: "completed", durationMs: 30_000 });
    expect(screen.getByText("Recording complete")).toBeOnTheScreen();
    expect(screen.queryByTestId("voice-recording-ripple-first", {
      includeHiddenElements: true,
    })).toBeNull();
    expect(screen.queryByTestId("voice-recording-ripple-second", {
      includeHiddenElements: true,
    })).toBeNull();
    expect(screen.queryByTestId("voice-recording-activity", {
      includeHiddenElements: true,
    })).toBeNull();
    expect(screen.queryByTestId("voice-action-resume")).toBeNull();
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("voice-action-submit"));
    expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
  });

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
