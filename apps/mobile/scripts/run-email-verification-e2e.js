const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { getE2eSeedConfig } = require("./e2e-seed");

const mobileRoot = join(__dirname, "..");
const defaultMailpitBaseUrl = "http://127.0.0.1:54324";
const defaultEmailTimeoutMs = 30_000;
const defaultPollIntervalMs = 500;

function buildVerificationEmail(baseEmail, suffix = "local") {
  const atIndex = baseEmail.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === baseEmail.length - 1) {
    throw new Error("A valid base E2E email is required.");
  }

  const localPart = baseEmail.slice(0, atIndex);
  const domain = baseEmail.slice(atIndex + 1);
  const safeSuffix =
    String(suffix)
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-") || "local";

  return `verification-${safeSuffix}-${localPart}@${domain}`;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function getMailpitLatestMessageUrl(mailpitBaseUrl, email) {
  const url = new URL("/view/latest.html", ensureTrailingSlash(mailpitBaseUrl));
  url.searchParams.set("query", `to:${email}`);
  return url.toString();
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractVerificationCode(html) {
  const attributeMatch = html.match(
    /data-verification-code\s*=\s*["'](\d{6})["']/i
  );
  if (attributeMatch?.[1]) {
    return attributeMatch[1];
  }

  const visibleMatch = decodeHtmlAttribute(html).match(/>\s*(\d{6})\s*</);
  return visibleMatch?.[1] ?? null;
}

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVerificationCode(
  email,
  env = process.env,
  fetchImpl = fetch
) {
  const mailpitBaseUrl = env.E2E_MAILPIT_URL ?? defaultMailpitBaseUrl;
  const timeoutMs = getPositiveInteger(
    env.E2E_VERIFICATION_EMAIL_TIMEOUT_MS,
    defaultEmailTimeoutMs
  );
  const pollIntervalMs = getPositiveInteger(
    env.E2E_VERIFICATION_EMAIL_POLL_MS,
    defaultPollIntervalMs
  );
  const latestMessageUrl = getMailpitLatestMessageUrl(mailpitBaseUrl, email);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(latestMessageUrl);
      if (response.ok) {
        const html = await response.text();
        const code = extractVerificationCode(html);
        if (code) {
          return code;
        }
      }
    } catch {
      // Mailpit may still be starting or the message may not exist yet.
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for a local verification code for ${email}.`
  );
}

function runMaestroFlow(flow, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    ["scripts/run-maestro.js", "test", join("e2e", "maestro", flow)],
    {
      cwd: mobileRoot,
      env: { ...process.env, ...extraEnv },
      shell: false,
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Maestro email verification flow failed: ${flow}`);
  }
}

function getVerificationCredentials(env = process.env) {
  const config = getE2eSeedConfig({
    ...env,
    E2E_SUPABASE_MODE: "local",
  });
  const baseEmail = env.MAESTRO_E2E_EMAIL ?? config.email;
  const password =
    env.MAESTRO_E2E_VERIFICATION_PASSWORD ??
    env.MAESTRO_E2E_PASSWORD ??
    config.password;
  const generatedSuffix = [env.GITHUB_RUN_ID, Date.now().toString(36)]
    .filter(Boolean)
    .join("-");
  const email =
    env.MAESTRO_E2E_VERIFICATION_EMAIL ??
    buildVerificationEmail(
      baseEmail,
      env.MAESTRO_E2E_VERIFICATION_SUFFIX ?? generatedSuffix
    );

  return { email, password };
}

async function main() {
  if ((process.env.E2E_SUPABASE_MODE ?? "local") !== "local") {
    throw new Error(
      "Email verification E2E is supported only with local Supabase."
    );
  }

  const { email, password } = getVerificationCredentials();
  const sharedEnv = {
    E2E_SUPABASE_MODE: "local",
    EXPO_PUBLIC_MONYVI_TEST_MODE:
      process.env.EXPO_PUBLIC_MONYVI_TEST_MODE ?? "e2e",
    EXPO_PUBLIC_AI_SMS_PARSER_MODE:
      process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE ?? "fixture",
    MAESTRO_E2E_VERIFICATION_EMAIL: email,
    MAESTRO_E2E_VERIFICATION_PASSWORD: password,
  };

  runMaestroFlow("auth/email-verification-pending.yaml", {
    ...sharedEnv,
    E2E_CLEAR_APP_STATE: "1",
  });

  const verificationCode = await waitForVerificationCode(email);

  runMaestroFlow("auth/email-verification-confirm.yaml", {
    ...sharedEnv,
    E2E_CLEAR_APP_STATE: "0",
    MAESTRO_E2E_VERIFICATION_CODE: verificationCode,
  });

  runMaestroFlow("auth/email-verification-invalid.yaml", {
    ...sharedEnv,
    E2E_CLEAR_APP_STATE: "1",
    MAESTRO_E2E_INVALID_CALLBACK:
      "monyvi://auth-callback?error=access_denied&error_description=invalid_or_expired",
  });

  console.log("Local email verification E2E completed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildVerificationEmail,
  extractVerificationCode,
  getMailpitLatestMessageUrl,
  waitForVerificationCode,
};
