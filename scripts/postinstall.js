/**
 * postinstall script: Apply patches to node_modules
 *
 * This script fixes known bugs in dependencies that don't have patched
 * versions available for our current Expo SDK version.
 *
 * Patches applied:
 * - react-native-get-sms-android 2.1.0: make its Android Gradle project
 *   compatible with Android Gradle Plugin 8 / React Native 0.83.
 * - @supabase/supabase-js 2.106.0: remove an optional OpenTelemetry dynamic
 *   import that Hermes cannot parse in React Native release bundles.
 */

const fs = require("fs");
const path = require("path");

/**
 * @typedef {Object} PatchEntry
 * @property {string} packageName      - npm package name for version check
 * @property {string} expectedVersion  - exact version this patch targets
 * @property {string} file             - absolute path to the file to patch
 * @property {string} search           - exact string to find
 * @property {string} replace          - replacement string
 * @property {string} description      - human-readable description
 */

/** @type {PatchEntry[]} */
const patches = [
  {
    packageName: "@supabase/supabase-js",
    expectedVersion: "2.106.0",
    file: path.join(
      __dirname,
      "..",
      "node_modules",
      "@supabase",
      "supabase-js",
      "dist",
      "index.mjs"
    ),
    search: `function loadOtel() {
\tif (otelModulePromise === null) otelModulePromise = import(
\t\t/* webpackIgnore: true */
\t\t/* @vite-ignore */
\t\tOTEL_PKG
).catch(() => null);
\treturn otelModulePromise;
}`,
    replace: `function loadOtel() {
\tif (otelModulePromise === null) otelModulePromise = Promise.resolve(null);
\treturn otelModulePromise;
}`,
    description:
      "@supabase/supabase-js: disable optional OpenTelemetry dynamic import in ESM bundle",
  },
  {
    packageName: "@supabase/supabase-js",
    expectedVersion: "2.106.0",
    file: path.join(
      __dirname,
      "..",
      "node_modules",
      "@supabase",
      "supabase-js",
      "dist",
      "index.cjs"
    ),
    search: `function loadOtel() {
\tif (otelModulePromise === null) otelModulePromise = import(
\t\t/* webpackIgnore: true */
\t\t/* @vite-ignore */
\t\tOTEL_PKG
).catch(() => null);
\treturn otelModulePromise;
}`,
    replace: `function loadOtel() {
\tif (otelModulePromise === null) otelModulePromise = Promise.resolve(null);
\treturn otelModulePromise;
}`,
    description:
      "@supabase/supabase-js: disable optional OpenTelemetry dynamic import in CJS bundle",
  },
];

/**
 * Reads the installed version of a package from its package.json.
 * Returns null if the package is not installed.
 *
 * @param {string} packageName - npm package name
 * @returns {string | null}
 */
function getInstalledVersion(packageName) {
  const pkgJsonPath = path.join(
    __dirname,
    "..",
    "node_modules",
    packageName,
    "package.json"
  );
  if (!fs.existsSync(pkgJsonPath)) return null;
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  return pkgJson.version ?? null;
}

let applied = 0;
let skipped = 0;

