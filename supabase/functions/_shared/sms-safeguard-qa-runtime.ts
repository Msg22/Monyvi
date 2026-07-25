const SAFEGUARD_QA_PROFILE_IDS = new Set([
  "cutoff-boundary-v1",
  "checkpoint-overlap-v1",
  "partial-quota-v1",
  "rolling-expiry-v1",
  "shared-batch-live-v1",
  "burst-limit-v1",
  "history-cooldown-v1",
  "oversized-candidate-v1",
  "response-validity-v1",
  "negative-three-strikes-v1",
  "terminal-fresh-install-v1",
  "trusted-local-recovery-v1",
  "account-switch-v1",
  "consent-required-v1",
  "prompt-token-baseline-v1",
]);

const LOCAL_SUPABASE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "kong",
  "host.docker.internal",
]);

export interface SafeguardQaRuntimeEnvironment {
  readonly isEnabled: string | undefined;
  readonly supabaseUrl: string | undefined;
}

export interface SafeguardQaRequestMetadata {
  readonly profileId: string;
  readonly runId: string;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`SMS safeguard QA ${label} is required.`);
  }
  return value.trim();
}

export function assertLocalSafeguardQaRuntime(
  environment: SafeguardQaRuntimeEnvironment
): void {
  if (environment.isEnabled !== "true") {
    throw new Error("SMS safeguard QA server runtime is disabled.");
  }
  const rawUrl = readNonEmptyString(environment.supabaseUrl, "Supabase URL");
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error("SMS safeguard QA requires a valid local Supabase URL.");
  }
  if (!LOCAL_SUPABASE_HOSTS.has(hostname)) {
    throw new Error("SMS safeguard QA is restricted to local Supabase.");
  }
}

export function parseSafeguardQaRequestMetadata(
  request: Request,
  body: Readonly<Record<string, unknown>>
): SafeguardQaRequestMetadata {
  const profileId = readNonEmptyString(body.qaProfileId, "profile");
  if (!SAFEGUARD_QA_PROFILE_IDS.has(profileId)) {
    throw new Error("SMS safeguard QA profile is not recognized.");
  }
  const runId = readNonEmptyString(body.qaRunId, "run identity");
  const headerRunId = readNonEmptyString(
    request.headers.get("x-sms-safeguard-qa-run-id"),
    "run identity"
  );
  if (headerRunId !== runId) {
    throw new Error("SMS safeguard QA run identity does not match.");
  }
  return { profileId, runId };
}
