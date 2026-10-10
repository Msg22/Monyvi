# Quickstart: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature**: 389-voice-usage-limits

This is planning/QA guidance. Do not generate a new mockup. Production UI
implementation must not begin until the exact already-approved Add Transaction /
Voice reference image from the product conversation is persisted unchanged, its
binding metadata is explicitly approved, and the binding verifier passes.

## 1. Planned server policy configuration

Free-launch defaults:

```text
VOICE_AI_DAILY_LIMIT=5
VOICE_AI_BURST_LIMIT=2
VOICE_AI_BURST_WINDOW_SECONDS=60
VOICE_AI_RESERVATION_LEASE_SECONDS=120
VOICE_AI_POLICY_VERSION=free-launch-v1
```

Values are server-side operational policy. No mobile release should be required
to change them.

The current voice provider configuration remains unchanged.

## 2. Planned local-first migration workflow

The implementation will create a normal SQL migration in `supabase/migrations/`
for:

- `voice_ai_usage_windows`
- `voice_ai_work_requests`
- service-role-only availability/reserve/start/release/complete RPCs
- bounded cleanup

Then add the two server-only tables to every established exclusion list:

- `scripts/transform-schema.js`
- `scripts/sql-to-watermelon-migration.js`
- `apps/mobile/services/sync/config.ts`

Add regression tests proving these tables never become Watermelon/sync data.

No dashboard SQL or MCP schema mutation is allowed.

## 3. TDD server scenarios

Required deterministic tests before production wiring:

| Scenario                                                | Expected                                        |
| ------------------------------------------------------- | ----------------------------------------------- |
| Uses 1–5 in same accepted local day                     | provider start allowed                          |
| Sixth request                                           | daily_limit before provider call                |
| Two starts within minute                                | allowed                                         |
| Third start within minute                               | burst_limit before provider call                |
| Two devices race for final daily unit                   | exactly one provider start                      |
| Same requestKey replay within 35 days or while retained | no second provider call/unit                    |
| Terminal record just before 35 elapsed days             | retain identity                                 |
| Eligible terminal record at/after 35 days               | delete identity; preserve current accounting    |
| Same key after actual deletion                          | new admission subject to current gates          |
| Old active work/current accounting; cleanup race        | preserve record/count; serialize with admission |
| Auth/consent/malformed audio failure                    | zero consumption                                |
| Missing/invalid timezone                                | zero provider start, fail closed                |
| Missing/invalid entitlement config                      | zero provider start, fail closed                |
| Provider succeeds after start                           | one consumed                                    |
| Provider fails after start                              | one consumed                                    |
| Provider times out after start                          | one consumed                                    |
| Provider returns invalid JSON after start               | one consumed                                    |
| Gemini internally retries                               | still one consumed                              |
| DST 23-hour local day                                   | correct next local midnight                     |
| DST 25-hour local day                                   | correct next local midnight                     |
| Device timezone changes mid-window                      | active window/reset does not reset              |
| First request after old window expires                  | new valid device timezone adopted               |
| Availability storage unavailable                        | 503/fail closed                                 |
| User switch on same device                              | no foreign allowance state                      |

Provider calls in routine quota tests are doubles; do not consume Gemini quota.

### Current direct parse-voice fixture command

Run from the repository root with the existing dependency/cache state. The test
import map resolves the SDK/provider doubles plus cached `npm:zod@4.4.3`;
`--cached-only` prevents dependency downloads. Do not install dependencies in a
secondary worktree.

```text
deno test --no-config --no-lock --no-remote --cached-only --no-prompt --deny-net --deny-import --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,GEMINI_API_KEY,VOICE_AI_DAILY_LIMIT,VOICE_AI_BURST_LIMIT,VOICE_AI_BURST_WINDOW_SECONDS,VOICE_AI_RESERVATION_LEASE_SECONDS,VOICE_AI_POLICY_VERSION --import-map supabase/functions/parse-voice/deno.test.import-map.json supabase/functions/parse-voice/index.test.ts
```

Historical checklist commands remain execution evidence for the environment and
flags used at the time; use this command for the current fixture suite.

## 4. Planned client contract

The mobile service sends:

- existing audio/categories/accounts/callerLocalDate;
- new stable `requestKey`;
- new `callerTimeZone` from the device IANA timezone.

The successful voice response shape remains unchanged.

A separate `voice-ai-availability` service/hook reads the authoritative state
and refreshes on focus/foreground, after voice attempts, and at reset/burst
boundaries.

The canonical read contract is POST JSON `{ "timeZone": "Africa/Cairo" }` with
JWT plus current AI consent. The timezone is 1–128 characters followed by server
IANA validation. `policyVersion` is required. Existing optional
`callerLocalDate` retains its omitted/empty UTC-date fallback for transaction
parsing only; quota context must never fall back to UTC or Egypt.

Current free launch emits numeric allowance/count and a reset timestamp;
technical unmetered null-triplet compatibility is exercised only through
controlled future-entitlement doubles. Owner-approved retention is 35 elapsed
days from first server record creation, followed by safe deletion of eligible
terminal identities. Active work and current accounting are excluded; retained
identities still protect replay until actual deletion. See data-model §3 and
`reconciliation.md`.

