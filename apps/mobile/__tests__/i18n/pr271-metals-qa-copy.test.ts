import en from "../../locales/en/metals.json";
import ar from "../../locales/ar/metals.json";

describe("PR #271 Metals QA copy", () => {
  it("replaces Active Portfolio in both visible and accessibility copy", () => {
    expect(en.portfolio.active_portfolio).toBe("Your gold and silver");
    expect(ar.portfolio.active_portfolio).toBe("تابع قيمة ذهبك وفضتك");
    expect(JSON.stringify(en)).not.toMatch(/Active portfolio/i);
  });

  it("uses the exact selected-observation last-updated sentence", () => {
    expect(en.portfolio.rates_updated).toBe(
      "Prices last updated {{date}} at {{time}}. They may have changed since then."
    );
    expect(ar.portfolio.rates_updated).toBe(
      "آخر تحديث للأسعار: {{date}}، {{time}}. قد تكون تغيّرت بعد ذلك."
    );
  });

  it("does not expose a 24-hour staleness warning in customer-facing Metals copy", () => {
    const customerCopy = `${JSON.stringify(en)} ${JSON.stringify(ar)}`;
    expect(customerCopy).not.toMatch(/older than 24 hours|24h|24 ساعة/iu);
  });

  it("uses the friendly calculation fallback", () => {
    expect(en.detail.calculation_breakdown_unavailable).toBe(
      "Breakdown unavailable. The total is based on your recorded details."
    );
    expect(ar.detail.calculation_breakdown_unavailable).toBe(
      "التفصيل غير متاح. الإجمالي مبني على التفاصيل التي سجلتها."
    );
  });
});
