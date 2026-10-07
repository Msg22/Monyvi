/**
 * Focused semantic diagnostics for the owned issue255 test/helper only,
 * using the existing mobile tsconfig options. Dependency diagnostics are
 * reported as separate counts (no production fixes).
 */
const path = require("path");

function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const ts = require(path.join(root, "node_modules", "typescript"));
  const configPath = path.join(root, "apps", "mobile", "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    console.log(JSON.stringify({ ok: false, step: "read-tsconfig" }));
    process.exit(2);
  }
  const owned = [
    path.join(
      root,
      "apps",
      "mobile",
      "__tests__",
      "services",
      "sync-pull-cap.local.integration.test.ts"
    ),
    path.join(
      root,
      "apps",
      "mobile",
      "__tests__",
      "services",
      "issue255-sync-reproduction",
      "manifests.ts"
    ),
  ];
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.join(root, "apps", "mobile")
  );
  const program = ts.createProgram({
    rootNames: owned,
    options: {
      ...parsed.options,
      noEmit: true,
      composite: false,
      incremental: false,
    },
  });
  const ownedSet = new Set(owned.map((f) => path.normalize(f)));
  const ownedDiags = [];
  const depCounts = {};
  for (const file of program.getSourceFiles()) {
    const name = path.normalize(file.fileName);
    if (name.endsWith(".d.ts") || file.fileName.includes("node_modules"))
      continue;
    const diags = [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ];
    for (const d of diags) {
      const msg = ts
        .flattenDiagnosticMessageText(d.messageText, " ")
        .slice(0, 160);
      const pos =
        d.file && typeof d.start === "number"
          ? d.file.getLineAndCharacterOfPosition(d.start)
          : null;
      if (ownedSet.has(name)) {
        ownedDiags.push({
          file: path.relative(root, name),
          code: d.code,
          line: pos ? pos.line + 1 : null,
          message: msg,
        });
      } else {
        const key = `${path.relative(root, name)}:TS${d.code}`;
        depCounts[key] = (depCounts[key] || 0) + 1;
      }
    }
  }
  console.log(
    JSON.stringify({
      ok: ownedDiags.length === 0,
      ownedErrors: ownedDiags.slice(0, 20),
      ownedErrorCount: ownedDiags.length,
      depKeys: Object.keys(depCounts).length,
      depSample: Object.entries(depCounts).slice(0, 10),
    })
  );
}

main();
