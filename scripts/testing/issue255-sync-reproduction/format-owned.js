/** Format owned issue255 test/helper with repo Prettier config (no other files). */
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..", "..", "..");
  const prettier = require(path.join(root, "node_modules", "prettier"));
  const files = [
    "apps/mobile/__tests__/services/sync-pull-cap.local.integration.test.ts",
    "apps/mobile/__tests__/services/issue255-sync-reproduction/manifests.ts",
  ];
  for (const rel of files) {
    const abs = path.join(root, rel);
    const config = await prettier.resolveConfig(abs);
    const input = fs.readFileSync(abs, "utf8");
    const output = await prettier.format(input, { ...config, filepath: abs });
    if (output !== input) {
      fs.writeFileSync(abs, output);
      console.log(JSON.stringify({ formatted: rel }));
    } else {
      console.log(JSON.stringify({ unchanged: rel }));
    }
  }
}

main().catch((error) => {
  console.error(String(error).slice(0, 300));
  process.exit(1);
});
