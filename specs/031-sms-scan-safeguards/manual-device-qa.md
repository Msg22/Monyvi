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

**Best verification:** physical device, followed by the deterministic profile.

**Physical-device steps:**

1. Stop Metro and start `cutoff-boundary-v1` with the physical-device command.
2. Open the development build and sign in as the primary manual QA user.
3. Open **SMS Scan** and select **Sync new SMS**.
4. Wait for Scan Complete, expand the **QA ONLY** panel, and confirm the
   selected profile is `cutoff-boundary-v1`.
5. Confirm the panel reports two simulated-AI results, no deferred or oversized
   candidate, and a cutoff boundary.
6. Open **Review transactions** and confirm exactly two suggestions are present.
7. Go back without saving and repeat **Sync new SMS** in the same Metro session.
8. Confirm the fixture older than the cutoff never appears on either run.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario cutoff-boundary-v1
```

1. Run the command after the device check.
2. Confirm `status: "passed"`.
3. Confirm `filteredOutCount: 1`, `admittedCount: 2`, and `aiCount: 2`.
4. Confirm `productionProviderCallCount: 0` and
   `productionAllowanceChargeCount: 0`.

**Pass criteria:** one fixture exactly at the one-day boundary and one
immediately after it are included. The fixture one millisecond before the
boundary is excluded. Two suggestions remain reviewable and no production
provider is called.

**Edge cases:** fixture timestamps must stay stable for the Metro run. Do not
clear app data or restart Metro between the first and repeated scan. Restart
Metro only when beginning a fresh cutoff test.

### 2. `checkpoint-overlap-v1`

**Purpose:** proves an incremental scan rereads a small overlap, deduplicates
saved work by fingerprint, and preserves unsaved suggestions for review.

**Best verification:** physical device, followed by the deterministic profile.

**Physical-device steps:**

1. Stop Metro and start `checkpoint-overlap-v1`.
2. Sign in as the primary manual QA user.
3. Run **Sync new SMS** and open **Review transactions**.
4. Confirm the first scan contains four suggestions: one trusted-local result
   and three simulated-AI results.
5. Select and save exactly two simulated-AI suggestions.
6. Leave the trusted-local suggestion and one simulated-AI suggestion
   unselected.
7. Confirm saving navigates directly to Transactions.
8. Return to **SMS Scan** without restarting Metro and run **Sync new SMS**
   again.
9. Open review results and confirm only the two unsaved suggestions return.
10. Confirm the two saved fingerprints do not produce duplicate suggestions or
    financial records.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario checkpoint-overlap-v1
```

1. Run the command after the physical-device journey.
2. Confirm `status: "passed"`.
3. Confirm the profile uses an incremental boundary with its configured overlap.
4. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** saved work stays absent, unsaved review work returns, and no
capacity warning appears. If all four suggestions return, fingerprint
deduplication regressed. If only the trusted-local result returns, simulated-AI
admission or allowance behavior regressed.

**Edge cases:** do not clear app data, reset the profile, restart Metro, or
switch users between the two scans. Those actions intentionally change the state
whose continuity this profile verifies.

### 3. `partial-quota-v1`

**Purpose:** proves accepted local and simulated-AI work survives when reduced
per-scan AI capacity refuses remaining candidates.

**Best verification:** physical device and automated profile.

**Physical-device steps:**

1. Stop Metro and start `partial-quota-v1`.
2. Sign in as the primary manual QA user.
3. Open **SMS Scan** and run **Sync new SMS**.
4. On Scan Complete, confirm six financial candidates were considered.
5. Expand the **QA ONLY** panel.
6. Confirm one trusted-local result, two simulated-AI results, and two deferred
   AI candidates are reported.
7. Open **Review transactions**.
8. Confirm three successful suggestions are visible and Save is enabled.
9. Confirm a friendly partial-results notice explains that remaining messages
   can be tried later without mentioning quotas, plans, or Gemini.
10. Save the available suggestions and confirm navigation goes directly to
    Transactions without briefly showing the empty review state.
11. Stop Metro, rerun the same profile command, and confirm the clean run
    reproduces the expected first-scan result.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario partial-quota-v1
```

1. Confirm `status: "passed"`.
2. Confirm accepted work remains present when later work is refused.
3. Confirm checkpoint decision holds incomplete work.
4. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** three successful suggestions remain reviewable, two
AI-eligible candidates remain deferred, Save stays enabled, and partial work is
not lost.

**Edge cases:** no raw SMS, provider details, plan name, or paywall appears in
the user-facing partial-results notice. Local result must remain reviewable even
if all simulated-AI capacity is unavailable.

### 4. `rolling-expiry-v1`

**Purpose:** proves rolling AI capacity returns after reduced-window usage
expires without waiting for real time.

**Best verification:** deterministic automated profile.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario rolling-expiry-v1
```

