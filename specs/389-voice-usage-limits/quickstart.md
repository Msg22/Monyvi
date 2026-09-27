# Quickstart: Voice Usage Limits and Subscription-Ready Entitlements

**Feature**: 389-voice-usage-limits

This is planning/QA guidance. Production implementation must not begin until required voice-limit mockups and binding metadata are explicitly approved.

## 1. Planned server policy configuration

Free-launch defaults:

~~~text
VOICE_AI_DAILY_LIMIT=5
VOICE_AI_BURST_LIMIT=2
VOICE_AI_BURST_WINDOW_SECONDS=60
VOICE_AI_RESERVATION_LEASE_SECONDS=120
VOICE_AI_POLICY_VERSION=free-launch-v1
~~~

Values are server-side operational policy. No mobile release should be required to change them.

The current voice provider configuration remains unchanged.

## 2. Planned local-first migration workflow

The implementation will create a normal SQL migration in `supabase/migrations/` for:

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

| Scenario | Expected |
| --- | --- |
| Uses 1–5 in same accepted local day | provider start allowed |
| Sixth request | daily_limit before provider call |
| Two starts within minute | allowed |
| Third start within minute | burst_limit before provider call |
| Two devices race for final daily unit | exactly one provider start |
| Same requestKey transport replay | no second provider call/unit |
| Auth/consent/malformed audio failure | zero consumption |
| Missing/invalid timezone | zero provider start, fail closed |
| Missing/invalid entitlement config | zero provider start, fail closed |
| Provider succeeds after start | one consumed |
| Provider fails after start | one consumed |
| Provider times out after start | one consumed |
| Provider returns invalid JSON after start | one consumed |
| Gemini internally retries | still one consumed |
| DST 23-hour local day | correct next local midnight |
| DST 25-hour local day | correct next local midnight |
| Device timezone changes mid-window | active window/reset does not reset |
| First request after old window expires | new valid device timezone adopted |
| Availability storage unavailable | 503/fail closed |
| User switch on same device | no foreign allowance state |

Provider calls in routine quota tests are doubles; do not consume Gemini quota.

## 4. Planned client contract

The mobile service sends:

- existing audio/categories/accounts/callerLocalDate;
- new stable `requestKey`;
- new `callerTimeZone` from the device IANA timezone.

The successful voice response shape remains unchanged.

A separate `voice-ai-availability` service/hook reads the authoritative state and refreshes on focus/foreground, after voice attempts, and at reset/burst boundaries.

## 5. UI/mockup approval gate

Before UI implementation, create and approve scoped mockups + binding sidecars for the voice entry surface.

At minimum review:

- available with remaining count;
- last/low remaining if distinct;
- exhausted until next local day;
- temporary burst limit;
- authoritative availability unavailable/recovery;
- recording/analyzing interaction;
- English + Arabic/RTL;
- light + dark;
- compact/ordinary phone;
- enlarged text and accessibility semantics;
- tablet/landscape behavior if the existing tab-bar/overlay surface is supported there.

Do not infer whether the count belongs on the mic button, tab bar, recording sheet, or another element until the mockup is approved.

## 6. Planned mobile automated coverage

Update/add focused tests for:

- `ai-voice-parser-service` request key/timezone/refusal parsing;
- voice availability service Zod contract;
- availability hook focus/foreground/expiry refresh;
- `useVoiceTransactionFlow` known-exhausted, stale-refusal, provider-failure refresh, and consent interaction;
- tab layout user-switch isolation;
- governed UI states after mockup approval;
- EN/AR accessibility labels/roles/states;
- existing representative voice parsing regression.

## 7. Manual QA matrix

After implementation and approved visual evidence:

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
12. Verify English/Arabic, LTR/RTL, light/dark, compact/ordinary phone, enlarged text.
13. Verify ordinary allowed voice transactions produce the same review results as before.

## 8. Deployment/rollback

Deployment is not part of planning.

When implementation is later approved and verified:

- apply the local SQL migration through the normal migration workflow;
- deploy the new availability Edge Function and updated `parse-voice`;
- configure server policy values;
- verify availability first;
- smoke-test voice within allowance.

Rollback must preserve server ledger integrity; do not simply remove the server quota gate while leaving UI claims active.
