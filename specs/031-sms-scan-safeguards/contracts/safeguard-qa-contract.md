# Contract: Deterministic SMS Safeguard QA

## Activation

- Available only in development/test builds behind an explicit safeguard QA
  mode.
- Production builds reject scenario configuration, fixture inboxes, policy
  overrides, simulated stores, and provider doubles.
- A QA run must never silently fall back to a real inbox, production provider,
  or production allowance store.

## Scenario Profile

```ts
interface SmsSafeguardQaScenario {
  readonly id: string;
  readonly version: number;
  readonly fixedNowMs: number;
  readonly policyOverrides: Readonly<Record<string, number>>;
  readonly inboxFixtureId: string;
  readonly providerScript: readonly SimulatedProviderStep[];
  readonly initialLocalState: Readonly<Record<string, unknown>>;
  readonly initialRemoteState: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
}
```

Each profile owns an isolated namespace. Reset removes only that namespace and
must not delete unrelated development user data.

## Required Profiles

- `cutoff-boundary-v1`
- `checkpoint-overlap-v1`
- `partial-quota-v1`
- `rolling-expiry-v1`
- `shared-batch-live-v1`
- `burst-limit-v1`
- `history-cooldown-v1`
- `oversized-candidate-v1`
- `response-validity-v1`
- `negative-three-strikes-v1`
- `terminal-fresh-install-v1`
- `trusted-local-recovery-v1`
- `account-switch-v1`
- `prompt-token-baseline-v1`

The prompt-token profile uses the local estimator. A separate explicit opt-in
command may call the selected model's count-tokens service for calibration; it
is not part of routine scenario runs and cannot run silently.

## Simulated Provider Outcomes

- complete trusted success;
- complete low-confidence trusted success;
- complete explicit `isTrusted: false`;
- complete omission;
- duplicate/unknown identity;
- malformed JSON/schema;
- truncated/safety-stopped/incomplete;
- retryable/permanent failure;
- delayed completion and cancellation.

## Diagnostics

Expose only profile ID/version, effective boundaries, aggregate admitted,
consumed, refused, local, AI, negative, oversized, and checkpoint counts, plus
`productionProviderCallCount` and `productionAllowanceChargeCount`, both of
which must be zero.