3. Confirm `status: "passed"`.
4. Confirm the runner first consumes the reduced rolling allowance.
5. Confirm controlled time advances beyond the two-minute QA rolling window.
6. Confirm a later request is admitted after earlier usage expires.
7. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** work is refused only while the reduced rolling window is
full, then admitted after controlled expiry without deleting unrelated state.

**Edge cases:** do not use a physical-device wait as proof. Device clock, Metro
restart, and real rolling allowance cannot reproduce this deterministic time
advance honestly.

### 5. `shared-batch-live-v1`

**Purpose:** proves batch scan and live SMS consume one shared SMS AI allowance;
voice remains separate.

**Best verification:** deterministic automated profile.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario shared-batch-live-v1
```

3. Confirm `status: "passed"`.
4. Confirm batch work is admitted first and consumes shared SMS AI capacity.
5. Confirm later live-SMS work sees the remaining shared capacity and is refused
   when that shared boundary is reached.
6. Confirm no voice capability usage is recorded.
7. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** batch and live SMS cannot each spend an independent full
allowance. Voice remains outside this SMS-specific ledger.

**Edge cases:** controlled concurrent events are required. Do not infer
correctness from one manual batch scan or from a device notification alone.

### 6. `burst-limit-v1`

**Purpose:** proves repeated provider-start attempts hit a short frequency
boundary before simulated provider work begins.

**Best verification:** deterministic automated profile.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario burst-limit-v1
```

3. Confirm `status: "passed"`.
4. Confirm the first provider-start attempt is admitted.
5. Confirm the second immediate provider-start attempt is refused by
   `burst_limit`.
6. Confirm refused work does not increment simulated provider calls.
7. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** rapid provider starts are blocked before simulated provider
execution while earlier accepted work remains intact.

**Edge cases:** candidate allowance and burst allowance are different. A refusal
here must not mean an ordinary quota consumption or destroy earlier results.

### 7. `history-cooldown-v1`

**Purpose:** proves **Rescan recent messages** has a cooldown after admitted
full-parser work, while ordinary incremental sync remains usable.

**Best verification:** physical device and automated profile.

**Physical-device steps:**

1. Stop Metro and start `history-cooldown-v1`.
2. Sign in as the primary manual QA user.
3. Open **Settings** and select **Rescan recent messages**.
4. Complete the scan that admits simulated-AI work.
5. Expand the **QA ONLY** panel and confirm the active boundary is
   `history_cooldown`.
6. Return to Settings.
7. Confirm **Rescan recent messages** remains visible but is disabled until the
   displayed absolute availability time.
8. Confirm **Sync new SMS** remains available.
9. Attempt an ordinary incremental sync and confirm it is not blocked merely
   because the history rescan is cooling down.
10. Use the standalone reset command if you need to clear this profile's
    server-backed cooldown without restarting Metro:

    ```powershell
    npm run mobile:dev:sms-safeguards:reset -- --scenario history-cooldown-v1
    ```

11. Reload the app after reset and confirm history rescan becomes available.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario history-cooldown-v1
```

1. Confirm `status: "passed"`.
2. Confirm admitted full-parser work starts the reduced two-minute cooldown.
3. Confirm a later history attempt is refused while the ordinary incremental
   capability remains separate.
4. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** cooldown begins only after full-parser work is admitted,
history rescan shows an absolute retry time, and ordinary incremental sync
remains usable.

**Edge cases:** force a local-only scan if available, then confirm no history
cooldown appears. Do not expect live countdown text; only localized absolute
availability time is valid. Resetting profile state does not require restarting
Metro, but the app must reload availability after reset.

### 8. `oversized-candidate-v1`

**Purpose:** proves one candidate over payload/input boundary is skipped locally
while other results remain usable.

**Best verification:** physical device and automated profile.

**Physical-device steps:**

1. Stop Metro and start `oversized-candidate-v1`.
2. Sign in as the primary manual QA user.
3. Open **SMS Scan** and run **Sync new SMS**.
4. Wait for Scan Complete and confirm four financial candidates were evaluated.
5. Expand the **QA ONLY** panel.
6. Confirm one trusted-local result, two simulated-AI results, one oversized
   candidate, and no deferred AI candidate.
7. Open **Review transactions** and confirm exactly three suggestions are
   present.
8. Confirm the partial-results notice reports one unprocessed message without
   exposing its body.
9. Go back without saving and repeat the scan in the same Metro session.
10. Confirm the oversized fingerprint is still excluded from provider work and
    the three valid suggestions remain available unless already saved.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario oversized-candidate-v1
```

