import {
  calculateEffectiveScanBoundary,
  findContiguousDurableCheckpoint,
  type DurableCandidateState,
  type SmsScanKind,
} from "../../../../packages/logic/src/sms-safeguards/sms-scan-boundary";
import { canFitSmsCandidate } from "../../../../packages/logic/src/sms-safeguards/sms-input-estimator";
import {
  DEFAULT_SMS_SCAN_POLICY,
  parseSmsScanPolicy,
  type SmsScanPolicy,
} from "../../../../packages/logic/src/sms-safeguards/sms-scan-policy";
import { reconcileProviderCompletion } from "../../../../packages/logic/src/sms-safeguards/sms-provider-response-reconciler";
import { selectSmsAiWork } from "../../../../packages/logic/src/sms-safeguards/sms-ai-work-selector";
import {
  SAFEGUARD_QA_FIXED_NOW_MS,
  SAFEGUARD_QA_SCENARIOS,
  type SafeguardQaProfileId,
} from "../../../../packages/logic/src/sms-safeguards/safeguard-qa-scenarios";
import {
  getSmsSafeguardQaConfig,
  requireSmsSafeguardQaConfig,
  type SmsSafeguardQaConfig,
  type SmsSafeguardQaEnvironment,
} from "@/config/sms-safeguard-qa-config";
import {
  SmsSafeguardProviderSimulator,
  type SimulatedProviderStep,
} from "./sms-safeguard-provider-simulator";

const DAY_MS = 24 * 60 * 60 * 1000;

interface FixtureMessage {
  readonly fingerprint: string;
  readonly receivedAtMs: number;
  readonly isTrustedLocal: boolean;
}

export interface SmsSafeguardQaInboxMessage {
  readonly id: string;
  readonly address: string;
  readonly body: string;
  readonly date: number;
  readonly read: true;
}

interface NamespaceState {
  readonly markers: Map<string, string>;
  readonly providerStartsMs: number[];
  historyCooldownUntilMs: number | null;
  readonly negativeStrikes: Map<string, number>;
  readonly terminalFingerprints: Set<string>;
}

export interface SmsSafeguardQaDiagnostics {
  readonly profileId: SafeguardQaProfileId;
  readonly profileVersion: number;
  readonly fixedNowMs: number;
  readonly effectiveMinDate: number;
  readonly filteredOutCount: number;
  readonly admittedCount: number;
  readonly deferredCount: number;
  readonly consumedCount: number;
  readonly refusedCount: number;
  readonly localCount: number;
  readonly aiCount: number;
  readonly negativeCount: number;
  readonly oversizedCount: number;
  readonly invalidResponseCount: number;
  readonly checkpointCount: number;
  readonly terminalCount: number;
  readonly simulatedProviderCallCount: number;
  readonly productionProviderCallCount: 0;
  readonly productionAllowanceChargeCount: 0;
}

export interface SmsSafeguardQaRunResult {
  readonly status: "passed";
  readonly diagnostics: SmsSafeguardQaDiagnostics;
}

export interface SmsSafeguardQaPreflightRunnerOptions {
  readonly environment?: SmsSafeguardQaEnvironment;
  readonly config?: SmsSafeguardQaConfig;
}

export const CLIENT_PREFLIGHT_SAFEGUARD_QA_PROFILE_IDS = Object.freeze([
  "cutoff-boundary-v1",
  "checkpoint-overlap-v1",
  "trusted-local-recovery-v1",
  "prompt-token-baseline-v1",
] as const satisfies readonly SafeguardQaProfileId[]);

const CLIENT_PREFLIGHT_PROFILE_SET: ReadonlySet<SafeguardQaProfileId> = new Set(
  CLIENT_PREFLIGHT_SAFEGUARD_QA_PROFILE_IDS
);

interface MutableCounts {
  filteredOutCount: number;
  admittedCount: number;
  deferredCount: number;
  consumedCount: number;
  refusedCount: number;
  localCount: number;
  aiCount: number;
  negativeCount: number;
  oversizedCount: number;
  invalidResponseCount: number;
  checkpointCount: number;
  terminalCount: number;
}

