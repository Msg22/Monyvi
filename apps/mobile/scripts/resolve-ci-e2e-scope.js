const { appendFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const orderedSuites = [
  "accounts",
  "transactions",
  "recurring-payments",
  "budgets",
  "sms-sync",
  "live-sms",
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isDocsOnlyFile(filePath) {
  return (
    filePath === "AGENTS.md" ||
    filePath === "README.md" ||
    filePath === "apps/mobile/README.md" ||
    filePath.startsWith("docs/") ||
    filePath.endsWith(".md")
  );
}

function getSuiteForMaestroFlow(filePath) {
  const match = filePath.match(/^apps\/mobile\/e2e\/maestro\/([^/]+)\//);
  if (!match) return null;

  const suite = match[1];
  return orderedSuites.includes(suite) ? suite : null;
}

function isFullE2eMobileHarnessFile(filePath) {
  return (
    filePath === "apps/mobile/scripts/run-ci-e2e.js" ||
    filePath === "apps/mobile/scripts/run-maestro.js" ||
    filePath === "apps/mobile/scripts/e2e-preflight.js" ||
    filePath === "apps/mobile/scripts/e2e-seed.js" ||
    filePath === "apps/mobile/scripts/e2e-timing.js" ||
    filePath === "apps/mobile/scripts/e2e-auth-deeplink.js" ||
    filePath === "apps/mobile/scripts/run-android-e2e-ci.sh" ||
    filePath === "apps/mobile/e2e/maestro/config.yaml" ||
    filePath.startsWith("apps/mobile/e2e/maestro/helpers/")
  );
}

function isFullE2eAppRuntimeFile(filePath) {
  return (
    /^apps\/mobile\/app\/(?:_layout|index)\.tsx$/.test(filePath) ||
    /^apps\/mobile\/app\/.*\/(?:_layout|index)\.tsx$/.test(filePath) ||
    filePath.startsWith("apps/mobile/providers/") ||
    /AuthContext|Session|PrivateRuntime|Startup|Onboarding/i.test(filePath)
  );
}

function requiresFullE2e(filePath) {
  if (filePath === "apps/mobile/scripts/resolve-ci-e2e-scope.js") {
    return false;
  }

  if (getSuiteForMaestroFlow(filePath)) {
    return false;
  }

  if (filePath === ".github/workflows/ci.yml") {
    return true;
  }

  if (
    filePath.startsWith("scripts/") &&
    filePath !== "scripts/link-worktree-node-modules.ps1"
  ) {
    return true;
  }

  return (
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "apps/mobile/package.json" ||
    isFullE2eMobileHarnessFile(filePath) ||
    isFullE2eAppRuntimeFile(filePath) ||
    filePath.startsWith("apps/mobile/config/e2e") ||
    filePath.startsWith("packages/db/") ||
    filePath.startsWith("packages/logic/") ||
    filePath.startsWith("supabase/")
  );
}

function getSuitesForFile(filePath) {
  const normalized = normalizePath(filePath);

  if (requiresFullE2e(normalized)) {
    return orderedSuites;
  }

  const suites = [];
  const isScopeResolverFile =
    normalized === "apps/mobile/scripts/resolve-ci-e2e-scope.js";
  const isBarrelIndexFile =
    /\/index\.(ts|tsx|js|jsx)$/.test(normalized) &&
    !normalized.startsWith("apps/mobile/app/");
  const isTestFile =
    normalized.includes("/__tests__/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.tsx");
  const isSharedSmsParserPath =
    /ai-sms|sms-fixture|sms-hash|sms-keyword|egyptian-bank/i.test(normalized);
  const isSharedAccountServicePath =
    normalized === "apps/mobile/services/account-service.ts";
  const isPendingAccountServicePath =
    normalized === "apps/mobile/services/pending-account-service.ts";
  const isTransactionsLocaleFile =
    /locales\/(?:ar|en)\/transactions\.json/i.test(normalized);
  const isBudgetPath = /budget/i.test(normalized);
  const maestroSuite = getSuiteForMaestroFlow(normalized);
  if (maestroSuite) {
    suites.push(maestroSuite);
  }

  if (
    isSharedSmsParserPath ||
    /live-sms|sms-live|notification-service|SmsPermission|useSmsPermission/i.test(
      normalized
    )
  ) {
    suites.push("live-sms");
  }

  if (
    isSharedSmsParserPath ||
    isSharedAccountServicePath ||
    isPendingAccountServicePath ||
    /sms-sync|sms-reader|sms-review/i.test(normalized)
  ) {
    suites.push("sms-sync");
  }

  const isAccountManagementPath =
    isSharedAccountServicePath ||
    /add-account|edit-account|account-form|institution|useCreateAccount|useUpdateAccount|edit-account-service/i.test(
      normalized
    );
  if (isAccountManagementPath) {
    suites.push("accounts");
    suites.push("transactions");
  }

  if (/locales\/(?:ar|en)\/accounts\.json/i.test(normalized)) {
    suites.push("accounts");
  }

  if (/locales\/(?:ar|en)\/common\.json/i.test(normalized)) {
    suites.push(...orderedSuites);
  }

  if (/locales\/(?:ar|en)\/(?:auth|onboarding)\.json/i.test(normalized)) {
    suites.push(...orderedSuites);
  }

  if (/locales\/(?:ar|en)\/settings\.json/i.test(normalized)) {
    suites.push("sms-sync", "live-sms");
  }

  if (isTransactionsLocaleFile) {
    suites.push("transactions", "recurring-payments", "sms-sync");
  }

  if (isBudgetPath) {
    suites.push("budgets");
  }

  if (
    /recurring-payment|recurringPayment|recurring-payments|AccountSelectorModal|CategorySelectorModal|ConfirmationModal|FrequencyPickerModal|useFormScroll/i.test(
      normalized
    )
  ) {
    suites.push("recurring-payments");
  }

  if (
    !isTransactionsLocaleFile &&
    /transaction|category|transfer|AccountSelectorModal|ConfirmationModal|useFormScroll/i.test(
      normalized
    )
  ) {
    suites.push("transactions");
  }

  return suites;
}

function resolveCiE2eScope(files) {
  const normalizedFiles = files.map(normalizePath).filter(Boolean);
  if (normalizedFiles.length === 0) {
    return { shouldRun: true, suites: orderedSuites };
  }

  const nonDocsFiles = normalizedFiles.filter(
    (filePath) => !isDocsOnlyFile(filePath)
  );
  if (nonDocsFiles.length === 0) {
    return { shouldRun: false, suites: [] };
  }

  const selectedSuites = new Set();
  for (const filePath of nonDocsFiles) {
    for (const suite of getSuitesForFile(filePath)) {
      selectedSuites.add(suite);
    }
  }

  return {
    shouldRun: selectedSuites.size > 0,
    suites: orderedSuites.filter((suite) => selectedSuites.has(suite)),
  };
}

function buildCiE2eMatrix(suites) {
  return {
    suite: suites.length > 0 ? [...suites] : ["skip"],
  };
}

function isUsableCommitSha(value) {
  return Boolean(value) && !/^0+$/.test(value);
}

function getGitDiffArgs(env = process.env) {
  const baseRef = env.GITHUB_BASE_REF;
  if (baseRef) {
    return ["diff", "--name-only", `origin/${baseRef}...HEAD`];
  }

  const pushBeforeSha = env.E2E_PUSH_BEFORE_SHA || env.GITHUB_EVENT_BEFORE;
  if (env.GITHUB_EVENT_NAME === "push" && isUsableCommitSha(pushBeforeSha)) {
    return ["diff", "--name-only", `${pushBeforeSha}...HEAD`];
  }

  return ["diff", "--name-only", "HEAD~1", "HEAD"];
}

function getChangedFilesFromGit() {
  if (process.env.E2E_CHANGED_FILES) {
    return process.env.E2E_CHANGED_FILES.split(/\r?\n|,/)
      .map((filePath) => filePath.trim())
      .filter(Boolean);
  }

  const args = process.argv.slice(2).filter(Boolean);
  if (args.length > 0) {
    return args;
  }

  const diffArgs = getGitDiffArgs();
  const result = spawnSync("git", diffArgs, {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr || "Unable to resolve changed files for E2E scope."
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

function appendGitHubEnv(name, value) {
  if (!process.env.GITHUB_ENV) return;
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

function appendGitHubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function main() {
  const files = getChangedFilesFromGit();
  const scope = resolveCiE2eScope(files);
  const suitesValue = scope.shouldRun ? scope.suites.join(",") : "skip";
  const matrixValue = JSON.stringify(buildCiE2eMatrix(scope.suites));

  appendGitHubEnv("E2E_CI_SUITES", suitesValue);
  appendGitHubOutput("should_run", scope.shouldRun ? "true" : "false");
  appendGitHubOutput("suites", suitesValue);
  appendGitHubOutput("matrix", matrixValue);

  console.log(`Android E2E suites: ${suitesValue}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  buildCiE2eMatrix,
  getGitDiffArgs,
  resolveCiE2eScope,
};
