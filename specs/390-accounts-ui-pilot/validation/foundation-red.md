# Foundation tests-first Red evidence — T006/T007/T009 (unit/component only)

**Recorded by:** S1 remote documentation writer, 2026-10-11, using the
coordinator's and NativeQA's local execution report. This writer did **not**
rerun tests or inspect private runtime logs. **Status:** MEANINGFUL
UNIT/COMPONENT RED VERIFIED LOCALLY; **T009 OVERALL NOT ACCEPTED** until the
required authenticated public-path E2E signal and T003 harness gate are
independently satisfied.

## Authority and exact revisions

- Repository: `Msg22/Monyvi`.
- Governing main: `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`.
- Parent dependency: open PR #383, `389-voice-usage-limits`, head
  `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`. Existing production source at the
  tested heads is unchanged relative to that dependency.
- Foundation branch: `codex/ui-field-foundation`, intended eventual PR base
  `389-voice-usage-limits`; after PR #383 merges, the coordinator must retarget
  the foundation PR to main. No merge or retarget has been performed.
- Approved visual package:
  `sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`;
  eight canonical bindings independently verified PASS, unchanged. Native
  fidelity is NOT RUN.
- T005 API contract: `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78` in
  `validation/foundation-contract.md`.
- Initial five-suite authored tests: `f937a1ee9476fa5e177b968118455ae9babb436c`.
- Strengthened Q1–Q5 tests, **locally executed immutable test revision**:
  `6e51a4889da545f64d6de0a19f848ca764b3161f`.
- The Q1–Q5 independent audit is recorded in the separate review branch at
  `ce534f1f8d5096edf34314bbf38087829f0b7ec1`,
  `validation/foundation-test-review.md`. Its report is evidence/recommendation,
  not approved specification or implementation authority.

## Verified local baseline and Red runs

All counts below are **coordinator/NativeQA-reported execution evidence**, not
execution by this documentation author. "PASS" means the reported test run; it
does not certify device, authentication, UI fidelity, public-path E2E, or
Account adoption.

| Revision / run                                                                        | Scope                                                                                      |   Pass |   Fail |   Total | Execution disposition                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -----: | -----: | ------: | -------------------------------------------------------- |
| `4b64cf97296583975cc9b6fef12475ddb853ccb9` baseline, production matching PR #383 head | 12 existing suites: logic 39, four shared UI suites 31, seven existing-consumer suites 108 |    178 |      0 |     178 | BASELINE PASS, previously executed                       |
| `f937a1ee9476fa5e177b968118455ae9babb436c` initial test Red                           | Mobile shared field tests                                                                  |     40 |     28 |      68 | Meaningful Red, no reported setup/type/compile failures  |
| `f937a1ee9476fa5e177b968118455ae9babb436c` initial test Red                           | Logic amount helpers                                                                       |     39 |     24 |      63 | Missing approved new helpers + preserved legacy behavior |
| **Initial Red subtotal**                                                              | **Five targeted suites**                                                                   | **79** | **52** | **131** | **RED verified, source still unchanged**                 |
| `6e51a4889da545f64d6de0a19f848ca764b3161f` strengthened Red                           | Mobile: four shared component suites, local clean detached `Monyvi-ui-field-red`           |     45 |     42 |      87 | **Exit 1**, 43.324 s, zero setup/type/timeout failures   |
| `6e51a4889da545f64d6de0a19f848ca764b3161f` strengthened Red                           | Logic amount-helper suite, same isolated source                                            |     46 |     24 |      70 | **Exit 1**, 3.814 s, zero setup/type/timeout failures    |
| **Strengthened Red subtotal**                                                         | **Five targeted suites**                                                                   | **91** | **66** | **157** | **RED verified locally, no production delta**            |

The verified strengthened run has **42 mobile failures/45 passes** and **24
logic failures/46 passes**; the older 52-failure total belongs to the earlier
`f937` revision and must not be confused with the strengthened result. The local
runner's full literal command, captured logs and per-assertion receipts were not
supplied to this remote writer; they remain NativeQA/root evidence to attach to
the T009 acceptance record. These counts and durations alone do not establish
the feature's public-path Red.

### Proven behavioral failure categories

1. **Missing opt-in pure APIs:** `resolveEditableAmountInputChange` and
   `getEditableAmountDisplay` have not been implemented. Pure helper Red checks
   signed opt-in, intermediate `-`, grouped negative edit/paste, sign/comma
   removal, validity-aware display, arbitrary decimals/trailing zeros, and
   unsigned legacy compatibility. Existing `resolveAmountInputChange`,
   `parseAmountInput` and `formatAmountInput` callers must remain unchanged.
