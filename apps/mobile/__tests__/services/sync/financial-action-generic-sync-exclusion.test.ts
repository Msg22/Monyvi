import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      financial_action_groups: {},
      market_rates: {},
    },
  },
}));

import {
  DEDICATED_SYNC_TABLES,
  EXCLUDED_TABLES,
  SYNCABLE_TABLES,
} from "../../../services/sync/config";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../../");

describe("financial action generic sync exclusion", () => {
  it("permanently routes financial_action_groups away from generic sync", () => {
    expect(DEDICATED_SYNC_TABLES).toContain("financial_action_groups");
    expect(EXCLUDED_TABLES).not.toContain("financial_action_groups");
    expect(SYNCABLE_TABLES).not.toContain("financial_action_groups");
  });

  it("returns dedicated ids to Watermelon for rejection without blocking generic writes", () => {
    const pushService = readFileSync(
      resolve(REPOSITORY_ROOT, "apps/mobile/services/sync/push-service.ts"),
      "utf8"
    );
    const synchronizeSource = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "node_modules/@nozbe/watermelondb/src/sync/impl/synchronize.js"
      ),
      "utf8"
    );
    const markAsSyncedSource = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "node_modules/@nozbe/watermelondb/src/sync/impl/markAsSynced.js"
      ),
      "utf8"
    );
    const contract = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "specs/035-metals-module-redesign/contracts/action-contract.md"
      ),
      "utf8"
    );

    expect(pushService).toContain("DEDICATED_SYNC_TABLES");
    expect(pushService).toContain("experimentalRejectedIds");
    expect(pushService).not.toContain("sync_dedicated_table_changes_pending");
    expect(synchronizeSource).toContain(
      "markLocalChangesAsSynced(database, localChanges, pushResult.experimentalRejectedIds)"
    );
    expect(markAsSyncedSource).toContain("!rejectedIds.has(id)");
    expect(markAsSyncedSource).toContain(
      "changes[tableName].deleted.filter((id) => !rejectedIds.has(id))"
    );
    expect(contract).toMatch(
      /Generic push returns every captured dedicated-table row ID through\s+WatermelonDB's rejected-ID result/
    );
  });

  it.each([
    "scripts/transform-schema.js",
    "scripts/sql-to-watermelon-migration.js",
  ])(
    "keeps financial_action_groups included in %s generation",
    (relativePath) => {
      const generator = readFileSync(
        resolve(REPOSITORY_ROOT, relativePath),
        "utf8"
      );
      const excludedDeclaration = generator.match(
        /const EXCLUDED_TABLES = \[[\s\S]*?\];/
      );

      expect(excludedDeclaration?.[0]).toBeDefined();
      expect(excludedDeclaration?.[0]).not.toContain(
        '"financial_action_groups"'
      );
      expect(excludedDeclaration?.[0]).not.toContain(
        "'financial_action_groups'"
      );
    }
  );

  it("registers the generated local table and persisted-field-only model", () => {
    const schema = readFileSync(
      resolve(REPOSITORY_ROOT, "packages/db/src/schema.ts"),
      "utf8"
    );
    const database = readFileSync(
      resolve(REPOSITORY_ROOT, "packages/db/src/database.ts"),
      "utf8"
    );
    const model = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "packages/db/src/models/FinancialActionGroup.ts"
      ),
      "utf8"
    );

    expect(schema).toContain('name: "financial_action_groups"');
    expect(schema).toContain("financial_action_groups_user_action_unique");
    expect(database).toContain("FinancialActionGroup");
    expect(model).toContain("BaseFinancialActionGroup");
    expect(model).not.toContain("calculate");
    expect(model).not.toContain("format");
  });

  it("keeps authenticated clients read-only and routes mutations through the dedicated server boundary", () => {
    const migration = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "supabase/migrations/067_financial_action_foundation.sql"
      ),
      "utf8"
    );

    expect(migration).toMatch(
      /CREATE POLICY "Users can select own financial action groups"[\s\S]*?FOR SELECT TO authenticated/
    );
    expect(migration).not.toMatch(
      /CREATE POLICY[\s\S]*?financial action groups"[\s\S]*?FOR (?:INSERT|UPDATE|DELETE) TO authenticated/
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.financial_action_groups FROM authenticated"
    );
    expect(migration).toContain(
      "GRANT SELECT ON public.financial_action_groups TO authenticated"
    );
  });

  it("binds root columns to the canonical envelope and stores guard arrays as canonical JSON", () => {
    const migration = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "supabase/migrations/067_financial_action_foundation.sql"
      ),
      "utf8"
    );
    const localMigration = readFileSync(
      resolve(REPOSITORY_ROOT, "packages/db/src/migrations.ts"),
      "utf8"
    );
    const generatedModel = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "packages/db/src/models/base/base-financial-action-group.ts"
      ),
      "utf8"
    );

    expect(migration).toContain(
      "private.financial_action_assert_root_binding_v1"
    );
    expect(migration).toMatch(/account_guards_json jsonb/);
    expect(migration).toContain(
      "financial_action_groups_foundation_guards_empty"
    );
    expect(localMigration).toMatch(
      /name: "account_guards_json",\s+type: "string"/
    );
    expect(localMigration).toContain(
      "financial_action_groups_user_action_unique"
    );
    expect(generatedModel).toContain("accountGuardsJson!: string");
  });

  it("fails closed on unknown action definitions and illegal state evidence", () => {
    const migration = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "supabase/migrations/067_financial_action_foundation.sql"
      ),
      "utf8"
    );
    const repository = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "apps/mobile/services/financial-action-foundation-repository.ts"
      ),
      "utf8"
    );

    expect(migration).toContain(
      "private.financial_action_validate_registered_payload_v1"
    );
    expect(migration).toContain("financial_action_unknown_definition");
    expect(migration).toContain(
      "private.financial_action_assert_transition_v1"
    );
    expect(migration).toContain(
      "private.financial_action_validate_state_evidence_v1"
    );
    expect(migration).toContain(
      "private.financial_action_assert_evidence_update_v1"
    );
    expect(migration).toContain("p_old_state = 'reconciliation_incomplete'");
    expect(migration).toContain(
      "jsonb_typeof(p_value -> 'actionId') IS DISTINCT FROM 'string'"
    );
    expect(migration).toContain("IF jsonb_typeof(p_payload) <> 'object' THEN");
    expect(migration).toContain(
      "IF jsonb_typeof(p_payload -> 'rateReferenceIds') <> 'array' THEN"
    );
    expect(migration).toContain(
      "financial_action_groups_validate_state_transition"
    );
    expect(migration).toContain("CHECK (deleted = false)");
    expect(repository).not.toContain("softDeleteFinancialActionGroup");
  });

  it("keeps SQL action payload bounds in parity with the pure contract", () => {
    const migration = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "supabase/migrations/067_financial_action_foundation.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("octet_length(p_raw_text) > 65536");
    expect(migration).toContain("financial_action_payload_too_large");
    expect(migration).toContain("octet_length(p_payload ->> 'notes') > 4096");
    expect(migration).toContain(
      "jsonb_array_length(p_payload -> 'rateReferenceIds') > 16"
    );
    expect(migration).toContain(
      "length(replace(p_payload ->> 'grossProceedsDecimal', '.', '')) > 50"
    );
    expect(migration).toContain(
      "length(split_part(p_payload ->> 'grossProceedsDecimal', '.', 2)) > 18"
    );
    expect(migration).toContain("length(p_payload ->> 'feeMinorUnits') > 50");
    expect(migration).toContain(
      "length(p_payload ->> 'netProceedsMinorUnits') > 50"
    );
  });

  it("executes owner-only RLS and immutable-root pgTAP coverage", () => {
    const sqlTest = readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "supabase/tests/financial_action_canonicalization_test.sql"
      ),
      "utf8"
    );

    expect(sqlTest).toContain("select plan(66)");
    expect(sqlTest).toContain("SET LOCAL ROLE authenticated");
    expect(sqlTest).toContain("RESET ROLE");
    expect(sqlTest).toContain("authenticated owner can select its root");
    expect(sqlTest).toContain("authenticated owner cannot see a foreign root");
    expect(sqlTest).toContain("authenticated insert is denied");
    expect(sqlTest).toContain("authenticated update is denied");
    expect(sqlTest).toContain("authenticated delete is denied");
    expect(sqlTest).toContain(
      "server-side hard delete of a durable root is rejected"
    );
    expect(sqlTest).toContain(
      "owner cascade cannot delete durable action roots"
    );
    expect(sqlTest).toContain("private canonicalizer execution is denied");
    expect(sqlTest).toContain("private state execution is denied");
    expect(sqlTest).toContain("private helper execution is denied");
    [
      "action_id",
      "user_id",
      "domain",
      "kind",
      "domain_reference_id",
      "payload_json",
      "payload_hash",
      "account_guards_json",
      "deleted",
    ].forEach((column) => {
      expect(sqlTest).toContain(`update ${column} is rejected`);
    });
    expect(sqlTest).toContain(
      "failed immutable updates leave the root unchanged"
    );
  });
});
