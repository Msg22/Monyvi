# Research decisions — shared account review

Date2026-10-14, source snapshot46a85a90, main7838df64. No production edits/live
provider call. Lead researches under owner's no-pre-implementation-delegation
rule.

## R01 — Canonical schemas and source providers

**Decision**: One logic-owned dependency-light Zod evidence/group contract;
generated/verified Edge copy and derived provider projections, no duplicate
unions. Extend original requests; preserve quota/safeguard envelopes and
configured models.

**Evidence**: Mobile Voice schema and Edge `parse-voice/index.ts` schema are
independent; accounts currently contain id/name/currency only. SMS
`ParseSmsContext` contains categories/currencies, not accounts. Its Edge
provider config permits DeepInfra. Existing `generate-edge-voice-contract.cjs`
only copies the quota contract, not parser-result evidence.

**Rationale**: Nullable account ID/currency cannot establish absent versus
explicit unmatched evidence or ambiguity. A second grouping call adds
cost/delay. **Alternatives**: Independent schemas drift; model IDs do not
authorize writes.

Primary guidance: Gemini supports a JSON Schema subset and requires value
validation beyond syntax; avoid large nested projections.
[Google structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
DeepInfra recommends checking schema behavior for the configured model rather
than relying on JSON mode alone.
[DeepInfra model compatibility guidance](https://deepinfra.com/blog/model-deprecation-llm-apps).
No claim that the proposed schema has passed a hosted-model probe.

## R02 — Evidence-first default and currency resolution

**Decision**: Pure source-aware resolver over owned snapshots; defaults only for
absent account evidence and known matching currency. Explicit unmatched evidence
requires suggestion/choice; multiple matches require user choice. ATM sides
separate. **Evidence**: `sms-account-matcher.ts:544-595` excludes Cash for SMS
but Voice accepts returned/default IDs without currency checks. Voice mapper
prioritizes account currency; review selection keeps default matches
unconfirmed. **Rationale**: Accepted defaults clear only account blockers; other
uncertainty remains. Unsupported/ambiguous currencies are not preferred-currency
omissions. **Alternatives**: First/fuzzy match or default after explicit
evidence hides conflict.

## R03 — Conservative shared identity

**Decision**: Ground AI groups locally with same known currency and compatible
explicit name/type/provider/card evidence. Model group IDs are scoped aliases.
Preserve overrides/removal across chunk/retry; no implicit confirmed identity
change. **Evidence**: Pending account dedup uses nickname/currency/provider, not
card. Persisted uniqueness and evidence equivalence are different contracts.
**Rationale**: Different cards cannot silently collapse to satisfy uniqueness.
**Alternatives**: Name-only merge loses identity; per-response groups duplicate
accounts.

## R04 — Existing SMS local payload version2

**Decision**: V2 evidence/assignment/group revision/status/removal in existing
draft JSON; atomically update all linked snapshots and selection. V1 stays
readable, local migration on change; no hosted backfill/new review table. Voice
session only. **Evidence**: Current strict v1 codec stores per-row pending
accounts; repository transaction/selection updates are separate. SMS
queues/items excluded from sync. **Rationale**: Review later/restart must
preserve choices; group mutations cannot partially confirm. **Alternatives**:
Hook-only state loses recovery; new cloud table widens scope; individual writes
can disagree.

## R05 — New complete financial action

**Decision**: Register `review.batch-save/v1` through existing foundation,
stable action ID, expected account revisions, exact complete writes. Local
numbered SQL validation/apply/CAS registration plus
protected-sync/reconciliation extension. **Evidence**: Legacy batch writer
directly sums/updates balances; SMS save composes accounts, records and
permanent draft cleanup. Registry allows transaction-only batch import,
account-only create or one SMS cleanup+transaction pair. Core writer drops zero
effects and rejects all-zero net. Migration076 mirrors strict shapes; SMS
cleanup is local-only metadata, no cloud draft table. Protected push recognizes
legacy v1/entities only. **Rationale**: New save cannot split selected batch or
bypass revisions. Preserve final existing balance outcomes by exact once-only
posting, no AI bank balance. **Alternatives**: Legacy v1 cannot express it;
separate writes can partially save; `database.write` alone does not provide
server CAS. No SQL executed during research.

## R06 — Add default intent in command

**Decision**: Validated unsaved intent on create; first active always default;
later OFF preserves existing/no default, ON clears old only in successful
create. **Evidence**: `account-service.ts:476-645` separates guarded nonzero
from zero creation; current default only derives from first account. Existing
Edit star pattern approved. SQL029/033 ensure at most one active remote default.
**Rationale**: A second toggle after create can fail; preserve
ownership/children. **Alternatives**: Hook DB writes violate layers; unrelated
form redesign belongs#393.

## R07 — Existing currency modal

**Decision**: Add optional context and honest nullable/unconfirmed selection to
existing CurrencyPicker. Row tap explicitly accepts; cancel mutates nothing.
Conflict Use applies selected candidate; other action replaces sheet, not
stacks. **Evidence**: Current picker requires selectedCurrency and already has
list/search and bottom inset. Owner superseded R3-04 custom chrome.
**Rationale**: No fabricated preselection/parallel modal; amount preserved,
one-row regroup. **Alternatives**: New picker violates approval; empty IDs hide
uncertainty.

## R08 — Tests and readiness

**Decision**: Authored Red tests/E2E fixtures first; batched integration checks;
no emulator. Add action/CAS and compatibility casesM19/M20. Owner supplies
rendered, keyboard/audio/accessibility evidence. **Rationale**: Product matrix
plus contract parity, zero-net, replay/rejection/sync-isolation tests. No
unresolved product choice or dependency/provider replacement introduced by this
plan.