1. Confirm `status: "passed"`.
2. Confirm `oversizedCount: 1`.
3. Confirm the oversized candidate is refused before provider execution.
4. Confirm successful candidates still produce results.
5. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** three valid suggestions remain reviewable, one oversized
message is reported in aggregate, and oversized content never reaches the
simulated or production provider.

**Edge cases:** repeat scan without saving. Oversized fixture remains excluded
from AI. A user-facing empty state is valid only if no other suggestion
succeeded; this profile normally includes successful suggestions.

### 9. `response-validity-v1`

**Purpose:** proves malformed, incomplete, duplicate, unknown, delayed,
cancelled, and low-trust simulated provider output cannot create unsafe review
records.

**Best verification:** deterministic automated profile.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario response-validity-v1
```

3. Confirm `status: "passed"`.
4. Confirm the profile exercises malformed, incomplete, duplicate, unknown,
   delayed, cancelled, and low-trust simulated responses.
5. Confirm only complete, recognized, trusted results are accepted.
6. Confirm malformed or incomplete output increases aggregate invalid/refused
   diagnostics but creates no financial suggestion.
7. Confirm unresolved work prevents checkpoint advancement.
8. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** invalid provider output cannot become reviewable, cannot
create a negative strike, and cannot advance checkpoint as completed work.

**Edge cases:** malformed output must not count as a terminal non-transaction
strike. Cancellation and retryable failure must not move checkpoint beyond
unresolved work. This profile needs controlled provider envelopes, so a manual
device scan is not honest proof.

### 10. `negative-three-strikes-v1`

**Purpose:** proves three valid AI non-transaction outcomes make a fingerprint
terminally ineligible for later AI submission.

**Best verification:** deterministic automated profile. Device use is useful
only for observing aggregate guidance, not proving all strike transitions.

**Automated steps:**

1. Reset the profile if a previous device session used it:

   ```powershell
   npm run mobile:dev:sms-safeguards:reset -- --scenario negative-three-strikes-v1
   ```

2. Run:

```powershell
npm run test:sms-safeguards -- --scenario negative-three-strikes-v1
```

3. Confirm `status: "passed"`.
4. Confirm first valid explicit negative records strike one.
5. Confirm second valid explicit negative records strike two.
6. Confirm third valid explicit negative records strike three and terminal
   suppression.
7. Confirm a later attempt for the terminal fingerprint performs no provider
   call.
8. Confirm failed or malformed responses create no strike.
9. Confirm production provider and production allowance counts remain zero.

**Optional physical-device observation:**

1. Start `negative-three-strikes-v1`.
2. Run the history scan and expand the **QA ONLY** panel.
3. Confirm only aggregate negative/terminal information appears.
4. Do not use repeated button taps as proof of exact strike order; server-backed
   capacity and profile state can alter what the device run admits.

**Pass criteria:** third valid negative becomes terminal, terminal state blocks
future AI work, and invalid provider responses never create a strike.

**Edge cases:** terminal state persists beyond rolling window and across
installs. It may not block an exact trusted-local template match.

### 11. `terminal-fresh-install-v1`

**Purpose:** proves synchronized terminal AI-negative state blocks provider
submission from a fresh simulated installation for same user.

**Best verification:** deterministic automated profile.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario terminal-fresh-install-v1
```

3. Confirm `status: "passed"`.
4. Confirm the simulated fresh installation begins without the local terminal
   row.
5. Confirm synchronized server terminal state is loaded for the same user.
6. Confirm the matching candidate is refused before provider execution.
7. Confirm simulated and production provider call counts remain zero for the
   terminal candidate.

**Pass criteria:** clearing local installation state cannot bypass synchronized
terminal suppression for the same authenticated user.

**Edge cases:** clearing app data is not a valid manual substitute. This test
needs controlled installation identity and synchronized server outcome.

### 12. `trusted-local-recovery-v1`

**Purpose:** proves an exact trusted template can remain useful after a terminal
AI-negative outcome without calling AI again.

**Best verification:** physical-device observation, followed by deterministic
automation.

**Physical-device steps:**

