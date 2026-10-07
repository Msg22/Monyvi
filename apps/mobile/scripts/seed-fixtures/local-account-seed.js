const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { writeFileSync, unlinkSync } = require("node:fs");
const { resolve } = require("node:path");

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const ACCOUNT_COLUMNS = [
  "id",
  "user_id",
  "name",
  "type",
  "balance",
  "currency",
  "institution_id",
  "provider_display_name",
  "is_default",
  "deleted",
  "created_at",
  "updated_at",
];
const REQUIRED_COLUMNS = [
  "id",
  "user_id",
  "name",
  "type",
  "balance",
  "currency",
  "is_default",
  "deleted",
  "created_at",
  "updated_at",
];

function encodeAccountRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Local account seed requires account rows");
  }

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!ACCOUNT_COLUMNS.includes(column)) {
        throw new Error(`Unsupported local account seed field: ${column}`);
      }
    }
    for (const column of REQUIRED_COLUMNS) {
      if (row[column] == null) {
        throw new Error(`Missing local account seed field: ${column}`);
      }
    }
    if (!Number.isFinite(row.balance)) {
      throw new Error("Local account seed balance must be finite");
    }
  }

  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
}

function seedRowsSql(rows) {
  const encoded = encodeAccountRows(rows);
  return `jsonb_populate_recordset(NULL::public.accounts, convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)`;
}

function buildAccountUpsertSql(rows) {
  const columns = ACCOUNT_COLUMNS.join(", ");
  const values = ACCOUNT_COLUMNS.map((column) => `seed.${column}`).join(", ");
  const updates = ACCOUNT_COLUMNS.filter(
    (column) => column !== "id" && column !== "user_id"
  )
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(",\n      ");

  return `DO $seed$
DECLARE affected_count integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Local account seed requires postgres role';
  END IF;
  WITH seed AS (SELECT * FROM ${seedRowsSql(rows)})
  INSERT INTO public.accounts (${columns})
  SELECT ${values} FROM seed
  ON CONFLICT (id) DO UPDATE SET
      ${updates}
  WHERE public.accounts.user_id = EXCLUDED.user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> ${rows.length} THEN
    RAISE EXCEPTION 'Local account seed wrote % of ${rows.length} accounts', affected_count;
  END IF;
END $seed$;`;
}

function buildBalanceRestoreSql(rows) {
  return `DO $seed$
DECLARE updated_count integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Local account seed requires postgres role';
  END IF;
  WITH desired AS (SELECT * FROM ${seedRowsSql(rows)})
  UPDATE public.accounts AS account
  SET balance = desired.balance, updated_at = desired.updated_at
  FROM desired
  WHERE account.id = desired.id
    AND account.user_id = desired.user_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> ${rows.length} THEN
    RAISE EXCEPTION 'Local account seed restored % of ${rows.length} balances', updated_count;
  END IF;
END $seed$;`;
}

function runLocalSql(sql) {
  const filename = `.tmp-local-account-seed-${process.pid}-${randomUUID()}.sql`;
  const sqlPath = resolve(repoRoot, filename);
  writeFileSync(sqlPath, sql, "utf8");

  try {
    const isWindows = process.platform === "win32";
    const result = spawnSync(
      isWindows ? "cmd.exe" : "npx",
      isWindows
        ? [
            "/d",
            "/s",
            "/c",
            `npx --no-install supabase db query --local -f ${filename}`,
          ]
        : [
            "--no-install",
            "supabase",
            "db",
            "query",
            "--local",
            "-f",
            filename,
          ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120_000,
      }
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        [
          "Local account seed SQL failed",
          result.error?.message,
          result.stderr,
          result.stdout,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  } finally {
    unlinkSync(sqlPath);
  }
}

async function upsertLocalAccountRows(rows) {
  runLocalSql(buildAccountUpsertSql(rows));
}

async function restoreLocalAccountBalances(rows) {
  runLocalSql(buildBalanceRestoreSql(rows));
}

module.exports = {
  buildAccountUpsertSql,
  buildBalanceRestoreSql,
  restoreLocalAccountBalances,
  upsertLocalAccountRows,
};
