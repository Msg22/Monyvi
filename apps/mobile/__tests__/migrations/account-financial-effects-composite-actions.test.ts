import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/069_account_financial_effects.sql"
);

describe("migration 069 composite writer actions", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("registers exact recurring Pay Now and SMS review action tuples", () => {
    expect(sql).toMatch(
      /\('recurring_payments',\s*'pay_now',\s*'recurring\.pay-now'\)/
    );
    expect(sql).toMatch(
      /\('sms',\s*'review_confirm',\s*'sms\.review-durable'\)/
    );
  });

  it("whitelists only the recurring schedule fields changed by Pay Now", () => {
    expect(sql).toMatch(
      /recurring\.pay-now[\s\S]*recurring_payment[\s\S]*nextDueDate[\s\S]*status/
    );
    expect(sql).toMatch(
      /UPDATE public\.recurring_payments[\s\S]*next_due_date[\s\S]*status/
    );
  });

  it("validates SMS review draft deletion without arbitrary table dispatch", () => {
    const smsDescriptorValidation = sql.slice(
      sql.indexOf("ELSIF v_entity = 'sms_review_draft_item'"),
      sql.indexOf("ELSIF v_entity = 'transfer'")
    );

    expect(sql).toMatch(
      /sms\.review-durable[\s\S]*sms_review_draft_item[\s\S]*smsFingerprint/
    );
    expect(smsDescriptorValidation).toContain("snapshotHash");
    expect(smsDescriptorValidation).not.toMatch(
      /payloadJson|originalSms|parsedAt|position|selectionOverride/
    );
    expect(sql).not.toMatch(/EXECUTE\s+format\s*\(/i);
  });
});