1. Stop Metro and start `trusted-local-recovery-v1`.
2. Sign in as the primary manual QA user.
3. Open **SMS Scan** and run **Sync new SMS**.
4. Expand the **QA ONLY** panel.
5. Confirm one trusted-local result and zero simulated-AI results are reported.
6. Open **Review transactions** and confirm the exact trusted-template
   transaction is reviewable.
7. Confirm no partial-results or capacity notice appears.
8. Repeat the scan without saving and confirm the result remains locally
   recoverable without provider use.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario trusted-local-recovery-v1
```

1. Confirm `status: "passed"`.
2. Confirm `localCount: 1`, `aiCount: 0`, and `simulatedProviderCallCount: 0`.
3. Confirm production provider and production allowance counts remain zero.

**Pass criteria:** exact trusted local match remains useful despite terminal AI
history and does not call AI again.

**Edge cases:** broad or ambiguous local match must not override terminal AI
state. Only exact trusted template recovery is allowed.

### 13. `account-switch-v1`

**Purpose:** proves safeguard state belongs to one authenticated user and never
leaks through local rows, cache, or server allowance.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario account-switch-v1
```

1. Confirm `status: "passed"`.
2. Confirm the temporary second user starts with independent work, usage,
   checkpoint, and outcome state.
3. Confirm the temporary user is removed after automated verification.
4. Confirm production provider and production allowance counts remain zero.

**Physical-device steps:**

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

**Pass criteria:** each user sees only their own review state and safeguard
usage. Switching accounts neither resets nor exposes the other user's state.

**Edge cases:** no checkpoint, negative outcome, allowance, review suggestion,
or profile marker from first user may influence second user. Re-running the
launch command must update seeded data without replacing either remote profile
ID or causing a `profiles_user_id_key` sync conflict.

### 14. `consent-required-v1`

**Purpose:** proves server rejects AI work before reservation or provider start
when current user has withdrawn AI-processing consent.

**Best verification:** deterministic profile, followed by a device consent-flow
check.

**Automated steps:**

1. Ensure local Supabase is running.
2. Run:

```powershell
npm run test:sms-safeguards -- --scenario consent-required-v1
```

3. Confirm `status: "passed"`.
4. Confirm consent is disabled before the scan-session initialization request.
5. Confirm no allowance reservation, provider start, or financial suggestion is
   created.
6. Confirm simulated and production provider call counts remain zero.
7. Confirm the runner restores the user's original consent state after the
   profile completes.

**Physical-device steps:**

1. Stop Metro and start `consent-required-v1`.
2. Sign in as the primary manual QA user.
3. Disable AI transaction features in Settings if the profile has not already
   applied the consent state.
4. Open **SMS Scan**.
5. Confirm the existing general AI consent UI appears before AI work.
6. Choose **Not now** and confirm the scan does not start paid/simulated
   provider work.
7. Re-enable consent through the approved flow and confirm AI-dependent actions
   become available again.

**Pass criteria:** consent rejection occurs before reservation and provider
execution, while approved local-only behavior remains available.

**Edge cases:** reject must happen before expensive work. A local-only result
may remain available; consent gate only blocks AI capability.

### 15. `prompt-token-baseline-v1`

**Purpose:** proves local token estimation rejects a request before provider
work when compact prompt framing plus candidates exceed a small QA boundary.

**Best verification:** physical-device aggregate observation, followed by
deterministic automation.

**Physical-device steps:**

1. Stop Metro and start `prompt-token-baseline-v1`.
2. Sign in as the primary manual QA user.
3. Open **SMS Scan** and run **Sync new SMS**.
4. Expand the **QA ONLY** panel.
5. Confirm the active input-token boundary is the deliberately small QA value.
6. Confirm over-boundary work is reported only as aggregate skipped/refused
   work.
7. Confirm no raw SMS, prompt text, tokenized content, or provider response
   appears in the panel.
8. Confirm no transaction is created from work rejected by local estimation.

**Automated steps:**

```powershell
npm run test:sms-safeguards -- --scenario prompt-token-baseline-v1
```

1. Confirm `status: "passed"`.
2. Confirm local input estimation rejects the request before provider work.
3. Confirm the oversized/input-boundary outcome is recorded.
4. Confirm `simulatedProviderCallCount: 0`, `productionProviderCallCount: 0`,
   and `productionAllowanceChargeCount: 0`.

**Pass criteria:** local estimation stops over-boundary work before any provider
call and exposes only privacy-safe aggregate diagnostics.

**Edge cases:** this is not Gemini token counting and needs no Gemini key.
Prompt reduction must never silently lower validation quality merely to fit
input.

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
