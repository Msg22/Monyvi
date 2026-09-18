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
const EN_BUDGETS_SOURCE = readMobileSource("../../../locales/en/budgets.json");

describe("Budget form approved mockup fidelity contract", () => {
  it("uses the compact safe-area header and approved create title", () => {
    expect(CREATE_BUDGET_SOURCE).toContain('variant="compact"');
    expect(CREATE_BUDGET_SOURCE).toContain("includeTopSafeAreaInset={true}");
    expect(CREATE_BUDGET_SOURCE).toContain('t("create_budget")');
    expect(CREATE_BUDGET_SOURCE).not.toContain(
      'isEdit ? t("edit_budget") : t("new_budget")'
    );
    expect(CREATE_BUDGET_SOURCE).toContain("dark:bg-slate-950");
  });

  it("keeps scope cards compact, horizontal, and radio-like", () => {
    expect(FORM_SECTIONS_SOURCE).toContain(
      "relative min-h-20 flex-1 flex-row items-center rounded-2xl border px-3 py-3"
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      "budget-scope-${props.type.toLowerCase()}-indicator"
    );
    expect(FORM_SECTIONS_SOURCE).toContain("border-2 border-slate-600");
    expect(FORM_SECTIONS_SOURCE).not.toContain(
      "mb-3 h-11 w-11 items-center justify-center"
    );
  });

  it("uses compact mockup fields without the extra currency notice", () => {
    expect(FORM_SECTIONS_SOURCE).not.toContain("BudgetCurrencyNotice");
    expect(FORM_SECTIONS_SOURCE).toContain(
      "rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
    );
    expect(FORM_SECTIONS_SOURCE).toContain('testID="budget-period-card"');
    expect(FORM_SECTIONS_SOURCE).toContain('testID="budget-period-segmented"');
  });

  it("uses the approved compact green alert treatment", () => {
    expect(FORM_SECTIONS_SOURCE).toContain('variant="mockup"');
    expect(ALERT_SLIDER_SOURCE).toContain(
      'variant?: "default" | "mockup"'
    );
    expect(ALERT_SLIDER_SOURCE).toContain("palette.nileGreen[500]");
    expect(ALERT_SLIDER_SOURCE).toContain("palette.slate[25]");
    expect(ALERT_SLIDER_SOURCE).toContain("variant === \"default\"");
  });

  it("uses the compact preview and approved gradient action surface", () => {
    expect(FORM_SECTIONS_SOURCE).toContain(
      "flex-row border-t border-slate-700/70 px-3 py-3"
    );
    expect(FORM_SECTIONS_SOURCE).toContain(
      'testID="budget-form-submit-gradient"'
    );
    expect(FORM_SECTIONS_SOURCE).toContain("<LinearGradient");
    expect(FORM_SECTIONS_SOURCE).toContain("palette.nileGreen[400]");
    expect(FORM_SECTIONS_SOURCE).toContain("palette.nileGreen[500]");
    expect(FORM_SECTIONS_SOURCE).toContain("color={palette.slate[900]}");
    expect(FORM_SECTIONS_SOURCE).toContain(
      "bg-background px-5 pt-3 dark:bg-slate-950"
    );
    expect(FORM_SECTIONS_SOURCE).not.toContain(
      "border-t border-slate-200 bg-white px-5 pt-3"
    );
  });

  it("uses sentence-case approved English copy", () => {
    expect(EN_BUDGETS_SOURCE).toContain(
      '\"create_budget\": \"Create budget\"'
    );
    expect(EN_BUDGETS_SOURCE).toContain('\"budget_limit\": \"Limit\"');
  });
});