2. **Actual malformed numeric presentation:** Real controlled
   GroupedDecimalInput currently renders `abc12345` as `abc12,345`, contrary to
   the approved exact-raw display contract. Malformed `--1234` likewise acquires
   unintended grouping (`--1,234`). Callback/correction assertions are written;
   some later Q4/Q5 assertions can be blocked behind an earlier expected
   assertion failure within the same test, and must be reobserved after source
   Green.
3. **Signed canonical and visual opt-ins absent:** A grouped negative paste
   yields formatted/raw content rather than required `-1234.567` canonical form;
   explicit `variant="default"` still renders the outlined grouped field.
   Existing unsigned, outlined, three-decimal Metals weight and custom keypad
   behavior are guardrails.
4. **Accessibility and feedback:** Shared TextField/Dropdown accessible names do
   not yet include EN/AR requiredness exactly once;
   optional/overridden/prequalified names and warning/helper/empty-feedback
   precedence need the proposed behavior. Dropdown trigger is missing
   button-role/name/current selection or placeholder accessibility value and
   invalid semantics; actual component assertions fail without the new public
   props.
5. **Audit Q1–Q5 strengthening:** New tests freeze legacy unsigned
   accepted/value outcomes (not only equality to the legacy implementation),
   discernible Dropdown `accessibilityValue.text`, complete-vs-partial EN/AR
   qualifier boundaries, grouped raw blur/refocus/correction sequence, and
   advisory gold-600/error-invalid state. TextField and Dropdown initialize real
   EN/AR `common.required_field` translations; GroupedDecimalInput's narrower
   mock tests remain separately identified. No fake implementation mocks,
   unsupported native proofs, or new Account route tests were added.

**Negative evidence:** NativeQA reported zero test setup, type, compile, or
timeout failures in the strengthened run; failures represent expected missing
behaviors. There is still no successful Red/Green for a logged-in, existing
product path. Q4/Q5 multi-step cases may require Green reruns to observe all
later assertions. A deterministic `changeText`/accessibility-prop check does not
establish native clipboard, caret/IME, mixed RTL, TalkBack/VoiceOver, or visual
fidelity.

## T008 public E2E and T003 authenticated harness — still blocked

- M1's E2E author branch `codex/ui-field-foundation-e2e` contains **three new
  YAML** at reported author commit `5c64a96` (short SHA as supplied). Separate
  audit identified two stale detail selectors; the author was correcting them.
  These are **not merged or executed**. YAML presence alone is not E2E Red,
  harness PASS, or complete Q6.
- NativeQA controls an isolated **Pixel 7 emulator `5554`**, private Android SDK
  adb server `5038` (global adb server unchanged), Metro `8082`, and an
  outside-repository ordinary-JavaScript proxy `8083` used to avoid the Android
  multipart `ProtocolException` during JS download. The actual public **WELCOME
  TO MONYVI** authentication UI and Maestro driver/openLink have been
  reached/verified.
- Guarded synthetic **local** authentication advanced into authenticated
  startup, but profile recovery remains **BLOCKED** because the existing local
  Supabase schema lacks `seal_sync_pull_v1(p_upper_watermark)`: baseline
  migrations `082`–`085` are missing even though `086` is present. Synthetic
  server profile existence alone does not prove a ready, usable app session.
- Root separately authorized a **new disposable isolated local stack** with the
  exact committed baseline migrations; the existing shared/local DB is not to be
  mutated by this documentation lane. Do not put credentials, fixture
  identifiers, environment contents or raw profile data into tracked documents.
- **T003 = NOT PASS**. No runner-controlled authenticated foundation public-path
  journey or meaningful T008 E2E Red is established. No app/source change is
  authorized to bypass these gates.

## Required gates and follow-up evidence

1. Root/NativeQA must preserve the exact `6e51a488...` suite commands/logs,
   final assertion classification and the separate verified clean source delta
   for T009. The present report distinguishes genuine unit/component Red from
   incomplete public-path proof.
2. M1 must finish and independently review the existing three YAML paths on its
   **separate branch**; root integrates only under a subsequent explicit
   permission and proves the authenticated test harness. This S1 document does
   not claim E2E execution.
3. **T010–T012 production remains BLOCKED** until root explicitly accepts the
   required T003/T008/T009 gates and grants precise source ownership. No API
   implementation or conditional production license is implied by the passing
   baseline or meaningful unit Red alone.
4. After authorized Green, rerun the exact changed five suites **and** the seven
   existing consumer suites (previously 108 PASS at `4b64`), record
   revision/commands/results, and separately satisfy TypeScript, lint, locale
   checks and device/native fidelity where required. No pre-Green baseline
   proves post-Green compatibility.
5. The Accounts route migration is a **separate later PR**. All **35 Accounts QA
   scenario IDs remain NOT RUN** for this foundation-only stage; future
   manual/native gaps must be recorded honestly.

**Documentation only.** This file records externally supplied facts and open
gates; it does not rerun tests, assert current setup success, authorize
production, or change product/business rules.
