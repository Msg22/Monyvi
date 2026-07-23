# Manual Device And Profile QA

This guide explains how to run every deterministic SMS safeguard profile. It is
intended for development builds only. Safeguard QA always uses a fixture SMS
inbox and simulated provider: it never reads the device inbox, calls Gemini, or
consumes a production allowance.

## Before You Start

1. Check out the branch that contains the safeguard changes.
2. Ensure Docker Desktop is running.
3. Ensure the local database is current and the manual QA user exists:

   ```powershell
   npm run supabase:start:local
   npm run db:migrate
   npm run local:reset-and-seed
   ```

4. Install a Monyvi development build on the physical device. Expo Go cannot
   exercise the SMS-native flow.
5. Keep the phone and computer on the same network. Wireless mode starts an
   ngrok tunnel for local Supabase and uses Metro LAN access.
6. Local wireless launchers use one stable local-only auth storage key even when
   ngrok assigns a new URL. After first using a build with this behavior, sign
   in once; later profile launches preserve that local session. If local auth
   data was reset, the app returns to sign-in instead of continuing with an
   invalid Edge Function session.
7. Sign in with the local manual QA account when the app opens:

   ```text
   Email: manual-qa@monyvi.test
   Password: 123456
   ```

Use only one safeguard profile per Metro session. Stop Metro with `Ctrl+C`
before switching profiles.

## Command Reference

| Goal                                          | Command                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Run every profile deterministically           | `npm run test:sms-safeguards`                                                  |
| Run one profile deterministically             | `npm run test:sms-safeguards -- --scenario <profile-id>`                       |
| Start a physical-device QA session            | `npm run mobile:dev:sms-safeguards:wireless-device -- --scenario <profile-id>` |
| Reset one server-backed profile without Metro | `npm run mobile:dev:sms-safeguards:reset -- --scenario <profile-id>`           |
| Inspect the profile list and policy source    | `packages/logic/src/sms-safeguards/safeguard-qa-scenarios.ts`                  |

The device launcher automatically resets the selected profile before Metro
starts. The standalone reset command is useful only when you want a clean
server-backed profile state without restarting Metro.

`reset` is not a database reset. It removes only the selected profile's local QA
scan session, namespaced work requests and usage events, and that profile's
fixture fingerprints from negative outcomes. It never deletes ordinary manual-QA
financial data.

## Common Device Procedure

Use these steps for every profile that has a device-visible journey.

1. Stop any existing Metro session with `Ctrl+C`.
2. Start the selected profile, replacing `<profile-id>`:

   ```powershell
   npm run mobile:dev:sms-safeguards:wireless-device -- --scenario <profile-id>
   ```

3. Open or reload the installed development build on the device.
4. Sign in with `manual-qa@monyvi.test` if required.
5. Follow the profile-specific steps below.
6. When checking Metro diagnostics, confirm `mode: "hybrid"` and that no real
   device inbox or Gemini provider is used. Safeguard QA uses a fixture inbox
   and simulated provider by design.
7. Confirm the collapsed **QA only** panel identifies the selected profile and
   version. Expand it only to compare aggregate counts and active test
   boundaries with the profile expectation; it must never show an SMS, sender,
   merchant, financial value, fingerprint, prompt, or provider response.
8. To repeat a profile from a clean state, stop Metro and rerun the same start
   command. Do not clear the app's data unless the profile explicitly says to
   test an installation boundary.

## Profile Guide

### How To Read A Profile

Every profile has one narrow safeguard purpose. Do not combine profiles in one
Metro session. The expanded **QA ONLY** panel is the fastest device-side source
of truth:

- **What this profile tests** explains the one boundary under test.
- **Expected this run** lists aggregate results or a blocked condition that the
  profile should create.
- **Must not happen** names the regression the profile is designed to catch.
- **Observed this scan** reports only aggregate local, simulated-AI, deferred,
  or skipped counts. Compare it with the expected section.
