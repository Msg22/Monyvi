import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readMobileSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

const CREATE_BUDGET_SOURCE = readMobileSource(
  "../../../app/(private)/create-budget.tsx"
);
const FORM_SECTIONS_SOURCE = readMobileSource(
  "../../../components/budget/BudgetFormSections.tsx"
);
const ALERT_SLIDER_SOURCE = readMobileSource(
  "../../../components/budget/AlertThresholdSlider.tsx"
);
const EN_BUDGET_COPY = readMobileSource("../../../locales/en/budgets.json");

describe("Budget form approved mockup fidelity contract", () => {
  it("uses the compact safe-area header and approved create title", () => {
    expect(CREATE_BUDGET_SOURCE).toContain('variant="review"');
    expect(CREATE_BUDGET_SOURCE).toContain("includeTopSafeAreaInset={true}");
    expect(CREATE_BUDGET_SOURCE).toContain('t("accessibility_create_budget")');
    expect(CREATE_BUDGET_SOURCE).not.toContain(
      'isEdit ? t("edit_budget") : t("new_budget")'
    );
    expect(CREATE_BUDGET_SOURCE).toContain("dark:bg-background-dark");
    expect(CREATE_BUDGET_SOURCE).not.toContain("dark:bg-slate-950");
  });

  it("keeps scope cards compact, horizontal, and radio-like", () => {
    expect(FORM_SECTIONS_SOURCE).toContain(
      "relative min-h-20 flex-1 flex-row items-center rounded-2xl border px-3 py-3"
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      "budget-scope-${type.toLowerCase()}-indicator"
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      "border-2 border-slate-400 dark:border-slate-600"
    );
    expect(FORM_SECTIONS_SOURCE).toContain('icon="globe-outline"');
    expect(FORM_SECTIONS_SOURCE).not.toContain("numberOfLines={2}");
    expect(FORM_SECTIONS_SOURCE).not.toContain(
      "mb-3 h-11 w-11 items-center justify-center"
    );
  });

  it("uses compact mockup fields without the extra currency notice", () => {
    expect(FORM_SECTIONS_SOURCE).not.toContain("BudgetCurrencyNotice");
    expect(FORM_SECTIONS_SOURCE).toContain(
      "rounded-xl border border-slate-200 bg-white px-3 py-2.5"
    );
    expect(FORM_SECTIONS_SOURCE).toContain('testID="budget-period-card"');
    expect(FORM_SECTIONS_SOURCE).toContain('testID="budget-period-segmented"');
    expect(FORM_SECTIONS_SOURCE).toContain('capitalizeFirst(t("limit_label"))');
    expect(FORM_SECTIONS_SOURCE).toContain("dark:bg-surface-dark");
    expect(FORM_SECTIONS_SOURCE).not.toContain("dark:bg-slate-900");
    expect(EN_BUDGET_COPY).toContain('"budget_name": "Budget name"');
  });

  it("uses the approved compact green alert treatment", () => {
    expect(FORM_SECTIONS_SOURCE).toContain('variant="mockup"');
    expect(ALERT_SLIDER_SOURCE).toContain('variant?: "default" | "mockup"');
    expect(ALERT_SLIDER_SOURCE).toContain("palette.nileGreen[500]");
    expect(ALERT_SLIDER_SOURCE).toContain("palette.slate[25]");
    expect(ALERT_SLIDER_SOURCE).toContain('variant === "default"');
    expect(ALERT_SLIDER_SOURCE).toContain(
      'testID="budget-alert-threshold-track-row"'
    );
    expect(ALERT_SLIDER_SOURCE).toContain(
      'testID="budget-alert-threshold-percentage"'
    );
    expect(EN_BUDGET_COPY).toContain('"alert_threshold": "Alert threshold"');
  });

  it("uses the compact preview and approved gradient action surface", () => {
    expect(FORM_SECTIONS_SOURCE).toContain('testID="budget-preview-metrics"');
    expect(FORM_SECTIONS_SOURCE).toContain('compact ? "flex-col" : "flex-row"');
    expect(FORM_SECTIONS_SOURCE).toContain(
      "border-t border-slate-200 px-3 py-3 dark:border-slate-700/70"
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      'testID="budget-form-submit-gradient"'
    );
    expect(FORM_SECTIONS_SOURCE).toContain("<LinearGradient");
    expect(FORM_SECTIONS_SOURCE).toContain("palette.nileGreen[400]");
    expect(FORM_SECTIONS_SOURCE).toContain("palette.nileGreen[500]");
    expect(FORM_SECTIONS_SOURCE).toContain("color={palette.slate[900]}");
    expect(FORM_SECTIONS_SOURCE).toContain(
      "bg-background px-4 pt-3 dark:bg-background-dark"
    );
    expect(FORM_SECTIONS_SOURCE).not.toContain(
      "border-t border-slate-200 bg-white px-5 pt-3"
    );
  });

  it("uses the exact sentence-case form action without changing accessibility", () => {
    expect(FORM_SECTIONS_SOURCE).toContain(
      'labelKey: "accessibility_create_budget"'
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      'accessibilityLabelKey: "create_budget"'
    );
  });
});
