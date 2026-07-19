# Research: Trusted Hybrid SMS Parser

## Decision 1: Use per-candidate local-first routing

**Decision**: Evaluate every candidate against the active trusted catalog first.
Send only `unresolved` candidates to AI. Treat `matched` transaction templates
and `rejected` non-transaction templates as locally resolved.

**Rationale**: Batch-level fallback would resend covered messages, waste AI
cost, and make correlation ambiguous. Per-candidate routing directly satisfies
the cost, privacy, and deterministic deduplication goals.

**Rejected alternatives**:

- AI first, local fallback: retains the cost and availability problem.
- Whole-batch local then whole-batch AI: resends trusted matches.
- Keyword-based routing: cannot safely distinguish promotions, OTPs, and real
  transactions with similar words.

## Decision 2: Promote into a separate runtime catalog

**Decision**: A source-controlled promotion command converts explicitly approved
Phase 2A entries into an independently validated `trusted_production` catalog.
Production code never imports the candidate directory or QA evaluator.

**Rationale**: Phase 2A artifacts are evidence and may include pending or
unavailable families. Physical separation makes accidental activation testable.
One reviewed real sanitized template is sufficient for promotion, but only its
exact structure is trusted.

**Rejected alternatives**:

- Flip `runtimeScope` in candidate JSON: weakens the evidence/runtime boundary.
- Load all reviewed candidates dynamically: makes production behavior depend on
  QA artifact shape and complicates rollback.
- Hand-write broad provider regexes: invents unsupported variants.

## Decision 3: Match exact ordered structures, not broad provider rules

**Decision**: Compile ordered fixed fragments and declared placeholder roles
into anchored matchers. Normalize only reviewed-insensitive whitespace. Evaluate
all eligible patterns and fail as `ambiguous` when more than one produces a
valid result.

Sender aliases are trimmed and compared case-insensitively. Message bodies
normalize CR/LF boundaries and collapse repeated whitespace only. Fixed letter
case, wording, punctuation, and placeholder order remain exact unless a future
pattern version explicitly approves a different structure.

**Rationale**: A single approved sample authorizes only that sanitized
structure. First-match wins would hide catalog collisions and create unsafe
financial suggestions.

**Rejected alternatives**:

- Free-floating keywords or generic amount regexes: excessive false positives.
- First successful pattern: nondeterministic when catalog order changes.
- Fuzzy matching: expands trust beyond reviewer approval.

## Decision 4: Keep fixed template fragments, reject evidence values

**Decision**: The trusted catalog may contain reviewed fixed fragments and
placeholder-role metadata required for matching. It must not contain full raw or
sanitized evidence messages, evidence digests, or concrete private placeholder
values.

**Rationale**: Fixed wording is necessary for local matching, while variable
evidence values are unnecessary and privacy-sensitive. This resolves the
difference between a matcher definition and an evidence sample.

## Decision 5: Use a bundled catalog behind an activation policy

**Decision**: Ship a versioned bundled catalog and use an activation interface
that returns the installed catalog plus enabled pattern IDs. The first policy is
bundled-only; a future cached remote manifest can implement the same interface.

**Rationale**: Bundling has no new infrastructure cost, works offline, and is
appropriate for the small pre-production catalog. The interface avoids locking
the matcher to OTA-only operational control.

**Rollback behavior**: Build/privacy tests reject invalid catalogs. Expo update
activation retains the prior installed update when a new update fails validation
or activation. If a currently installed bundled catalog is invalid at runtime,
trusted local execution is disabled and candidates route to AI. No partially
downloaded or invalid catalog is activated.

## Decision 6: Preserve partial results and retry only unresolved work

**Decision**: The hybrid result carries successful suggestions and transient
unresolved candidates separately. The review route keeps them in an in-memory
session and retries only unresolved candidates. Merge is by fingerprint and
preserves existing review edits.

**Rationale**: Discarding local successes after an AI failure repeats work and
hurts the user. Retrying the whole inbox risks duplicates and overwriting review
state.

**Rejected alternatives**:

- Fail the entire scan: loses valid local results.
- Retry all candidates: repeats AI/local work and complicates deduplication.
- Persist unresolved SMS bodies: unnecessary privacy and lifecycle risk.

## Decision 7: Keep the existing consent gate

**Decision**: The existing AI transaction-feature consent remains the entry gate
for hybrid SMS parsing. Local parsing does not create a hidden local-only
feature when consent is disabled.

**Rationale**: This preserves the approved flow and avoids an unplanned product
and disclosure change. A future local-only access model requires separate
approval.

## Decision 8: Reuse one orchestrator across delivery modes

**Decision**: Batch scan and live foreground/background/killed-app paths call
the same hybrid orchestrator. Batch exposes partial-results UI; single-message
live paths retain their existing retry/notification outcomes.

**Rationale**: Matching and fingerprint behavior must not diverge by Android
delivery mode. UI behavior can differ because live processing has no review
screen session at parse time.

## Decision 9: Use stable codes and safe aggregate diagnostics

**Decision**: Routing reason, parser source, pattern ID, catalog version, and
counts are stable codes. Logs never include message text, sender, extracted
values, or parser response bodies.

**Rationale**: This gives staging observability without turning logs into a
second SMS data store.

## Decision 10: Adopt the second generated mockup image in full

**Decision**: Implement both light and dark variants from
`mockups/partial-results-notice-light-dark.png`: compact bordered inline notice,
warning icon, title/supporting copy, separator, and retry action.

**Rationale**: It keeps the failure visible without blocking or overlaying the
transaction list, and it makes the retry target explicit.

## Decision 11: Limit the initial production family matrix

**Decision**: Promote exact approved QNB card purchase, ATM withdrawal,
incoming/outgoing IPN, refund/reversal, OTP, informational, and promotional
structures when they pass promotion validation. Unavailable failed-transaction
scopes remain unsupported. `bank_to_wallet_transfer` remains unresolved and
routes to AI.

**Rationale**: ATM already has a reviewed transfer-on-save contract, and IPN
messages represent external-counterparty income/expense. Bank-to-wallet is an
internal transfer requiring two owned account endpoints that the current parsed
SMS contract cannot represent safely.

## Decision 12: Clear transient retry data at every abandonment boundary

**Decision**: Clear raw unresolved candidates and parse context on save,
discard, reset, review Back, route replacement that abandons review, logout, and
private runtime unmount.

**Rationale**: `SmsScanProvider` lives at the private layout and does not
unmount when the review route changes, so provider unmount alone is not a
sufficient privacy or stale-state boundary.