function createNamespaceState(): NamespaceState {
  return {
    markers: new Map(),
    providerStartsMs: [],
    historyCooldownUntilMs: null,
    negativeStrikes: new Map(),
    terminalFingerprints: new Set(),
  };
}

function createCounts(): MutableCounts {
  return {
    filteredOutCount: 0,
    admittedCount: 0,
    deferredCount: 0,
    consumedCount: 0,
    refusedCount: 0,
    localCount: 0,
    aiCount: 0,
    negativeCount: 0,
    oversizedCount: 0,
    invalidResponseCount: 0,
    checkpointCount: 0,
    terminalCount: 0,
  };
}

export function createSafeguardQaFixtureStates(
  profileId: SafeguardQaProfileId,
  fixedNowMs: number
): readonly FixtureMessage[] {
  const offsets =
    profileId === "cutoff-boundary-v1"
      ? [-DAY_MS - 1, -DAY_MS, -DAY_MS + 1]
      : profileId === "partial-quota-v1"
        ? [0, -60_000, -120_000, -180_000, -240_000, -300_000, -360_000]
        : [
              "shared-batch-live-v1",
              "burst-limit-v1",
              "history-cooldown-v1",
            ].includes(profileId)
          ? [0, -60_000, -120_000, -180_000, -240_000, -300_000]
          : [0, -60_000, -120_000, -180_000, -240_000];

  return offsets.map((offset, index) => ({
    fingerprint: `qa-${profileId}-${index}`,
    receivedAtMs: fixedNowMs + offset,
    isTrustedLocal: index === 0,
  }));
}

const TRUSTED_QNB_PURCHASE =
  "Your Debit Card **2132 had a Successful transaction of EGP 49.00 @QA LOCAL SHOP,your available bal.EGP10853.15 for lost/stolen card call 19700";

function getQaFixtureBody(
  profileId: SafeguardQaProfileId,
  index: number
): string {
  if (index === 0) return TRUSTED_QNB_PURCHASE;
  if (index === 4) {
    return "QNB rewards: اكسب كاش باك when you use your card this week.";
  }
  return `QNB account alert: completed payment of EGP ${100 + index}.00 to QA ${profileId} scenario ${index}. Reference QA-${profileId}-${index}.`;
}

export function createSafeguardQaInboxMessages(
  profileId: SafeguardQaProfileId
): readonly SmsSafeguardQaInboxMessage[] {
  const states = createSafeguardQaFixtureStates(
    profileId,
    SAFEGUARD_QA_FIXED_NOW_MS
  );
  return states.map((state, index) => ({
    id: `sms-safeguard-qa:${profileId}:${index}`,
    address: "QNB EGYPT",
    body:
      profileId === "oversized-candidate-v1" && index > 0
        ? `QNB account alert: ${"x".repeat(512)}`
        : getQaFixtureBody(profileId, index),
    date: state.receivedAtMs,
    read: true,
  }));
}

export function getSafeguardQaScanKind(
  profileId: SafeguardQaProfileId
): SmsScanKind {
  return profileId === "history-cooldown-v1" ||
    profileId === "negative-three-strikes-v1"
    ? "history"
    : profileId === "checkpoint-overlap-v1"
      ? "incremental"
      : "initial";
}

export function getSafeguardQaProviderSteps(
  profileId: SafeguardQaProfileId
): readonly SimulatedProviderStep[] {
  if (profileId === "response-validity-v1") {
    return [{ outcome: "invalid-identity" }];
  }
  if (profileId === "negative-three-strikes-v1") {
    return [
      { outcome: "explicit-negative" },
      { outcome: "explicit-negative" },
      { outcome: "explicit-negative" },
    ];
  }
  if (profileId === "rolling-expiry-v1") {
    return [{ outcome: "delay", delayMs: 1 }];
  }
  return [{ outcome: "trusted-success" }];
}

