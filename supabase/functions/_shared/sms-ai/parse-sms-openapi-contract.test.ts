import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CONTRACT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../specs/388-sms-ai-provider/contracts/parse-sms.openapi.yaml"
);

function readContract(): string {
  return readFileSync(CONTRACT_PATH, "utf8");
}

function getEnumForFieldInSchema(
  contract: string,
  schema: string,
  field: string
): readonly string[] {
  const lines = contract.split("\n");
  const schemaIndex = lines.findIndex((line) =>
    new RegExp(`^    ${schema}:\\s*$`).test(line)
  );
  assert.ok(schemaIndex >= 0, `expected schema ${schema} to exist`);
  const nextSchemaIndex = lines.findIndex(
    (line, index) => index > schemaIndex && /^    \S+:\s*$/.test(line)
  );
  const schemaBlock = lines.slice(
    schemaIndex,
    nextSchemaIndex >= 0 ? nextSchemaIndex : lines.length
  );
  const fieldIndex = schemaBlock.findIndex((line) =>
    new RegExp(`^\\s+${field}:\\s*$`).test(line)
  );
  assert.ok(fieldIndex >= 0, `expected field ${field} inside schema ${schema}`);
  const window = schemaBlock.slice(fieldIndex, fieldIndex + 6).join("\n");
  assert.ok(
    !window.includes("const:"),
    `expected field ${field} in ${schema} to use enum, not const`
  );
  const match = window.match(/enum:\s*\[([^\]]+)\]/);
  assert.ok(
    match,
    `expected field ${field} in ${schema} to declare an inline enum`
  );
  return match[1].split(",").map((entry) => entry.trim());
}

test("parse-sms contract exposes the exact completionStatus enum", () => {
  const contract = readContract();
  assert.deepEqual(
    getEnumForFieldInSchema(contract, "ParseSmsSuccess", "completionStatus"),
    ["complete", "truncated", "safety_stopped", "failed"]
  );
});

test("parse-sms contract exposes the exact sizeScope enum", () => {
  const contract = readContract();
  assert.deepEqual(getEnumForFieldInSchema(contract, "Refusal", "sizeScope"), [
    "candidate",
    "batch",
    "shared_request",
  ]);
});
