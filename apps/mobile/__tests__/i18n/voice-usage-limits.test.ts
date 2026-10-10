import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import arTransactions from "@/locales/ar/transactions.json";
import enTransactions from "@/locales/en/transactions.json";

const approvedKeys = [
  "voice_ui_limited_heading",
  "voice_ui_remaining",
  "voice_ui_reset",
  "voice_ui_idle_title",
  "voice_ui_idle_description",
  "voice_ui_examples_heading",
  "voice_ui_example_first",
  "voice_ui_example_second",
  "voice_ui_example_third",
  "voice_ui_daily_title",
  "voice_ui_daily_count",
  "voice_ui_daily_unavailable_title",
  "voice_ui_daily_unavailable_description",
  "voice_ui_daily_try_tomorrow",
  "voice_ui_daily_use_manual",
  "voice_ui_daily_reset_strip",
  "voice_ui_unavailable_title",
] as const;

function getVoiceCopy(resource: object): Record<string, string> {
  const entries = Object.fromEntries(Object.entries(resource)) as Record<string, string>;
  return Object.fromEntries(
    approvedKeys.map((key) => [key, entries[key] ?? ""])
  );
}

describe("approved Voice UI common namespace copy", () => {
  const english = getVoiceCopy(enCommon);
  const arabic = getVoiceCopy(arCommon);

  it("keeps nonempty English/Arabic parity without moving transaction translations", () => {
    for (const key of approvedKeys) {
      expect(english[key]).toBeTruthy();
      expect(arabic[key]).toBeTruthy();
    }
    expect(enTransactions.voice_limit_unavailable).toBeTruthy();
    expect(arTransactions.voice_limit_unavailable).toBeTruthy();
  });

  it("uses exact approved English idle labels, ordered examples, and daily actions", () => {
    expect(english.voice_ui_limited_heading).toBe("Limited free voice usage");
    expect(english.voice_ui_idle_title).toBe("Tap and speak your transaction");
    expect(english.voice_ui_idle_description).toBe(
      "Speak naturally. We’ll extract the details for you."
    );
    expect(english.voice_ui_examples_heading).toBe("Try saying something like");
    expect([
      english.voice_ui_example_first,
      english.voice_ui_example_second,
      english.voice_ui_example_third,
    ]).toEqual([
      "I paid 120 pounds at Talabat for food",
      "50 pounds for Uber today",
      "A coffee from Costa for 75 pounds",
    ]);
    expect(english.voice_ui_daily_title).toBe("Daily voice limit reached");
    expect(english.voice_ui_daily_unavailable_title).toBe(
      "Voice recording unavailable"
    );
    expect(english.voice_ui_daily_try_tomorrow).toBe("Try again tomorrow");
    expect(english.voice_ui_daily_use_manual).toBe("Use manual entry");
    expect(english.voice_ui_unavailable_title).toBe("Voice unavailable");
    expect(english.voice_ui_daily_unavailable_description).toBe(
      "You can try again tomorrow."
    );
  });

  it("preserves approved Arabic idle examples and distinct exhausted recovery", () => {
    expect(arabic.voice_ui_idle_title).toBe(arTransactions.voice_idle_title);
    expect(arabic.voice_ui_examples_heading).toBe("أمثلة على ما يمكنك قوله");
    expect([
      arabic.voice_ui_example_first,
      arabic.voice_ui_example_second,
      arabic.voice_ui_example_third,
    ]).toEqual([
      arTransactions.voice_example_cafe,
      arTransactions.voice_example_groceries,
      arTransactions.voice_example_transport,
    ]);
    expect(arabic.voice_ui_daily_title).toBe(
      "تم الوصول إلى الحد اليومي للاستخدام الصوتي"
    );
    expect(arabic.voice_ui_daily_unavailable_title).toBe(
      "إدخال صوتي غير متاح الآن"
    );
    expect(arabic.voice_ui_daily_use_manual).toBe("استخدم الإدخال اليدوي");
    expect(arabic.voice_ui_unavailable_title).toBe("الإدخال الصوتي غير متاح");
  });

  it("interpolates server-driven counts and uses next-local-midnight reset copy", () => {
    for (const resources of [english, arabic]) {
      expect(resources.voice_ui_remaining).toContain("{{remaining}}");
      expect(resources.voice_ui_daily_count).toContain("{{limit}}");
      for (const key of ["voice_ui_reset", "voice_ui_daily_reset_strip"]) {
        const message = resources[key].toLowerCase();
        expect(message).toBeTruthy();
        expect(message).not.toMatch(/same time|same hour|24 hours|24h|نفس التوقيت|نفس الوقت|٢٤ ساعة/);
      }
    }
    expect(english.voice_ui_reset).toMatch(/tomorrow/i);
    expect(arabic.voice_ui_reset).toContain("غد");
  });
});