- **Active safeguards** shows deliberately reduced development limits. They are
  not production limits and do not use Gemini.

Counts may reduce after you save suggestions because saved fingerprints are
deduplicated. Restarting Metro with the same profile creates a new, clean QA
run. A warning is expected only in profiles that explicitly exercise a limit,
cooldown, oversized candidate, or provider-validity failure.

### 1. `cutoff-boundary-v1`

**Purpose:** proves the recent-history cutoff is inclusive at its exact boundary
and excludes older SMS before parsing.

**Best verification:** physical device, then deterministic command.

```powershell
npm run test:sms-safeguards -- --scenario cutoff-boundary-v1
```

Device steps:

1. Start `cutoff-boundary-v1`, open **SMS Scan**, then select **Sync new SMS**.
2. Expand the QA panel after completion.
3. Open review results.

Expected: two eligible fixture suggestions are reviewable. One fixture exactly
at the one-day boundary is included; one immediately after it is included; one
one millisecond before it is absent. Panel shows cutoff-boundary purpose and no
real inbox or Gemini activity.

Edge cases: repeat the scan before saving. Fixture timestamps must stay stable
for this Metro run; do not expect the previously excluded older fixture to
appear. Restart Metro before a fresh cutoff run.

### 2. `checkpoint-overlap-v1`

**Purpose:** proves an incremental scan rereads a small overlap, deduplicates
saved work by fingerprint, and preserves unsaved suggestions for review.

**Best verification:** physical device, then deterministic command.

```powershell
npm run test:sms-safeguards -- --scenario checkpoint-overlap-v1
```

Device steps:

1. Start fresh profile and run **Sync new SMS**. Expect four suggestions: one
   trusted local and three simulated-AI.
2. Save exactly two simulated-AI suggestions. Leave one simulated-AI and the
   local suggestion unselected.
3. Run **Sync new SMS** again without restarting Metro.

Expected: only two unsaved suggestions return. Saved two remain absent. No
capacity warning appears. QA panel identifies checkpoint overlap and reports
stable fixture behavior.

Edge cases: do not clear app data between scans; that changes test state. If all
four return, fingerprint stability regressed. If only local result returns, QA
allowance or simulated provider admission regressed.

### 3. `partial-quota-v1`

**Purpose:** proves accepted local and simulated-AI work survives when reduced
per-scan AI capacity refuses remaining candidates.

**Best verification:** physical device and automated profile.

1. Start the device session with `partial-quota-v1`.
2. Open **SMS Scan** and run **Sync new SMS**.
3. Expand QA panel and confirm its expected/observed reduced allowance state.
4. Open review results and save available suggestions.

Expected result:

- A trusted local suggestion and accepted simulated-AI suggestions remain
  reviewable.
- A friendly partial-results notice explains that some messages could not be
  processed now.
- Panel shows deferred AI work and the active reduced scan allowance.
- Save remains enabled for the successful suggestions.
- Saving navigates directly to Transactions without briefly showing the empty
  review page.
- A later clean profile launch reproduces the same result; earlier allowance or
  negative-outcome state must not leak into the new run.

Edge cases: no raw SMS, provider details, plan name, or paywall appears in the
user-facing partial-results notice. Local result must remain reviewable even if
all simulated-AI capacity is unavailable.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario partial-quota-v1
```

### 4. `rolling-expiry-v1`

**Purpose:** proves rolling AI capacity returns after reduced-window usage
expires without waiting for real time.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario rolling-expiry-v1
```

Expected: `status: "passed"`. Runner first exhausts reduced capacity, advances
controlled time beyond its two-minute QA window, then admits work again.

Edge cases: do not use a physical-device wait as proof. Device clock, Metro
restart, and real rolling allowance cannot reproduce this deterministic time
advance honestly.

### 5. `shared-batch-live-v1`

