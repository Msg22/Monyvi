"use strict";

const { join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
const {
  version: AI_PROCESSING_CONSENT_VERSION,
} = require("../config/ai-processing-consent.json");
const {
  QA_PROVIDER_OUTCOME_MATRIX,
  buildQaRequestKeyResetFilter: buildQaRequestKeyResetFilterForProfiles,
  buildServerSafeguardDiagnostics,
  computeQaFingerprint,
  createProviderOutcomeMessages,
} = require("./sms-safeguard-qa-support.js");

const mobileRoot = resolve(__dirname, "..");
const startScript = join(__dirname, "start-mobile-local-supabase.js");
const runnerPath = join(
  mobileRoot,
  "services",
  "testing",
  "sms-safeguard-qa-runner.ts"
);

function buildSafeguardQaEnvironment(
  baseEnvironment = process.env,
  profileId = null
) {
  const qaRunId =
    baseEnvironment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID ??
    (profileId === null
      ? `sms-safeguard-suite-${Date.now()}`
      : `${profileId}-${Date.now()}`);
  return {
    ...baseEnvironment,
    EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
    EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
    EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
    EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: qaRunId,
    SMS_SAFEGUARD_QA_ENABLED: "true",
    ...(profileId === null
      ? {}
      : {
          EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: profileId,
        }),
    EXPO_PUBLIC_AI_SMS_PARSER_MODE: "edge",
    EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
  };
}

function resolveSafeguardQaProfileArgument(args, options = {}) {
  const profileIndex = args.indexOf("--scenario");
  const profileId = profileIndex >= 0 ? args[profileIndex + 1] : null;
  if (profileId === undefined || profileId?.startsWith("--")) {
    throw new Error("--scenario requires a named versioned profile.");
  }
  if (options.required === true && profileId === null) {
    throw new Error(
      "App-facing safeguard QA requires --scenario <profile-id>."
    );
  }
  return profileId;
}

const SERVER_PROFILE_IDS = new Set([
  "partial-quota-v1",
  "rolling-expiry-v1",
  "shared-batch-live-v1",
  "burst-limit-v1",
  "history-cooldown-v1",
  "oversized-candidate-v1",
  "response-validity-v1",
  "negative-three-strikes-v1",
  "terminal-fresh-install-v1",
  "account-switch-v1",
  "consent-required-v1",
]);

const ALL_PROFILE_IDS = Object.freeze([
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

function assertKnownSafeguardQaProfile(profileId) {
  if (!ALL_PROFILE_IDS.includes(profileId)) {
    throw new Error(`Unknown safeguard QA profile: ${profileId}`);
  }
}

const QA_EDGE_START_TIMEOUT_MS = 30_000;
const QA_EDGE_POLL_INTERVAL_MS = 500;
let cachedLocalSupabaseRuntime = null;

function createQaSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function parseSupabaseStatus(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((values, line) => {
      const separator = line.indexOf("=");
      if (separator < 0) return values;
      return {
        ...values,
        [line.slice(0, separator)]: line
          .slice(separator + 1)
          .replace(/^"|"$/g, ""),
      };
    }, {});
}

function getLocalSupabaseRuntime() {
  if (cachedLocalSupabaseRuntime !== null) {
    return cachedLocalSupabaseRuntime;
  }
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["supabase", "status", "-o", "env"],
    {
      cwd: resolve(mobileRoot, "..", ".."),
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 30_000,
    }
  );
  if (result.status !== 0) {
    throw new Error("Local Supabase must be running for safeguard QA.");
  }
  const values = parseSupabaseStatus(result.stdout);
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error(
      "Local Supabase did not expose the required QA credentials."
    );
  }
  cachedLocalSupabaseRuntime = values;
  return cachedLocalSupabaseRuntime;
}

async function getQaClients(environment) {
  const runtime = getLocalSupabaseRuntime();
  const authenticated = createQaSupabaseClient(
    runtime.API_URL,
    runtime.ANON_KEY
  );
  const service = createQaSupabaseClient(
    runtime.API_URL,
    runtime.SERVICE_ROLE_KEY
  );
  const data = await signInQaUser(authenticated, environment);
  if (!data.user) {
    throw new Error(
      "The local manual QA user is unavailable. Run npm run local:reset-and-seed first."
    );
  }
  return { authenticated, service, userId: data.user.id, runtime };
}

async function signInQaUser(client, environment) {
  const email = environment.MANUAL_QA_EMAIL ?? "manual-qa@monyvi.test";
  const password = environment.MANUAL_QA_PASSWORD ?? "123456";
  const deadline = Date.now() + QA_EDGE_START_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await client.auth.signInWithPassword({ email, password });
      if (!result.error && result.data.user) return result.data;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, QA_EDGE_POLL_INTERVAL_MS)
    );
  }
  throw new Error(
    `The local manual QA user is unavailable: ${
      lastError instanceof Error ? lastError.message : "authentication failed"
    }`
  );
}

