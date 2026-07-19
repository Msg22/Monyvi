import { isLikelyCorruptedSmsText } from "../sms-text-quality";

describe("SMS text quality", () => {
  it("detects an SMS whose non-Latin text was replaced by question marks", () => {
    expect(
      isLikelyCorruptedSmsText(
        "??? QNB ?????? ???? ???? 13.5% ??? ?????? 1000EGP ???????"
      )
    ).toBe(true);
  });

  it("detects Unicode replacement characters", () => {
    expect(isLikelyCorruptedSmsText("QNB transfer \uFFFD\uFFFD EGP 100")).toBe(
      true
    );
  });

  it("keeps valid Arabic financial text", () => {
    expect(
      isLikelyCorruptedSmsText(
        "تم تحويل مبلغ 100 جنيه من حسابك بنجاح. للاستفسار اتصل على 19700"
      )
    ).toBe(false);
  });

  it("keeps ordinary question punctuation", () => {
    expect(
      isLikelyCorruptedSmsText(
        "Did you make this purchase? QNB card transaction EGP 100"
      )
    ).toBe(false);
  });
});