**Purpose:** proves batch scan and live SMS consume one shared SMS AI allowance;
voice remains separate.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario shared-batch-live-v1
```

Expected: `status: "passed"`. Batch work consumes reduced allowance; live SMS
then sees same remaining budget. Voice is not charged by this profile.

Edge cases: controlled concurrent events are required. Do not infer correctness
from one manual batch scan or from a device notification alone.

### 6. `burst-limit-v1`

**Purpose:** proves repeated provider-start attempts hit a short frequency
boundary before simulated provider work begins.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario burst-limit-v1
```

Expected: `status: "passed"`. First provider-start is admitted; later burst
attempt is refused before provider execution.

Edge cases: candidate allowance and burst allowance are different. A refusal
here must not mean an ordinary quota consumption or destroy earlier results.

### 7. `history-cooldown-v1`

**Purpose:** proves **Rescan recent messages** has a cooldown after admitted
full-parser work, while ordinary incremental sync remains usable.

**Best verification:** physical device and automated profile.

1. Start the device session with `history-cooldown-v1`.
2. Open **Settings** and select **Rescan recent messages**.
3. Complete the scan that admits simulated AI work.
4. Return to Settings.
5. Expand QA panel after scan and compare active history cooldown with observed
   state.

Expected result:

- **Rescan recent messages** remains visible but is disabled until its displayed
  absolute availability time.
- **Sync new SMS** remains available.
- The cooldown begins only after full-parser work is admitted; local-only work
  must not create it.

Edge cases: force a local-only scan if available, then confirm no history
cooldown appears. Do not expect live countdown text; only localized absolute
availability time is valid.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario history-cooldown-v1
```

### 8. `oversized-candidate-v1`

**Purpose:** proves one candidate over payload/input boundary is skipped locally
while other results remain usable.

**Best verification:** physical device and automated profile.

1. Start the device session with `oversized-candidate-v1`.
2. Open **SMS Scan** and run **Sync new SMS**.
3. Expand the QA panel and compare expected versus observed counts.
4. Open the review results.

Expected result:

- Successful trusted-local and simulated-AI suggestions remain visible.
- The partial-results notice reports one message that could not be processed.
- The oversized fixture produces no transaction and is never sent to the
  simulated provider.
- The warning is aggregate-only; it must not reveal the oversized SMS body.

Edge cases: repeat scan without saving. Oversized fixture remains excluded from
AI. A user-facing empty state is valid only if no other suggestion succeeded;
this profile normally includes successful suggestions.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario oversized-candidate-v1
```

### 9. `response-validity-v1`

**Purpose:** proves malformed, incomplete, duplicate, unknown, delayed,
cancelled, and low-trust simulated provider output cannot create unsafe review
records.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario response-validity-v1
```

Expected: `status: "passed"`. Only complete, recognized, trusted results become
reviewable. Invalid output increases aggregate diagnostics only.

Edge cases: malformed output must not count as a terminal non-transaction
strike. Cancellation and retryable failure must not move checkpoint beyond
unresolved work.

### 10. `negative-three-strikes-v1`

**Purpose:** proves three valid AI non-transaction outcomes make a fingerprint
terminally ineligible for later AI submission.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario negative-three-strikes-v1
```

Expected: `status: "passed"`. First and second valid AI negatives remain
eligible only for permitted history retry; third is terminal. Failed or
malformed responses create no strike.

Edge cases: terminal state persists beyond rolling window and across installs.
It may not block an exact trusted-local template match.

### 11. `terminal-fresh-install-v1`

**Purpose:** proves synchronized terminal AI-negative state blocks provider
submission from a fresh simulated installation for same user.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario terminal-fresh-install-v1
```

Expected: `status: "passed"`. Fresh installation has no local terminal row but
still receives server-side refusal before provider work.

Edge cases: clearing app data is not a valid manual substitute. This test needs
controlled installation identity and synchronized server outcome.

### 12. `trusted-local-recovery-v1`

**Purpose:** proves an exact trusted template can remain useful after a terminal
AI-negative outcome without calling AI again.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario trusted-local-recovery-v1
```