export function getSafeguardQaPolicy(
  profileId: SafeguardQaProfileId
): SmsScanPolicy {
  const scenario = SAFEGUARD_QA_SCENARIOS[profileId];
  const overrides = scenario.policyOverrides;
  return parseSmsScanPolicy({
    ...DEFAULT_SMS_SCAN_POLICY,
    lookbackDays: overrides.lookbackDays,
    checkpointOverlapMs: overrides.checkpointOverlapMs,
    historyCooldownMs: overrides.historyCooldownMs,
    negativeStrikeThreshold: overrides.negativeStrikeThreshold,
    fullParser: {
      ...DEFAULT_SMS_SCAN_POLICY.fullParser,
      ...overrides.fullParser,
    },
  });
}

function getCandidatePayload(
  profileId: SafeguardQaProfileId,
  candidate: FixtureMessage
): string {
  if (profileId === "oversized-candidate-v1") {
    return "x".repeat(512);
  }
  return `fixture-candidate-${candidate.fingerprint}`;
}

function pruneWindow(
  values: readonly number[],
  nowMs: number,
  windowMs: number
): readonly number[] {
  return values.filter((value) => value > nowMs - windowMs);
}

export class SmsSafeguardQaPreflightRunner {
  public constructor(options: SmsSafeguardQaPreflightRunnerOptions = {}) {
    this.config =
      options.config ??
      requireSmsSafeguardQaConfig(options.environment ?? process.env, {
        requireProfile: false,
      });
  }

  private readonly config: SmsSafeguardQaConfig;
  private readonly namespaces = new Map<string, NamespaceState>();

  public reset(profileId: SafeguardQaProfileId): void {
    this.namespaces.delete(`sms-safeguard-qa:${profileId}`);
  }

  public setNamespaceMarker(namespace: string, value: string): void {
    const state = this.getNamespace(namespace);
    state.markers.set("marker", value);
  }

  public getNamespaceMarker(namespace: string): string | null {
    return this.namespaces.get(namespace)?.markers.get("marker") ?? null;
  }