function patchReactNativeGetSmsAndroid() {
  const packageName = "react-native-get-sms-android";
  const expectedVersion = "2.1.0";
  const file = path.join(
    __dirname,
    "..",
    "node_modules",
    packageName,
    "android",
    "build.gradle"
  );
  const description =
    "react-native-get-sms-android: align Gradle project for AGP 8 / RN 0.83";

  const installedVersion = getInstalledVersion(packageName);
  if (installedVersion !== expectedVersion) {
    console.warn(
      `[postinstall] SKIP: ${packageName}@${installedVersion ?? "not installed"} ` +
        `does not match expected ${expectedVersion}. ` +
        `Patch may no longer be needed: ${description}`
    );
    skipped++;
    return;
  }

  if (!fs.existsSync(file)) {
    throw new Error(
      `[postinstall] FAIL: File not found: ${file} ` +
        `(expected for ${packageName}@${expectedVersion}). ` +
        `Patch: ${description}`
    );
  }

  const original = fs.readFileSync(file, "utf8");
  let patched = original.replace(/^(\s*)jcenter\(\)\s*$/gm, "$1mavenCentral()");

  if (!patched.includes('namespace "com.react"')) {
    const namespaceSearch = `android {
    compileSdkVersion safeExtGet('compileSdkVersion', 28)`;
    const namespaceReplace = `android {
    namespace "com.react"
    compileSdkVersion safeExtGet('compileSdkVersion', 28)`;

    if (!patched.includes(namespaceSearch)) {
      throw new Error(
        `[postinstall] FAIL: Could not locate android block in ` +
          `${path.basename(file)}. Package version matches (${expectedVersion}) ` +
          `but file content does not. Patch: ${description}`
      );
    }

    patched = patched.replace(namespaceSearch, namespaceReplace);
  }

  const desiredDependency = `    compileOnly "com.facebook.react:react-android"`;
  if (!patched.includes(desiredDependency)) {
    const dependencyPatterns = [
      `    compileOnly "com.facebook.react:react-native:\${safeExtGet('reactNativeVersion', '+')}"`,
      `    compile "com.facebook.react:react-native:+"`,
      `    implementation "com.facebook.react:react-native:+"`,
    ];
    const matchedPattern = dependencyPatterns.find((pattern) =>
      patched.includes(pattern)
    );

    if (!matchedPattern) {
      throw new Error(
        `[postinstall] FAIL: Could not locate legacy React Native dependency in ` +
          `${path.basename(file)}. Package version matches (${expectedVersion}) ` +
          `but file content does not. Patch: ${description}`
      );
    }

    patched = patched.replace(matchedPattern, desiredDependency);
  }

  if (patched.includes("jcenter()")) {
    throw new Error(
      `[postinstall] FAIL: jcenter() remains in ${path.basename(file)}. ` +
        `Patch: ${description}`
    );
  }

  if (!patched.includes('namespace "com.react"')) {
    throw new Error(
      `[postinstall] FAIL: Android namespace was not added to ` +
        `${path.basename(file)}. Patch: ${description}`
    );
  }

  if (!patched.includes(desiredDependency)) {
    throw new Error(
      `[postinstall] FAIL: React Android dependency was not added to ` +
        `${path.basename(file)}. Patch: ${description}`
    );
  }

  if (patched.includes("com.facebook.react:react-native")) {
    throw new Error(
      `[postinstall] FAIL: Legacy React Native dependency remains in ` +
        `${path.basename(file)}. Patch: ${description}`
    );
  }

  if (patched === original) {
    skipped++;
    return;
  }

  fs.writeFileSync(file, patched, "utf8");
  console.log(`[postinstall] APPLIED: ${description}`);
  applied++;
}

patchReactNativeGetSmsAndroid();

for (const patch of patches) {
  // 1. Version gate: only patch the exact version we've verified against
  const installedVersion = getInstalledVersion(patch.packageName);
  if (installedVersion !== patch.expectedVersion) {
    console.warn(
      `[postinstall] SKIP: ${patch.packageName}@${installedVersion ?? "not installed"} ` +
        `does not match expected ${patch.expectedVersion}. ` +
        `Patch may no longer be needed: ${patch.description}`
    );
    skipped++;
    continue;
  }

  // 2. File existence check
  if (!fs.existsSync(patch.file)) {
    throw new Error(
      `[postinstall] FAIL: File not found: ${patch.file} ` +
        `(expected for ${patch.packageName}@${patch.expectedVersion}). ` +
        `Patch: ${patch.description}`
    );
  }

  const content = fs.readFileSync(patch.file, "utf8");

  // 3. Already patched — idempotent
  if (content.includes(patch.replace) && !content.includes(patch.search)) {
    skipped++;
    continue;
  }

  // 4. Verify the search string exists
  if (!content.includes(patch.search)) {
    throw new Error(
      `[postinstall] FAIL: Search string "${patch.search}" not found in ` +
        `${path.basename(patch.file)}. Package version matches (${patch.expectedVersion}) ` +
        `but file content does not. Patch: ${patch.description}`
    );
  }

  // 5. Verify exactly one occurrence of the search string
  const occurrences = content.split(patch.search).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `[postinstall] FAIL: Expected exactly 1 occurrence of "${patch.search}" in ` +
        `${path.basename(patch.file)}, found ${occurrences}. ` +
        `Cannot safely patch. Patch: ${patch.description}`
    );
  }

  // 6. Apply the patch
  const patched = content.replace(patch.search, patch.replace);

  // 7. Verify the replacement was made
  if (!patched.includes(patch.replace)) {
    throw new Error(
      `[postinstall] FAIL: Replacement verification failed for ` +
        `${path.basename(patch.file)}. Patch: ${patch.description}`
    );
  }

  fs.writeFileSync(patch.file, patched, "utf8");
  console.log(`[postinstall] APPLIED: ${patch.description}`);
  applied++;
}

// Required SDK patch: refuse absent, unknown or mixed WatermelonDB content.
// The patcher preflights every pinned file and is idempotent after a complete
// known postimage. Its failure must terminate postinstall (never silently skip).
const {
  patchWatermelonSyncHooks,
} = require("./patch-watermelon-sync-hooks.cjs");
const watermelonSyncHooks = patchWatermelonSyncHooks();
console.log(
  "[postinstall] WatermelonDB sync writer guards: " + watermelonSyncHooks.status
);

console.log(
  `[postinstall] Done. ${applied} patch(es) applied, ${skipped} skipped.`
);