async function waitForLocalApi(runtime) {
  const deadline = Date.now() + QA_EDGE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${runtime.API_URL}/auth/v1/health`, {
        headers: { apikey: runtime.ANON_KEY },
      });
      if (response.ok) return;
    } catch {
      // The local gateway briefly closes while functions serve restarts Edge.
    }
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, QA_EDGE_POLL_INTERVAL_MS)
    );
  }
  throw new Error("Local Supabase API did not become ready.");
}

function buildQaRequestKeyResetFilter() {
  return buildQaRequestKeyResetFilterForProfiles(ALL_PROFILE_IDS);
}

async function resetServerSafeguardState(service, userId, messages) {
  const { error: scanSessionError } = await service
    .from("sms_ai_scan_sessions")
    .delete()
    .eq("user_id", userId);
  if (scanSessionError) {
    throw new Error("Could not reset namespaced QA scan sessions.");
  }

  const { data: work, error: readError } = await service
    .from("sms_ai_work_requests")
    .select("id")
    .eq("user_id", userId)
    .or(buildQaRequestKeyResetFilter());
  if (readError) throw new Error("Could not read namespaced QA work state.");
  const requestIds = (work ?? []).map(({ id }) => id);
  if (requestIds.length > 0) {
    const { error: usageError } = await service
      .from("sms_ai_usage_events")
      .delete()
      .eq("user_id", userId)
      .in("request_id", requestIds);
    if (usageError) throw new Error("Could not reset namespaced QA usage.");
    const { error: workError } = await service
      .from("sms_ai_work_requests")
      .delete()
      .eq("user_id", userId)
      .in("id", requestIds);
    if (workError) throw new Error("Could not reset namespaced QA requests.");
  }

  const fingerprints = messages.map(computeQaFingerprint);
  if (fingerprints.length > 0) {
    const { error: outcomeError } = await service
      .from("sms_ai_negative_outcomes")
      .delete()
      .eq("user_id", userId)
      .in("sms_fingerprint", fingerprints);
    if (outcomeError)
      throw new Error("Could not reset namespaced QA outcomes.");
  }
}

function buildQaRequestBody(
  profileId,
  runId,
  messages,
  scanKind,
  scanSessionId,
  providerOutcome,
  scanStartedAtMs
) {
  return {
    qaProfileId: profileId,
    qaRunId: runId,
    requestKey: `${runId}:${randomUUID()}`,
    scanSessionId,
    scanKind,
    scanStartedAt: new Date(scanStartedAtMs ?? Date.now()).toISOString(),
    messages: messages.map((message) => ({
      id: message.id,
      body: message.body,
      sender: message.address,
      date: new Date(message.date).toISOString(),
      smsFingerprint: computeQaFingerprint(message),
    })),
    categories: "L1: other",
    supportedCurrencies: ["EGP", "USD"],
    ...(providerOutcome ? { qaProviderOutcome: providerOutcome } : {}),
  };
}

async function invokeQaChunk(
  client,
  profileId,
  runId,
  messages,
  scanKind,
  session,
  providerOutcome,
  scanStartedAtMs
) {
  const response = await client.functions.invoke("sms-safeguard-qa", {
    body: buildQaRequestBody(
      profileId,
      runId,
      messages,
      scanKind,
      session,
      providerOutcome,
      scanStartedAtMs
    ),
    headers: { "x-sms-safeguard-qa-run-id": runId },
  });
  const errorContext = response.error?.context;
  const status =
    errorContext instanceof Response
      ? errorContext.status
      : typeof errorContext?.status === "number"
        ? errorContext.status
        : response.error
          ? 500
          : 200;
  return {
    status,
    data: response.data ?? null,
    providerOutcome: providerOutcome ?? null,
  };
}

async function invokeQaCategoryChunk(client, profileId, runId, chunkIndex) {
  const response = await client.functions.invoke("sms-safeguard-qa", {
    body: {
      qaCapability: "category_enrichment",
      qaProfileId: profileId,
      qaRunId: runId,
      requestKey: `${runId}:category:${chunkIndex}:${randomUUID()}`,
      scanSessionId: `${runId}:category-session`,
      scanKind: "initial",
      merchants: [1, 2].map((value) => ({
        id: `merchant-${chunkIndex * 2 + value}`,
        merchant: `QA merchant ${chunkIndex * 2 + value}`,
        transactionType: "EXPENSE",
        messageFamily: "card_purchase",
      })),
    },
    headers: { "x-sms-safeguard-qa-run-id": runId },
  });
  const status =
    response.error?.context?.status ?? (response.error ? 500 : 200);
  return { status, data: response.data ?? null };
}

function isQaEdgeReadyResponse(status) {
  return status !== 404 && status !== 503;
}

async function waitForQaEdgeRuntime(client, profileId, runId) {
  const deadline = Date.now() + QA_EDGE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await invokeQaChunk(
      client,
      profileId,
      runId,
      [
        {
          id: "qa-readiness",
          address: "QA",
          body: "QA readiness probe",
          date: Date.now(),
        },
      ],
      "initial",
      `${runId}:readiness`
    );
    if (isQaEdgeReadyResponse(response.status)) return;
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, QA_EDGE_POLL_INTERVAL_MS)
    );
  }
  throw new Error("Local SMS safeguard QA Edge Function did not become ready.");
}

function startQaFunctionsServe(environment) {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "supabase",
      "functions",
      "serve",
      "--env-file",
      "supabase/functions/sms-safeguard-qa.local.env",
    ],
    {
      cwd: resolve(mobileRoot, "..", ".."),
      env: environment,
      stdio: "ignore",
      shell: process.platform === "win32",
    }
  );
  return child;
}

function stopQaFunctionsServe(child) {
  if (child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill();
}

function getUnresolvedQaMessages(messages) {
  return messages.filter(
    (message) => !message.id.endsWith(":0") && !message.id.endsWith(":4")
  );
}

async function readServerSafeguardSnapshot(service, userId, runId, messages) {
  const workResult = await service
    .from("sms_ai_work_requests")
    .select(
      "id,request_key,capability,status,decision_code,unit_count,scan_kind,available_at"
    )
    .eq("user_id", userId)
    .like("request_key", `${runId}:%`);
  const requestIds = (workResult.data ?? []).map(({ id }) => id);
  const fingerprints = messages.map(computeQaFingerprint);
  const [usageResult, outcomeResult] = await Promise.all([
    requestIds.length > 0
      ? service
          .from("sms_ai_usage_events")
          .select("request_id,unit_count")
          .eq("user_id", userId)
          .in("request_id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    fingerprints.length > 0
      ? service
          .from("sms_ai_negative_outcomes")
          .select("strike_count,is_terminal,deleted")
          .eq("user_id", userId)
          .in("sms_fingerprint", fingerprints)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = workResult.error ?? usageResult.error ?? outcomeResult.error;
  if (error) throw new Error("Could not read local safeguard QA state.");
  return {
    work: workResult.data ?? [],
    usage: usageResult.data ?? [],
    outcomes: outcomeResult.data ?? [],
  };
}

function assertServerProfileResult(
  profileId,
  responses,
  snapshot,
  accountSwitchProof,
  categoryResponses
) {
  const acceptedCount = responses.filter(({ status }) => status === 200).length;
  const refusedCount = responses.length - acceptedCount;
  const providerStartedCount = snapshot.usage.length;
  const activeOutcomes = snapshot.outcomes.filter(({ deleted }) => !deleted);

  if (profileId === "partial-quota-v1" && refusedCount === 0) {
    throw new Error("Partial quota profile did not refuse excess work.");
  }
  if (
    ["shared-batch-live-v1", "burst-limit-v1", "history-cooldown-v1"].includes(
      profileId
    ) &&
    refusedCount === 0
  ) {
    throw new Error(`${profileId} did not exercise its server refusal.`);
  }
  if (profileId === "oversized-candidate-v1" && providerStartedCount !== 0) {
    throw new Error("Oversized work reached the simulated provider.");
  }
  if (
    profileId === "response-validity-v1" &&
    (!QA_PROVIDER_OUTCOME_MATRIX.every((outcome) =>
      responses.some(({ providerOutcome }) => providerOutcome === outcome)
    ) ||
      !snapshot.work.some(
        ({ status }) => status === "completed_with_provider_error"
      ))
  ) {
    throw new Error("The provider validity matrix was not fully exercised.");
  }
  if (
    profileId === "negative-three-strikes-v1" &&
    !activeOutcomes.some(
      ({ strike_count: strikes, is_terminal: isTerminal }) =>
        strikes === 3 && isTerminal
    )
  ) {
    throw new Error("Three valid AI-negative strikes did not become terminal.");
  }
  if (profileId === "terminal-fresh-install-v1" && providerStartedCount !== 0) {
    throw new Error("A synchronized terminal outcome reached the provider.");
  }
  if (profileId === "rolling-expiry-v1" && acceptedCount < 2) {
    throw new Error("Expired rolling usage did not restore capacity.");
  }
  if (profileId === "account-switch-v1" && !accountSwitchProof) {
    throw new Error("Account-scoped safeguard state was not isolated.");
  }
  if (
    profileId === "consent-required-v1" &&
    (responses.some(({ status }) => status !== 403) ||
      providerStartedCount !== 0 ||
      snapshot.work.length !== 0)
  ) {
    throw new Error(
      `Revoked consent profile failed: ${JSON.stringify({
        responseStatuses: responses.map(({ status }) => status),
        providerStartedCount,
        workCount: snapshot.work.length,
      })}`
    );
  }
  if (
    profileId === "partial-quota-v1" &&
    !categoryResponses.some(({ status }) => status === 429)
  ) {
    throw new Error(
      "Category enrichment did not exercise its server allowance."
    );
  }

  return { acceptedCount, refusedCount, providerStartedCount };
}

async function seedTerminalOutcome(service, userId, message) {
  const { error } = await service.from("sms_ai_negative_outcomes").insert({
    user_id: userId,
    sms_fingerprint: computeQaFingerprint(message),
    original_received_at: new Date(message.date).toISOString(),
    strike_count: 3,
    is_terminal: true,
    terminal_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not seed synchronized terminal QA state.");
}

async function expireRollingUsage(
  service,
  userId,
  rollingWindowMs,
  requestIds
) {
  const expiredAt = new Date(
    Date.now() - rollingWindowMs - 1_000
  ).toISOString();
  const { error } = await service
    .from("sms_ai_usage_events")
    .update({ started_at: expiredAt })
    .eq("user_id", userId)
    .in("request_id", requestIds);
  if (error) throw new Error("Could not age local rolling usage for QA.");
}

async function expireHistoryCooldown(
  service,
  userId,
  historyCooldownMs,
  runId
) {
  const expiredAt = new Date(
    Date.now() - historyCooldownMs - 1_000
  ).toISOString();
  const workResult = await service
    .from("sms_ai_work_requests")
    .select("id")
    .eq("user_id", userId)
    .like("request_key", `${runId}:%`)
    .eq("scan_kind", "history");
  if (workResult.error) {
    throw new Error("Could not read local history cooldown state for QA.");
  }
  const requestIds = (workResult.data ?? []).map(({ id }) => id);
  if (requestIds.length === 0) return;
  const [usageResult, workUpdateResult] = await Promise.all([
    service
      .from("sms_ai_usage_events")
      .update({ started_at: expiredAt })
      .eq("user_id", userId)
      .in("request_id", requestIds),
    service
      .from("sms_ai_work_requests")
      .update({ provider_started_at: expiredAt })
      .eq("user_id", userId)
      .in("id", requestIds),
  ]);
  if (usageResult.error || workUpdateResult.error) {
    throw new Error("Could not age local history cooldown for QA.");
  }
}

async function runAccountSwitchProof(input) {
  const email = `sms-safeguard-qa-${Date.now()}@monyvi.test`;
  const password = "123456";
  const { data, error } = await input.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error("Could not create an isolated local QA account.");
  }

  try {
    const consentedAt = new Date().toISOString();
    const { error: profileError } = await input.service.from("profiles").upsert(
      {
        user_id: data.user.id,
        ai_processing_consent: {
          version: AI_PROCESSING_CONSENT_VERSION,
          consentedAt,
          revokedAt: null,
        },
      },
      { onConflict: "user_id" }
    );
    if (profileError) {
      throw new Error(
        "Could not grant consent to the isolated local QA account."
      );
    }

    const secondaryClient = createQaSupabaseClient(
      input.runtime.API_URL,
      input.runtime.ANON_KEY
    );
    const signIn = await secondaryClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signIn.error)
      throw new Error("Could not authenticate local QA account.");
    const response = await invokeQaChunk(
      secondaryClient,
      input.profileId,
      input.runId,
      input.messages,
      "initial",
      `${input.runId}:secondary-user`
    );
    const snapshot = await readServerSafeguardSnapshot(
      input.service,
      data.user.id,
      input.runId,
      input.messages
    );
    return response.status === 200 && snapshot.usage.length > 0;
  } finally {
    await input.service.auth.admin.deleteUser(data.user.id);
  }
}

async function withQaConsentState(service, userId, profileId, execute) {
  if (profileId !== "consent-required-v1") {
    return execute();
  }

  const { data, error: readError } = await service
    .from("profiles")
    .select("ai_processing_consent")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError || !data) {
    throw new Error("Could not read the local QA user's consent state.");
  }
  const originalConsent = data.ai_processing_consent ?? null;
  const { error: revokeError } = await service
    .from("profiles")
    .update({ ai_processing_consent: null })
    .eq("user_id", userId);
  if (revokeError) {
    throw new Error("Could not revoke consent for the consent QA profile.");
  }

  try {
    return await execute();
  } finally {
    const { error: restoreError } = await service
      .from("profiles")
      .update({ ai_processing_consent: originalConsent })
      .eq("user_id", userId);
    if (restoreError) {
      throw new Error("Could not restore the local QA user's consent state.");
    }
  }
}

async function executeServerProfile(profileId, environment, helpers, clients) {
  const { authenticated, service, userId, runtime } = clients;
  const policy = helpers.getSafeguardQaPolicy(profileId);
  let messages = getUnresolvedQaMessages(
    helpers.createSafeguardQaInboxMessages(profileId)
  );
  if (profileId === "terminal-fresh-install-v1") {
    messages = messages.slice(0, 1);
  }
  const providerOutcomeMessages =
    profileId === "response-validity-v1"
      ? createProviderOutcomeMessages(messages)
      : [];
  const runId = `${profileId}-${Date.now()}`;
  const scanStartedAtMs = Date.now();
  await resetServerSafeguardState(
    service,
    userId,
    providerOutcomeMessages.length > 0 ? providerOutcomeMessages : messages
  );
  const scanKind = helpers.getSafeguardQaScanKind(profileId);
  const requestSize = policy.fullParser.maxUnitsPerRequest;
  const chunks = Array.from(
    { length: Math.ceil(messages.length / requestSize) },
    (_, index) => messages.slice(index * requestSize, (index + 1) * requestSize)
  );
  const responses = [];
  if (profileId === "terminal-fresh-install-v1" && messages[0]) {
    await seedTerminalOutcome(service, userId, messages[0]);
  }
  if (providerOutcomeMessages.length > 0) {
    for (const outcomeMessage of providerOutcomeMessages) {
      const { providerOutcome } = outcomeMessage;
      responses.push(
        await invokeQaChunk(
          authenticated,
          profileId,
          runId,
          [outcomeMessage],
          scanKind,
          `${runId}:provider:${providerOutcome}`,
          providerOutcome,
          scanStartedAtMs
        )
      );
    }
  } else {
    const repeats = profileId === "negative-three-strikes-v1" ? 3 : 1;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const session = `${runId}:session:${repeat}`;
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const currentScanKind =
          profileId === "shared-batch-live-v1" && chunkIndex > 0
            ? "live"
            : scanKind;
        responses.push(
          await invokeQaChunk(
            authenticated,
            profileId,
            runId,
            chunk,
            currentScanKind,
            session,
            undefined,
            scanStartedAtMs
          )
        );
      }
      if (profileId !== "negative-three-strikes-v1" || repeat >= repeats - 1) {
        continue;
      }
      const snapshot = await readServerSafeguardSnapshot(
        service,
        userId,
        runId,
        messages
      );
      const requestIds = snapshot.work.map(({ id }) => id).filter(Boolean);
      await expireHistoryCooldown(
        service,
        userId,
        Math.max(policy.historyCooldownMs, policy.fullParser.burstWindowMs),
        runId
      );
      await expireRollingUsage(
        service,
        userId,
        policy.fullParser.rollingWindowMs,
        requestIds
      );
    }
  }
  if (profileId === "history-cooldown-v1" && chunks[0]) {
    responses.push(
      await invokeQaChunk(
        authenticated,
        profileId,
        runId,
        chunks[0],
        "history",
        `${runId}:second-history-session`,
        undefined,
        scanStartedAtMs
      )
    );
  }
  if (profileId === "rolling-expiry-v1" && chunks[0]) {
    const snapshot = await readServerSafeguardSnapshot(
      service,
      userId,
      runId,
      messages
    );
    const requestIds = snapshot.work.map(({ id }) => id).filter(Boolean);
    await expireRollingUsage(
      service,
      userId,
      policy.fullParser.rollingWindowMs,
      requestIds
    );
    responses.push(
      await invokeQaChunk(
        authenticated,
        profileId,
        runId,
        chunks[0],
        scanKind,
        `${runId}:after-expiry`,
        undefined,
        scanStartedAtMs
      )
    );
  }
  const accountSwitchProof =
    profileId === "account-switch-v1" && chunks[0]
      ? await runAccountSwitchProof({
          service,
          runtime,
          profileId,
          runId,
          messages: chunks[0],
        })
      : false;
  const categoryResponses =
    profileId === "partial-quota-v1"
      ? [
          await invokeQaCategoryChunk(authenticated, profileId, runId, 0),
          await invokeQaCategoryChunk(authenticated, profileId, runId, 1),
        ]
      : [];
  const snapshot = await readServerSafeguardSnapshot(
    service,
    userId,
    runId,
    providerOutcomeMessages.length > 0 ? providerOutcomeMessages : messages
  );
  const counts = assertServerProfileResult(
    profileId,
    responses,
    snapshot,
    accountSwitchProof,
    categoryResponses
  );
  const categoryProviderStartedCount = snapshot.usage.filter(({ request_id }) =>
    snapshot.work.some(
      ({ id, capability }) =>
        id === request_id && capability === "sms_category_enrichment"
    )
  ).length;
  const safeguardDiagnostics = buildServerSafeguardDiagnostics({
    profileId,
    policy,
    responses: [...responses, ...categoryResponses],
    snapshot,
  });
  return {
    status: "passed",
    diagnostics: {
      ...safeguardDiagnostics,
      requestCount: responses.length,
      acceptedResponseCount: counts.acceptedCount,
      refusedResponseCount: counts.refusedCount,
      simulatedProviderCallCount: counts.providerStartedCount,
      categoryEnrichmentRequestCount: categoryResponses.length,
      categoryEnrichmentProviderCallCount: categoryProviderStartedCount,
    },
  };
}

async function runServerProfile(profileId, environment, helpers) {
  const clients = await getQaClients(environment);
  return withQaConsentState(clients.service, clients.userId, profileId, () =>
    executeServerProfile(profileId, environment, helpers, clients)
  );
}

async function runTests(args, environment) {
  require("tsx/cjs");
  const helpers = require(runnerPath);
  const runner = new helpers.SmsSafeguardQaPreflightRunner({ environment });
  const profileId = resolveSafeguardQaProfileArgument(args);
  const profileIds = profileId ? [profileId] : ALL_PROFILE_IDS;
  const results = [];
  for (const currentProfileId of profileIds) {
    results.push(
      SERVER_PROFILE_IDS.has(currentProfileId)
        ? await runServerProfile(currentProfileId, environment, helpers)
        : await runner.run(currentProfileId)
    );
  }
  process.stdout.write(
    `${JSON.stringify(profileId ? results[0] : results, null, 2)}\n`
  );
}

async function runTestsWithLocalEdge(args, environment) {
  const profileId = resolveSafeguardQaProfileArgument(args);
  const needsServer = profileId === null || SERVER_PROFILE_IDS.has(profileId);
  if (!needsServer) {
    await runTests(args, environment);
    return;
  }

  const functionsServe = startQaFunctionsServe(environment);
  try {
    const runtime = getLocalSupabaseRuntime();
    await waitForLocalApi(runtime);
    const readinessClient = createQaSupabaseClient(
      runtime.API_URL,
      runtime.ANON_KEY
    );
    await signInQaUser(readinessClient, environment);
    await waitForQaEdgeRuntime(
      readinessClient,
      profileId ?? "partial-quota-v1",
      `readiness-${Date.now()}`
    );
    await runTests(args, environment);
  } finally {
    stopQaFunctionsServe(functionsServe);
  }
}

function buildSafeguardDevelopmentStartArgs(args) {
  const startArgs = args.filter(
    (arg, index) => arg !== "--scenario" && args[index - 1] !== "--scenario"
  );
  const resolvedStartArgs =
    startArgs.length > 0 ? startArgs : ["--wireless-device"];
  return resolvedStartArgs.includes("--clear")
    ? resolvedStartArgs
    : [...resolvedStartArgs, "--clear"];
}

function startDevelopmentServer(args, environment, profileId) {
  const resolvedStartArgs = buildSafeguardDevelopmentStartArgs(args);
  const result = spawnSync(
    process.execPath,
    [startScript, "--fixture-sms", ...resolvedStartArgs],
    {
      cwd: mobileRoot,
      env: buildSafeguardQaEnvironment(environment, profileId),
      stdio: "inherit",
    }
  );

  process.exit(result.status ?? 1);
}

async function main() {
  const [command = "test", ...args] = process.argv.slice(2);
  const environment = buildSafeguardQaEnvironment();

  if (command === "test") {
    await runTestsWithLocalEdge(args, environment);
    return;
  }
  if (command === "start") {
    const profileId = resolveSafeguardQaProfileArgument(args, {
      required: true,
    });
    assertKnownSafeguardQaProfile(profileId);
    startDevelopmentServer(args, environment, profileId);
    return;
  }

  throw new Error(
    `Unknown SMS safeguard QA command: ${command}. Use test or start.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}

module.exports = {
  QA_PROVIDER_OUTCOME_MATRIX,
  assertKnownSafeguardQaProfile,
  buildSafeguardDevelopmentStartArgs,
  buildQaRequestKeyResetFilter,
  buildServerSafeguardDiagnostics,
  buildSafeguardQaEnvironment,
  resolveSafeguardQaProfileArgument,
  startDevelopmentServer,
};
