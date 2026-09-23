const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

// Issue #284 (PR #254 review r3939851776): the server backfill must recognize
// the exact legacy purity representations named by the local WatermelonDB
// migration (22K/14K karat fractions plus the alternate 14K rounding and the
// 23.5K catalog member), mapping each to the same code/factor the local
// migration produces. No blind rounding: every representation keeps the exact
// local output tuple.
const EXPECTED_TUPLES = [
  { metal: "GOLD", code: "gold-9999", factor: "0.9999", reps: ["0.9999"] },
  { metal: "GOLD", code: "gold-999", factor: "0.999", reps: ["0.999"] },
  { metal: "GOLD", code: "gold-995", factor: "0.995", reps: ["0.995"] },
  { metal: "GOLD", code: "gold-97916", factor: "0.97916", reps: ["0.97916"] },
  {
    metal: "GOLD",
    code: "gold-9167",
    factor: "0.9167",
    reps: ["22.0/24.0", "0.9167"],
  },
  { metal: "GOLD", code: "gold-875", factor: "0.875", reps: ["0.875"] },
  { metal: "GOLD", code: "gold-750", factor: "0.75", reps: ["0.75"] },
  {
    metal: "GOLD",
    code: "gold-58333",
    factor: "0.58333",
    reps: ["14.0/24.0", "0.5833", "0.58333"],
  },
  { metal: "GOLD", code: "gold-500", factor: "0.5", reps: ["0.5"] },
  { metal: "GOLD", code: "gold-375", factor: "0.375", reps: ["0.375"] },
  { metal: "SILVER", code: "silver-9999", factor: "0.9999", reps: ["0.9999"] },
  { metal: "SILVER", code: "silver-999", factor: "0.999", reps: ["0.999"] },
  { metal: "SILVER", code: "silver-925", factor: "0.925", reps: ["0.925"] },
  { metal: "SILVER", code: "silver-900", factor: "0.9", reps: ["0.9"] },
  { metal: "SILVER", code: "silver-800", factor: "0.8", reps: ["0.8"] },
  { metal: "SILVER", code: "silver-600", factor: "0.6", reps: ["0.6"] },
];

const normalize = (value) => value.replace(/\s+/g, "");

function whenClausesFor(sql, metal, thenPattern) {
  const clauses = [];
  const pattern = /WHEN([\s\S]*?)THEN\s*('[^']*'|[0-9.]+)/g;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    const normalized = normalize(match[1]);
    if (
      normalized.includes(`metal.metal_type='${metal}'`) &&
      thenPattern.test(normalize(match[2]))
    ) {
      clauses.push(normalized);
    }
  }
  return clauses;
}

const codePattern = (code) => new RegExp(`^'${code}'$`);
const factorPattern = (factor) =>
  new RegExp(`^${factor.replace(/\./g, "\\.")}$`);

test("local WatermelonDB migration names every expected legacy representation", () => {
  const local = readFileSync(
    path.join(__dirname, "../packages/db/src/migrations.ts"),
    "utf8"
  );
  for (const tuple of EXPECTED_TUPLES) {
    for (const rep of tuple.reps) {
      const line = local
        .split("\n")
        .find(
          (candidate) =>
            normalize(candidate).includes(normalize(rep)) &&
            candidate.includes(`'${tuple.code}'`)
        );
      assert.ok(
        line,
        `local migration maps ${rep} to ${tuple.code}`
      );
    }
  }
});

test("075 server backfill ports every legacy representation with local outputs", () => {
  const server = readFileSync(
    path.join(
      __dirname,
      "../supabase/migrations/075_metals_persistence_hardening.sql"
    ),
    "utf8"
  );
  for (const tuple of EXPECTED_TUPLES) {
    const codeLines = whenClausesFor(server, tuple.metal, codePattern(tuple.code));
    assert.ok(
      codeLines.length > 0,
      `075 maps ${tuple.metal} to code ${tuple.code}`
    );
    for (const rep of tuple.reps) {
      assert.ok(
        codeLines.some((line) => normalize(line).includes(normalize(rep))),
        `075 code CASE maps ${rep} to ${tuple.code}`
      );
    }
    const factorLines = whenClausesFor(
      server,
      tuple.metal,
      factorPattern(tuple.factor)
    );
    assert.ok(
      factorLines.length > 0,
      `075 maps ${tuple.metal} to factor ${tuple.factor}`
    );
    for (const rep of tuple.reps) {
      assert.ok(
        factorLines.some((line) => normalize(line).includes(normalize(rep))),
        `075 factor CASE maps ${rep} to ${tuple.factor}`
      );
    }
  }
});