Expected: `status: "passed"`. Exact local match creates one local suggestion;
provider call count remains zero.

Edge cases: broad or ambiguous local match must not override terminal AI state.
Only exact trusted template recovery is allowed.

### 13. `account-switch-v1`

**Purpose:** proves safeguard state belongs to one authenticated user and never
leaks through local rows, cache, or server allowance.

**Automated verification:**

```powershell
npm run test:sms-safeguards -- --scenario account-switch-v1
```

Expected: `status: "passed"`. Second user starts with independent state; cleanup
removes test user after verification.

**Physical-device verification:**

```powershell
npm run mobile:dev:sms-safeguards:wireless-device -- --scenario account-switch-v1
```

This profile seeds two persistent local-only users:

| User      | Email                             | Password |
| --------- | --------------------------------- | -------- |
| Primary   | `manual-qa@monyvi.test`           | `123456` |
| Secondary | `manual-qa-secondary@monyvi.test` | `123456` |

1. Sign in as the primary user.
2. Run SMS Scan and open Review Transactions. Record suggestion count and any
   QA-only allowance/checkpoint diagnostics.
3. Leave at least one suggestion unsaved so user-local review state exists.
4. Sign out from Settings.
5. Sign in as the secondary user.
6. Open SMS Scan. Confirm primary user's unsaved suggestions, checkpoint,
   negative outcomes, and consumed allowance do not appear or restrict this
   user.
7. Run a scan as the secondary user and record its diagnostics.
8. Sign out, then sign back in as the primary user.
9. Confirm primary user's own state remains intact and secondary user's state
   does not appear.

Edge cases: no checkpoint, negative outcome, allowance, review suggestion, or
profile marker from first user may influence second user. Re-running the launch
command must update seeded data without replacing either remote profile ID or
causing a `profiles_user_id_key` sync conflict.

### 14. `consent-required-v1`

**Purpose:** proves server rejects AI work before reservation or provider start
when current user has withdrawn AI-processing consent.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario consent-required-v1
```

Expected: `status: "passed"`. No allowance reservation, provider call, or
financial suggestion is created while consent is disabled. Original consent is
restored after test.

Edge cases: reject must happen before expensive work. A local-only result may
remain available; consent gate only blocks AI capability.

### 15. `prompt-token-baseline-v1`

**Purpose:** proves local token estimation rejects a request before provider
work when compact prompt framing plus candidates exceed a small QA boundary.

**Best verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario prompt-token-baseline-v1
```

Expected: `status: "passed"`. Local estimator records oversized/input-boundary
outcome; simulated provider call count remains zero.

Edge cases: this is not Gemini token counting and needs no Gemini key. Prompt
reduction must never silently lower validation quality merely to fit input.

## Post-Test Checks

After any device-visible scenario:

1. Confirm that the tested suggestion count and warning match the profile's
   expectation above.
2. Confirm that the app did not read the phone's real inbox.
3. Confirm that the app did not call Gemini or consume a production allowance.
4. Stop Metro before choosing another profile.
5. Record the profile ID, command, observed result, and any Metro diagnostics in
   the PR manual QA evidence.

## Troubleshooting

| Symptom                                       | Action                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Local Supabase must be running`              | Run `npm run supabase:start:local`, then retry.                                                                                       |
| Manual QA user is unavailable                 | Run `npm run local:reset-and-seed`.                                                                                                   |
| Reset fails before Metro starts               | Confirm the latest branch is checked out, then run the standalone reset command once.                                                 |
| Device cannot reach local Supabase            | Confirm the phone and computer share a network and ngrok is installed/authenticated.                                                  |
| Results differ after a clean launcher restart | Stop Metro, rerun the same profile command, and capture Metro diagnostics; profile state should reset automatically.                  |
| A profile has no honest device action         | Use its automated command. Do not try to recreate server concurrency, installation identity, or simulated provider outcomes manually. |