  public async run(
    profileId: SafeguardQaProfileId
  ): Promise<SmsSafeguardQaRunResult> {
    if (!CLIENT_PREFLIGHT_PROFILE_SET.has(profileId)) {
      throw new Error(
        `${profileId} must run through the local Supabase safeguard QA endpoint.`
      );
    }
    const scenario = SAFEGUARD_QA_SCENARIOS[profileId];
    if (scenario === undefined) {
      throw new Error(`Unknown safeguard QA profile: ${profileId}`);
    }
    if (
      scenario.version !== 1 ||
      scenario.fixedNowMs !== SAFEGUARD_QA_FIXED_NOW_MS
    ) {
      throw new Error(`Unsupported safeguard QA profile version: ${profileId}`);
    }
    if (!this.config.enabled || this.config.allowProductionFallback) {
      throw new Error(
        "SMS safeguard QA must run enabled with no production fallback."
      );
    }

    this.reset(profileId);
    const namespace = `sms-safeguard-qa:${profileId}`;
    const state = this.getNamespace(namespace);
    const policy = getSafeguardQaPolicy(profileId);
    const scanKind = getSafeguardQaScanKind(profileId);
    const checkpoint =
      profileId === "checkpoint-overlap-v1"
        ? { boundaryReceivedAtMs: scenario.fixedNowMs - 60_000 }
        : null;
    const effectiveMinDate = calculateEffectiveScanBoundary({
      scanKind,
      scanStartedAtMs: scenario.fixedNowMs,
      lookbackDays: policy.lookbackDays,
      overlapMs: policy.checkpointOverlapMs,
      checkpoint,
    });
    const messages = createSafeguardQaFixtureStates(
      profileId,
      scenario.fixedNowMs
    );
    const inWindow = messages.filter(
      (message) => message.receivedAtMs >= effectiveMinDate
    );
    const counts = createCounts();
    counts.filteredOutCount = messages.length - inWindow.length;

    const localMessage = inWindow.find((message) => message.isTrustedLocal);
    const aiMessages = inWindow.filter((message) => message !== localMessage);
    if (localMessage !== undefined) counts.localCount = 1;

    if (profileId === "trusted-local-recovery-v1") {
      state.terminalFingerprints.add(localMessage?.fingerprint ?? "recovery");
    }
    if (profileId === "terminal-fresh-install-v1") {
      state.terminalFingerprints.add("qa-terminal-fingerprint");
      counts.terminalCount = 1;
      counts.refusedCount = 1;
    }

    const selection = selectSmsAiWork(
      aiMessages,
      policy.fullParser.maxUnitsPerScan
    );
    counts.admittedCount = selection.admitted.length;
    counts.deferredCount = selection.deferred.length;
    counts.refusedCount += selection.deferred.length;

    const provider = new SmsSafeguardProviderSimulator(
      getSafeguardQaProviderSteps(profileId),
      { sleep: () => Promise.resolve() }
    );
    const durableFingerprints = new Set<string>(
      localMessage === undefined ? [] : [localMessage.fingerprint]
    );

    if (
      profileId !== "terminal-fresh-install-v1" &&
      profileId !== "trusted-local-recovery-v1"
    ) {
      await this.runProviderWork({
        profileId,
        scenarioFixedNowMs: scenario.fixedNowMs,
        policy,
        state,
        provider,
        candidates: selection.admitted,
        counts,
        durableFingerprints,
      });
    }

    if (profileId === "negative-three-strikes-v1") {
      counts.terminalCount = 1;
    }
    if (profileId === "trusted-local-recovery-v1") {
      counts.aiCount = 0;
      counts.refusedCount = 0;
      durableFingerprints.add(localMessage?.fingerprint ?? "recovery");
    }

    const checkpointResult = findContiguousDurableCheckpoint(
      inWindow.map(
        (message): DurableCandidateState => ({
          fingerprint: message.fingerprint,
          receivedAtMs: message.receivedAtMs,
          isDurable: durableFingerprints.has(message.fingerprint),
        })
      )
    );
    counts.checkpointCount = checkpointResult === null ? 0 : 1;

    return {
      status: "passed",
      diagnostics: {
        profileId,
        profileVersion: scenario.version,
        fixedNowMs: scenario.fixedNowMs,
        effectiveMinDate,
        ...counts,
        simulatedProviderCallCount: provider.simulatedCallCount,
        productionProviderCallCount: 0,
        productionAllowanceChargeCount: 0,
      },
    };
  }

  public async runAll(): Promise<readonly SmsSafeguardQaRunResult[]> {
    return Promise.all(
      CLIENT_PREFLIGHT_SAFEGUARD_QA_PROFILE_IDS.map((profileId) =>
        this.run(profileId)
      )
    );
  }

  private getNamespace(namespace: string): NamespaceState {
    const existing = this.namespaces.get(namespace);
    if (existing !== undefined) return existing;
    const created = createNamespaceState();
    this.namespaces.set(namespace, created);
    return created;
  }

