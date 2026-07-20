# Contract: SMS Scan Policy

## Purpose

Provide one versioned interpretation of launch SMS boundaries for mobile, server
parity checks, and deterministic QA.

## Shape

```ts
interface SmsScanPolicy {
  readonly id: "early-access";
  readonly version: number;
  readonly lookbackDays: 30;
  readonly checkpointOverlapMinutes: 5;
  readonly canSelectCustomRange: false;
  readonly canRescanRecentMessages: true;
  readonly fullParser: {
    readonly maxCandidatesPerRequest: 50;
    readonly maxCandidatesPerScan: 200;
    readonly maxCandidatesPerRollingWindow: 200;
    readonly rollingWindowHours: 24;
    readonly maxPayloadBytes: 131072;
    readonly maxEstimatedInputTokens: 32000;
    readonly maxProviderStartsPerMinute: 30;
  };
  readonly categoryEnrichment: {
    readonly maxUniqueMerchantsPerRequest: 20;
    readonly maxAttemptsPerRollingWindow: 100;
    readonly rollingWindowHours: 24;
    readonly maxProviderStartsPerMinute: 30;
  };
  readonly historyRescanCooldownHours: 24;
  readonly reservationLeaseSeconds: 300;
  readonly terminalNegativeStrikeCount: 3;
  readonly fullParserEnabled: boolean;
  readonly categoryEnrichmentEnabled: boolean;
}
```

## Rules

- Production policy is immutable at runtime except explicit emergency capability
  disablement from trusted operational configuration.
- Missing, malformed, or unsupported policy fails closed for new paid work but
  leaves local exclusion/trusted parsing available.
- Checkpoints carry the processing-policy version and are invalidated when
  cutoff, local exclusion, trusted-catalog, fingerprint, or durable-state
  semantics change.
- Test profiles may override numeric boundaries only in a non-production build
  and must retain production interpretation and refusal precedence.
- Mobile and Edge policy parity is covered by one serialized contract fixture.
- The effective initial/history boundary is inclusive at exactly 30 days.
- The effective incremental boundary is the later of rolling cutoff and
  checkpoint minus five minutes.

## Refusal Precedence

1. unauthenticated or user mismatch;
2. missing AI consent;
3. invalid/malformed request or request identity;
4. emergency-disabled capability;
5. terminal AI-negative fingerprint;
6. individual candidate too large on the client;
7. request candidate/merchant count;
8. aggregate payload bytes;
9. estimated input tokens;
10. per-scan remaining capacity;
11. rolling user allowance;
12. capability burst limit;
13. applicable history cooldown.

The response may report the dominant refusal plus the later known availability
time when multiple time-based blockers apply.
