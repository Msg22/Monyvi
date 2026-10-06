const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const MOBILE_ROOT = path.join(REPOSITORY_ROOT, "apps", "mobile");
const TAILWIND_CONFIG = path.join(MOBILE_ROOT, "tailwind.config.js");
const TAILWIND_CLI = require.resolve("tailwindcss/lib/cli/index.js", {
  paths: [MOBILE_ROOT, REPOSITORY_ROOT],
});

function compileSelectedClasses(classes) {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "monyvi-verification-tailwind-")
  );
  const inputPath = path.join(tempDirectory, "input.css");
  const contentPath = path.join(tempDirectory, "fixture.html");
  const outputPath = path.join(tempDirectory, "output.css");

  try {
    fs.writeFileSync(inputPath, "@tailwind utilities;\n", "utf8");
    fs.writeFileSync(
      contentPath,
      `<div class="${classes.join(" ")}"></div>\n`,
      "utf8"
    );

    execFileSync(
      process.execPath,
      [
        TAILWIND_CLI,
        "-c",
        TAILWIND_CONFIG,
        "-i",
        inputPath,
        "-o",
        outputPath,
        "--content",
        contentPath,
      ],
      {
        cwd: REPOSITORY_ROOT,
        stdio: "pipe",
      }
    );

    return fs.readFileSync(outputPath, "utf8");
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function readRule(css, escapedClassName) {
  const selectorIndex = css.indexOf(`.${escapedClassName}`);
  assert.notEqual(
    selectorIndex,
    -1,
    `Expected compiled selector .${escapedClassName}`
  );

  const openingBrace = css.indexOf("{", selectorIndex);
  const closingBrace = css.indexOf("}", openingBrace);
  assert.notEqual(openingBrace, -1);
  assert.notEqual(closingBrace, -1);
  return css.slice(openingBrace + 1, closingBrace);
}

test("real mobile Tailwind config compiles the approved verification state utilities", () => {
  const css = compileSelectedClasses([
    "text-slate-800",
    "text-red-600",
    "dark:text-red-500",
    "bg-slate-100",
    "dark:bg-slate-800",
    "h-[52px]",
    "rounded-[14px]",
    "text-error",
    "dark:text-error-dark",
  ]);

  assert.match(readRule(css, "text-slate-800"), /color:/);
  assert.match(readRule(css, "text-red-600"), /color:[^;]*220[^;]*38[^;]*38/);
  assert.match(
    readRule(css, "dark\\:text-red-500"),
    /color:[^;]*239[^;]*68[^;]*68/
  );
  assert.match(
    readRule(css, "bg-slate-100"),
    /background-color:[^;]*241[^;]*245[^;]*249/
  );
  assert.match(
    readRule(css, "dark\\:bg-slate-800"),
    /background-color:[^;]*30[^;]*41[^;]*59/
  );
  assert.match(readRule(css, "h-\\[52px\\]"), /height:\s*52px/);
  assert.match(
    readRule(css, "rounded-\\[14px\\]"),
    /border-radius:\s*14px/
  );

  assert.equal(css.includes(".text-error"), false);
  assert.equal(css.includes(".dark\\:text-error-dark"), false);
});
