import ar from "@/locales/ar/onboarding.json";
import en from "@/locales/en/onboarding.json";

describe("voice pitch copy", () => {
  it.each([
    ["English", en, ["40", "2,000", "500"]],
    ["Arabic", ar, ["٤٠", "٢٠٠٠", "٥٠٠"]],
  ] as const)(
    "%s describes three reviewable transactions without auto-save claims",
    (_name, copy, amounts) => {
      amounts.forEach((amount) => {
        expect(copy.pitch_slide_voice_transcript).toContain(amount);
      });
      expect(copy.pitch_slide_voice_count).toBeTruthy();
      expect(copy.pitch_slide_voice_result_coffee_title).toBeTruthy();
      expect(copy.pitch_slide_voice_result_clothes_title).toBeTruthy();
      expect(copy.pitch_slide_voice_result_borrowed_title).toBeTruthy();
      expect(copy.pitch_slide_voice_review_ready).toBeTruthy();

      const voiceCopy = Object.fromEntries(
        Object.entries(copy).filter(([key]) =>
          key.startsWith("pitch_slide_voice_")
        )
      );
      expect(JSON.stringify(voiceCopy)).not.toContain("Saved automatically");
      expect(JSON.stringify(voiceCopy)).not.toContain("تم الحفظ تلقائيًا");
      expect(JSON.stringify(voiceCopy)).not.toContain("Main CIB Account");
    }
  );
});