  private async runProviderWork(input: {
    readonly profileId: SafeguardQaProfileId;
    readonly scenarioFixedNowMs: number;
    readonly policy: ReturnType<typeof getSafeguardQaPolicy>;
    readonly state: NamespaceState;
    readonly provider: SmsSafeguardProviderSimulator;
    readonly candidates: readonly FixtureMessage[];
    readonly counts: MutableCounts;
    readonly durableFingerprints: Set<string>;
  }): Promise<void> {
    const {
      profileId,
      scenarioFixedNowMs,
      policy,
      state,
      provider,
      candidates,
      counts,
      durableFingerprints,
    } = input;
    const requestSize = policy.fullParser.maxUnitsPerRequest;
    const chunks: readonly FixtureMessage[][] =
      profileId === "burst-limit-v1"
        ? candidates.map((candidate) => [candidate])
        : Array.from(
            { length: Math.ceil(candidates.length / requestSize) },
            (_, index) =>
              candidates.slice(index * requestSize, (index + 1) * requestSize)
          );

    for (const chunk of chunks) {
      const fitCandidates = chunk.filter((candidate) => {
        const fit = canFitSmsCandidate({
          candidatePayload: getCandidatePayload(profileId, candidate),
          fixedPayloadBytes: 8,
          fixedInputTokens: 8,
          maxPayloadBytes: policy.fullParser.maxPayloadBytes,
          maxInputTokens: policy.fullParser.maxEstimatedInputTokens,
        });
        if (!fit.fits) {
          counts.oversizedCount += 1;
          counts.refusedCount += 1;
        }
        return fit.fits;
      });
      if (fitCandidates.length === 0) continue;

      const rollingStarts = pruneWindow(
        state.providerStartsMs,
        scenarioFixedNowMs,
        policy.fullParser.rollingWindowMs
      );
      state.providerStartsMs.splice(
        0,
        state.providerStartsMs.length,
        ...rollingStarts
      );
      if (rollingStarts.length >= policy.fullParser.maxUnitsPerRollingWindow) {
        counts.refusedCount += fitCandidates.length;
        continue;
      }
      const burstStarts = state.providerStartsMs.filter(
        (value) => value > scenarioFixedNowMs - policy.fullParser.burstWindowMs
      );
      if (burstStarts.length >= policy.fullParser.maxProviderStartsPerBurst) {
        counts.refusedCount += fitCandidates.length;
        continue;
      }
      if (
        profileId === "history-cooldown-v1" &&
        state.historyCooldownUntilMs !== null &&
        state.historyCooldownUntilMs > scenarioFixedNowMs
      ) {
        counts.refusedCount += fitCandidates.length;
        continue;
      }

      state.providerStartsMs.push(scenarioFixedNowMs);
      if (profileId === "history-cooldown-v1") {
        state.historyCooldownUntilMs =
          scenarioFixedNowMs + policy.historyCooldownMs;
      }
      counts.consumedCount += fitCandidates.length;
      const result = await provider.complete({
        requestId: `qa-request-${provider.simulatedCallCount + 1}`,
        messageIds: fitCandidates.map((candidate) => candidate.fingerprint),
        startedAtMs: scenarioFixedNowMs,
      });
      if (!("envelope" in result)) {
        if (result.kind === "malformed" || result.kind === "incomplete") {
          counts.invalidResponseCount += 1;
        }
        counts.refusedCount += fitCandidates.length;
        continue;
      }

      const reconciliation = reconcileProviderCompletion({
        submittedMessageIds: fitCandidates.map(
          (candidate) => candidate.fingerprint
        ),
        envelope: result.envelope,
      });
      if (!reconciliation.isValid) {
        counts.invalidResponseCount += 1;
        counts.refusedCount += fitCandidates.length;
        continue;
      }

      counts.aiCount += reconciliation.positiveMessageIds.length;
      counts.negativeCount += reconciliation.negativeMessageIds.length;
      reconciliation.positiveMessageIds.forEach((fingerprint) => {
        durableFingerprints.add(fingerprint);
      });
      reconciliation.negativeMessageIds.forEach((fingerprint) => {
        durableFingerprints.add(fingerprint);
        const strikes = (state.negativeStrikes.get(fingerprint) ?? 0) + 1;
        state.negativeStrikes.set(fingerprint, strikes);
        if (strikes >= policy.negativeStrikeThreshold) {
          state.terminalFingerprints.add(fingerprint);
        }
      });
    }
  }
}

export async function runSmsSafeguardQaScenario(
  profileId: SafeguardQaProfileId,
  environment: SmsSafeguardQaEnvironment = process.env
): Promise<SmsSafeguardQaRunResult> {
  return new SmsSafeguardQaPreflightRunner({
    config: getSmsSafeguardQaConfig(environment, { requireProfile: false }),
  }).run(profileId);
}