## 5. Active approved UI repair binding gate

Do **not** create another mockup.

Before UI implementation:

1. persist the exact already-approved Add Transaction / Voice image bytes
   unchanged in `specs/389-voice-usage-limits/mockups/`;
2. create the matching canonical binding sidecar;
3. record only evidenced binding facts and mark unknowns explicitly;
4. obtain explicit approval of the sidecar metadata + combined binding revision;
5. run `node scripts/verify-mockup-binding.js <sidecar>`.

The active five-reference `mockups/repair-binding-manifest.json` supersedes the
old two-reference layout for repaired surfaces. Read every image/sidecar and
verify each exact entry. The state/component/icon map and approved sizing/copy
interpretations are in `contracts/add-transaction-ui-contract.md`; old bytes and
approvals stay frozen history.

## 6. Planned route behavior

- FAB Add Transaction -> `/add-transaction?mode=manual`
- center microphone -> `/add-transaction?mode=voice`
- onboarding Voice entry -> same Voice mode
- voice-review Retry -> same Voice mode with retry/auto-start intent
- missing/invalid mode -> Manual
- mode switching disabled during active recording/paused/finalizing/analyzing
- partially entered Manual state remains mounted across safe switches
- exhausted/burst-limited/unavailable Voice never blocks Manual

## 7. Planned mobile automated coverage

Update/add focused tests for:

- `ai-voice-parser-service` request key/timezone/refusal parsing;
- voice availability service Zod contract;
- availability hook focus/foreground/expiry refresh;
- `useVoiceTransactionFlow` known-exhausted, stale-refusal, provider-failure
  refresh, and consent interaction;
- unified Add Transaction route/user-switch isolation;
- governed UI states after mockup approval;
- EN/AR accessibility labels/roles/states;
- existing representative voice parsing regression.

## Current owner test scope — 10 October 2026

Author unit and E2E coverage; run focused unit/type/lint checks. Owner
explicitly defers emulator/device/E2E execution and rendered/accessibility
captures and will perform manual testing after source delivery. No
adb/Droidrun/device operations. E2E authoring is not execution.
T034/T035/T049/T050 and visual/accessibility T058 stay unchecked/NOT RUN. Hand
the complete task/manual matrix to owner; do not claim visual completion or
device/merge readiness.

## 8. Owner manual QA matrix

Owner validation after source/unit delivery; device/render/accessibility
evidence is NOT RUN until the owner completes and records these checks:

1. Fresh user shows 5 remaining.
2. Complete five allowed voice submissions; remaining reaches zero.
3. Sixth tap is blocked/refused without provider start.
4. Trigger 2/min burst and verify temporary state.
5. Wait past burst boundary and verify automatic recovery.
6. Change device timezone mid-active day; quota does not reset.
7. After reset boundary, verify current valid device timezone is adopted.
8. Use two devices/account sessions concurrently at the final unit.
9. Force a provider-started failure; remaining still decreases by one.
10. Force pre-provider consent/malformed refusal; remaining does not decrease.
11. Logout/login another user; allowance state changes to that user only.
12. Verify English/Arabic, LTR/RTL, light/dark, compact/ordinary phone, enlarged
    text.
13. Verify ordinary allowed voice transactions produce the same review results
    as before.

## 9. Deployment/rollback

Deployment is not part of planning.

When implementation is later approved and verified:

- apply the local SQL migration through the normal migration workflow;
- deploy the new availability Edge Function and updated `parse-voice`;
- configure server policy values;
- verify availability first;
- smoke-test voice within allowance.

Rollback must preserve server ledger integrity; do not simply remove the server
quota gate while leaving UI claims active.

## 10. Add Transaction manual/voice QA additions

| Scenario                                 | Expected                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Manual idle/focus amount                 | ordinary grouped field; custom keypad only on focus; no native soft keyboard            |
| Done versus header Save                  | Done resolves/dismisses without a save; header Save validates/persists once             |
| Transfer amount focus                    | source/target amounts retain separate focus/currency/conversion behavior                |
| Manual under every blocked Voice state   | no quota/failure notice; local offline save remains usable                              |
| Locale-specific Voice idle/daily layouts | compare all five active references; preserve each locale composition                    |
| Responsive and enlarged text             | compact/ordinary/tablet/landscape; font scales1.35/2; required markers and bottom inset |
| Accessibility                            | separate roles/names/focus/hidden-tree/keypad/recovery proof; screenshot insufficient   |
| FAB Add Transaction                      | unified page opens in Manual                                                            |
| Center mic                               | unified page opens in Voice                                                             |
| Partially fill Manual -> Voice -> Manual | Manual input remains                                                                    |
| Start recording                          | mode switching disabled until safe state                                                |
| Voice exhausted -> Manual                | Manual remains fully usable                                                             |
| Arabic                                   | approved RTL design + localized usage copy                                              |
| English                                  | approved LTR design                                                                     |
| Voice-review Retry                       | unified page Voice mode resumes retry intent                                            |

User-facing reset copy must match local-midnight semantics and must not say
"tomorrow at the same time".
