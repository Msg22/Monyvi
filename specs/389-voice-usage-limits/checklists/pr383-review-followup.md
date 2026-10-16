# PR 383 Review Follow-Up — Bounded Quality & Verification Checklist

**Branch:** `389-voice-usage-limits`  
**Scope:** Edge contract parity, AppState lifecycle safety, pre-transport
category validation, safeguard reservation/release ordering.

---

## 1. Automated Coverage Matrix

| Area                         | Component                                      | Verification Target                                                                                               |           Coverage Status            |
| :--------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------------------: |
| Contract Parity              | `scripts/check-voice-contract-parity.test.js`  | `_shared/voice-ai-safeguard-contract.ts` is byte-identical to `packages/logic/src/voice-ai-safeguard-contract.ts` | [x] Authored (outcomes in PR/checks) |
| Isolated Runtime Graph       | `scripts/check-voice-contract-parity.test.js`  | AST import graph for `parse-voice` and `voice-ai-availability` strictly confined within `supabase/`               | [x] Authored (outcomes in PR/checks) |
| Pre-reserve Safeguards       | `supabase/functions/parse-voice/index.test.ts` | Invalid `callerLocalDate` returns 400 before reservation RPC                                                      | [x] Authored (outcomes in PR/checks) |
| Pre-reserve Safeguards       | `supabase/functions/parse-voice/index.test.ts` | Missing `GEMINI_API_KEY` returns 500 before reservation RPC                                                       | [x] Authored (outcomes in PR/checks) |
| Prep Failure Release         | `supabase/functions/parse-voice/index.test.ts` | Accepted reservation releases work with `preparation_failed` on prompt/encoding failure                           | [x] Authored (outcomes in PR/checks) |
| Prep Release Resilience      | `supabase/functions/parse-voice/index.test.ts` | Release returning `false` or RPC throwing handles gracefully, returns safe 500                                    | [x] Authored (outcomes in PR/checks) |
| Mark-Start Ambiguity         | `supabase/functions/parse-voice/index.test.ts` | Ambiguous `voice_ai_mark_provider_started` failure returns 503 and NEVER releases                                 | [x] Authored (outcomes in PR/checks) |
| Pre-transport Categories     | `ai-voice-parser-service-categories.test.ts`   | Empty `categoryRecords` fails fast with config error without calling Supabase function                            | [x] Authored (outcomes in PR/checks) |
| Config Retry Fresh Context   | `useVoiceTransactionFlowCategories.test.ts`    | Config error retains `audioUri` and `requestKey`, picks up fresh categories upon retry                            | [x] Authored (outcomes in PR/checks) |
| Network Retry Frozen Context | `useVoiceTransactionFlowCategories.test.ts`    | Network error retry preserves original frozen categories even if caller props changed                             | [x] Authored (outcomes in PR/checks) |
| Offscreen Start Guard        | `useVoiceTransactionFlowLifecycle.test.ts`     | `startFlow` rejects with `{ kind: "not-started", reason: "cancelled" }` when AppState is inactive/background      | [x] Authored (outcomes in PR/checks) |
| Stale Permission Sheet       | `useVoiceTransactionFlowLifecycle.test.ts`     | Inactive during OS permission sheet aborts in-flight start; explicit active retry succeeds                        | [x] Authored (outcomes in PR/checks) |
| Background Active Pause      | `useVoiceTransactionFlowLifecycle.test.ts`     | AppState background pauses confirmed recording and preserves audio/key                                            | [x] Authored (outcomes in PR/checks) |
| Pending Resume Cancellation  | `useVoiceTransactionFlowLifecycle.test.ts`     | Inactive/background during `refreshPermission` cancels resume operation, blocks resume                            | [x] Authored (outcomes in PR/checks) |
| Retained Audio Survival      | `useVoiceTransactionFlowLifecycle.test.ts`     | Completed / analyzing state does not discard audio when AppState becomes background                               | [x] Authored (outcomes in PR/checks) |

---

## 2. Manual-Only Native Verification Scenarios

> **Note:** Native scenarios below represent manual-only on-device validation
> (Status: NOT RUN). In-flight HTTP survival cannot be guaranteed across OS
> process suspension; expected flow retains state and audio while the OS permits
> background execution. Executable automated test outcomes are recorded in PR
> checks upon root rerun.

### Scenario N01: OS Permission Sheet AppState Transition

- **Platform:** Android / iOS physical device or simulator
- **Preconditions:** Microphone permission reset to "ask every time" or "not
  determined".
- **Steps:**
  1. Open Voice screen and tap "Continue" on the inline explanation to trigger
     the native OS permission sheet.
  2. Observe AppState transitioning to `inactive` while the system sheet is
     presented.
  3. Tap "Allow" on the system sheet to grant microphone permission.
  4. AppState returns to `active`.
- **Expected Outcome:**
  - The stale pre-sheet start flow does not automatically launch capture
    offscreen.
  - User can tap mic once in foreground to start recording once native audio is
    ready (truthful native readiness, no immediate timing guarantee).

### Scenario N02: Background Interruption During Native Warmup

- **Platform:** Android physical device (MediaRecorder native warmup)
- **Preconditions:** Microphone permission granted, app active.
- **Steps:**
  1. Tap mic to begin recording.
  2. Press Home button during post-start native warmup.
- **Expected Outcome:**
  - App does not crash with Android `IllegalStateException`.
  - Native capture pauses safely; audio and request key are preserved rather
    than discarded.
  - Returning to app shows paused state without auto-resume or audio leakage.

### Scenario N03: Home Screen Backgrounding During AI Analysis

- **Platform:** Android / iOS device (manual-only verification)
- **Preconditions:** Active network connection, valid recording completed.
- **Steps:**
  1. Complete a 3-5 second voice note and tap Submit.
  2. Swipe to Home screen while "Analyzing..." is visible.
  3. Return to Monyvi while the OS permits background execution.
- **Expected Outcome:**
  - Flow retains submission state and audio while the OS permits execution
    (in-flight HTTP survival is not guaranteed across OS process suspension).
  - Audio and requestKey are not discarded by AppState background transition.
  - Review screen displays parsed transaction upon return (or error banner with
    Retry option if network failed or execution paused).

### Scenario N04: Local Database Category Hydration Race

- **Platform:** Android / iOS cold start
- **Preconditions:** Fresh app launch with cold WatermelonDB category cache.
- **Steps:**
  1. Cold start app and trigger Voice recording before category database query
     completes.
  2. Tap Submit while categories are empty.
  3. Allow local categories to hydrate, then tap Retry.
- **Expected Outcome:**
  - First attempt shows non-fatal category configuration error without charging
    quota.
  - Audio recording and requestKey are retained.
  - Tapping Retry refreshes category context and parses successfully with
    correct category mapping.

---

## 3. Reviewer Verification Checklist

- [ ] `node scripts/generate-edge-voice-contract.cjs` produces zero diff against
      `packages/logic/src/voice-ai-safeguard-contract.ts`.
- [ ] No runtime packages/logic or root imports inside `supabase/functions/`.
- [ ] No `as unknown as` double assertions or object-literal type assertions in
      test files.
- [ ] `apps/mobile/hooks/useVoiceTransactionFlow.ts` strictly within 900-line
      budget.
- [ ] Final combined test batch passes across mobile, logic, scripts, and Edge
      functions.
