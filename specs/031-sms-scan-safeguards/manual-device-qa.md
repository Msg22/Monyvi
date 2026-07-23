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
6. Sign in with the local manual QA account when the app opens:

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

### 1. `cutoff-boundary-v1`

**Primary verification:** physical device and deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario cutoff-boundary-v1
```

Expected result: the command exits successfully with `status: "passed"`. On a
device, run **Sync new SMS** and confirm two reviewable simulated suggestions
are returned: the message immediately before the cutoff is excluded, while the
messages exactly at and immediately after the active scan cutoff are included.
The fixture preserves these relative offsets against the first scan in this
Metro QA run so the local Edge Function accepts the same authenticated window
and later scans retain stable fingerprints.

### 2. `checkpoint-overlap-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario checkpoint-overlap-v1
```

Expected result: `status: "passed"`. It proves that an ordinary incremental scan
starts from the stored checkpoint overlap, still checks fingerprints, and does
not treat a checkpoint as permission to ignore unknown messages.

Device follow-up: start a fresh `checkpoint-overlap-v1` session, save two
simulated-AI suggestions, leave one simulated-AI suggestion and the trusted
local suggestion unselected, then scan again. Only the two saved suggestions
must stay absent. Both unsaved suggestions must return, without a QA capacity
warning.

### 3. `partial-quota-v1`

**Primary verification:** physical device and automated profile.

1. Start the device session with `partial-quota-v1`.
2. Open **SMS Scan** and run **Sync new SMS**.
3. Open the review results.
4. Save the available suggestions.

Expected result:

- A trusted local suggestion and accepted simulated-AI suggestions remain
  reviewable.
- A friendly partial-results notice explains that some messages could not be
  processed now.
- Save remains enabled for the successful suggestions.
- Saving navigates directly to Transactions without briefly showing the empty
  review page.
- A later clean profile launch reproduces the same result; earlier allowance or
  negative-outcome state must not leak into the new run.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario partial-quota-v1
```

### 4. `rolling-expiry-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario rolling-expiry-v1
```

Expected result: `status: "passed"`. It proves that capacity returns when the
oldest reduced-window usage expires. Do not wait for a real clock on a device;
the profile advances its controlled state safely and immediately.

### 5. `shared-batch-live-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario shared-batch-live-v1
```

Expected result: `status: "passed"`. It proves that batch scan and live SMS
share the same full-parser allowance while voice stays outside that allowance.
This needs controlled concurrent events, so automated verification is the
authoritative result.

### 6. `burst-limit-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario burst-limit-v1
```

Expected result: `status: "passed"`. It proves that the reduced provider-start
burst boundary refuses later requests before simulated provider work begins.

### 7. `history-cooldown-v1`

**Primary verification:** physical device and automated profile.

1. Start the device session with `history-cooldown-v1`.
2. Open **Settings** and select **Rescan recent messages**.
3. Complete the scan that admits simulated AI work.
4. Return to Settings.

Expected result:

- **Rescan recent messages** remains visible but is disabled until its displayed
  absolute availability time.
- **Sync new SMS** remains available.
- The cooldown begins only after full-parser work is admitted; local-only work
  must not create it.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario history-cooldown-v1
```

### 8. `oversized-candidate-v1`

**Primary verification:** physical device and automated profile.

1. Start the device session with `oversized-candidate-v1`.
2. Open **SMS Scan** and run **Sync new SMS**.
3. Open the review results.

Expected result:

- Successful trusted-local and simulated-AI suggestions remain visible.
- The partial-results notice reports one message that could not be processed.
- The oversized fixture produces no transaction and is never sent to the
  simulated provider.
- The warning is aggregate-only; it must not reveal the oversized SMS body.

Automated confirmation:

```powershell
npm run test:sms-safeguards -- --scenario oversized-candidate-v1
```

### 9. `response-validity-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario response-validity-v1
```

Expected result: `status: "passed"`. The profile exercises trusted and
low-confidence success, explicit negative, omission, retryable and permanent
failure, malformed and incomplete output, invalid and duplicate identities,
delay, and cancellation. Only valid complete results may become reviewable.

### 10. `negative-three-strikes-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario negative-three-strikes-v1
```

Expected result: `status: "passed"`. The first two valid AI non-transaction
results suppress ordinary retries; the third permitted history attempt creates a
terminal outcome. Failed or malformed provider responses do not create a strike.

### 11. `terminal-fresh-install-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario terminal-fresh-install-v1
```

Expected result: `status: "passed"`. A terminal outcome is synchronized and
blocks a fresh simulated installation from sending the same fingerprint to the
provider. This is not equivalent to merely clearing app data on a phone, so the
automated profile is authoritative.

### 12. `trusted-local-recovery-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario trusted-local-recovery-v1
```

Expected result: `status: "passed"`. An exact trusted local template may still
create a local suggestion for a fingerprint that is terminal for AI, without
submitting it to the provider.

### 13. `account-switch-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario account-switch-v1
```

Expected result: `status: "passed"`. Safeguard state, allowance, and outcomes
stay scoped to the authenticated local user. The profile creates an isolated
second local user and removes it after verification.

### 14. `consent-required-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario consent-required-v1
```

Expected result: `status: "passed"`. The profile temporarily revokes the local
QA user's AI consent, proves that the server refuses work before reservation or
provider execution, then restores the original consent value.

### 15. `prompt-token-baseline-v1`

**Primary verification:** deterministic automated profile.

```powershell
npm run test:sms-safeguards -- --scenario prompt-token-baseline-v1
```

Expected result: `status: "passed"`. It evaluates the local token estimator
against a deliberately small payload/input boundary. It does not generate AI
content or require Gemini credentials.

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
