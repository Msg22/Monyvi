const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

test("issue 321 approved verification mockup bindings remain authoritative", () => {
  const repoRoot = join(__dirname, "..");
  const verifier = join(repoRoot, "scripts", "verify-mockup-binding.js");
  const sidecars = [
    join(
      repoRoot,
      "specs",
      "321-email-verification",
      "mockups",
      "verification-en-light.binding.md"
    ),
    join(
      repoRoot,
      "specs",
      "321-email-verification",
      "mockups",
      "verification-en-dark.binding.md"
    ),
    join(
      repoRoot,
      "specs",
      "321-email-verification",
      "mockups",
      "verification-ar-light.binding.md"
    ),
  ];

  const result = spawnSync(process.execPath, [verifier, ...sidecars], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  assert.equal(
    result.status,
    0,
    [
      "Mockup binding verifier failed for issue 321.",
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join("\n")
  );

  for (const sidecar of sidecars) {
    assert.match(result.stdout, new RegExp(`PASS .*\${sidecar.split(/[\\/]/).pop()}`));
  }
});
