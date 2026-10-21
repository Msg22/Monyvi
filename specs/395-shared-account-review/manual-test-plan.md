# Manual test plan and automation mapping

## Current three-tab correction — owner approval, 2026-10-21

Show exactly **All / Needs review / Selected** as the visible, horizontally
scrollable tabs (RTL mirrored). Missing-account and uncertain-currency rows are
still included in **Needs review** with accurate counts and their per-row
**Choose an account** recovery. Never show an Account needed tab, even when the
missing-account count is positive. Keep linked previews inline, genuine SMS ATM
Cash blockers, manual selections and selected-only Save unchanged. An
already-active legacy account-specific temporary scope can still return to All
when resolved. The 2026-10-20 four-tab expectation below is historical and
superseded only for visible navigation.

## Owner-confirmed label follow-up — 2026-10-21

On the Metro-connected Samsung SM-A546E (Android 16), the owner confirmed that
TEST Card Bank now displays completely, its edit icon is close to its name, and
Wallet icon/name alignment is corrected. The label now uses the app's
already-loaded Inter family (Noto Sans Arabic for Arabic UI); wallet metadata
centers within its row while bank alignment retains its prior behavior.
Temporary measurement logging was removed. This records those cases only;
Arabic, other widths/font scales, picker scrolling and the full checklist remain
separate manual checks.

## Current owner regression cases — 2026-10-21

1. Open a short, exact-account Voice fixture without taking any account action.
   Expect no Accounts reviewed section, only All / Needs review / Selected tabs,
   and no transcript chevron when the native preview fits two lines.
2. Open a long transcript at a narrow width. Expand and collapse it; increase
   usable width or reduce font size until it fits. Expect the chevron only while
   expansion is useful, with no missing text when expanded.
3. Open Needs review with a missing-account transaction, choose its account from
   the row, then return. Expect the review count to update, and that row to
   leave Needs review once all its blockers resolve. The three tabs stay visible
   and All remains available; manual selection remains intact. Explicitly
   reviewed accounts may now show Accounts reviewed.
4. Open Choose an account with enough candidates to scroll. Scroll to the bottom
   and back. Expect the whole description to hide as soon as the list scrolls
   down and return at the top; title, close and footer actions stay reachable.
5. Open Choose an account with EGP and BTC candidates where available. Currency
   appears in the tag only, not appended to type/provider/card details. Select
   each candidate; the currency tag has a visible white outline on green. The
   actual default account has a Default tag beside its name (افتراضي in Arabic);
   selecting another account does not move or change that default tag.
6. After an existing valid Metals action, run Prepare test accounts. Expect
   setup to succeed without changing that Metals action. Malformed or future
   financial roots must still be rejected; do not reset real data to bypass
   them.

7. Open Cash expense, explicit EGP with an existing matching Cash account.
   Expect Cash default if eligible, otherwise sole EGP Cash; never Bank/Wallet
   default. With multiple EGP Cash and no matching default, expect manual
   choice; with no EGP Cash, no account is created. Use TEST profiles for those
   variations.
8. In a review with only an unresolved account and no suggested groups/help,
   expect a static summary without chevron or expand button. Check the question
   icon beside Choose an account; it shares the label center. Bank and Wallet
   alignment must keep their already-confirmed appearance.

These device cases remain pending until the owner records results. Automated
regressions validate behavior and persistence, not native layout or keyboard QA.

## Latest local implementation evidence — 2026-10-20

This supplement supersedes older pending counts below; historical records remain
preserved.

- Approved compact review corrections are implemented locally: title-column
  linked actions, aligned information rows, one-row horizontally scrollable
  overflow tabs, centered inline actions with red Remove, and account/category
  icon-label-pencil alignment with a separate optional status line. Touch hosts
  use literal 48px NativeWind dimensions with smaller 32px visual regions; Jest
  does not establish native geometry.
- Shared Dropdown and CurrencyPicker selected options, plus both review
  account-type pickers, use the same solid-green background and white selected
  foreground. This covers shared consumers, not every bespoke selector in the
  application.
- The new-account shared modal frame measures keyboard-adjusted available
  height, reveals the focused native input and moves its footer into scrolling
  content when needed. Existing suggested-account focus/layout safeguards
  remain. Samsung/iOS keyboard, native alignment, RTL, increased fonts,
  safe-area and touch geometry still require owner-device confirmation: NOT RUN
  by Root.
- The affected nine-suite UI cohort reached 163 passing tests after the single
  six-case editor rerun. After the final picker/style changes, the two affected
  suites passed 67 tests and mobile TypeScript passed. These are
  post-implementation regression checks, not TDD or a native visual pass. Normal
  repository commit hooks remain enabled.
- Sync rejection was reproduced on real SQLite when a default-clear update
  targets an account still classified as created. Commit 97e613e4 admits exactly
  one owned live default-clear account across created/updated buckets; other
  mutation requirements remain strict. Five affected sync/SDK lifecycle suites
  passed 73 tests. Missing, duplicate, foreign, deleted and still-default
  members remain rejected. Device sync success is pending; no new Save is needed
  for that check.
- PR #406 remains a separate logo-only stack above #396. Its refreshed parent
  integration and validation are tracked independently; do not infer logo device
  acceptance from the compact-review tests.

## Earlier owner UI and execution-status update — 2026-10-20 (tab navigation superseded)

**This historical four-tab navigation is superseded by the 2026-10-21 owner
correction above.** The earlier presentation exposed Account needed as a
temporary distinct source-row union for account/currency blockers, including
nonadjacent rows and genuine SMS ATM Cash destinations. That fourth tab is no
longer visible: these blockers belong to canonical **Needs review**. All / Needs
review / Selected remain the only visible tabs and canonical filters. An
in-flight internal account scope can still exit via `Show all`. Preserve
original row order, linked previews, truthful selected counts and global
selected-only Save. The Review details card still avoids redundant
account/currency-needed actions; pending groups require **explicit Confirm**.

**Account creation and group edits:** The visible controls say **Create
account** and **New account** (not Draft), but their local identities still do
not physically persist until final guarded Save of selected transactions. Both
forms now use the **existing searchable CurrencyPicker**: while the picker is
open the parent sheet is hidden so only one Native Modal is visible.
Search/select, picker Back/cancel and form Cancel must preserve or discard the
local name/type/currency choices as appropriate, without early financial
commands, conversion or a second Confirm Currency modal. Check original numeric
amount, account/currency identity and no premature account creation.

**QA distinction:** Continue using **Settings → Development tools → Voice
transcript fixtures** (`/review-transcript-fixtures`) for the synthetic
real-review **TEST Save**; no microphone, transcription or Gemini. Real Voice
recording and targeted SMS shared-path regression remain separate manual scopes,
**NOT** implied by the fixture. Never repeat an uncertain Save until
Transactions and accounts have been checked.

**Evidence:** Root reports the original **7 suites / 97 Save tests PASS** and
one owner-observed selected Game/CIB TEST Save in Transactions; those are
bounded historical results. Root reports newer **USD Save 5-case PASS**
(automated, **not** a new manual device approval); initial logic **27 suites:
515 PASS / 1 precision-policy FAIL**, later corrected with **2 logic + 2 hook
focused suites PASS** and logic TypeScript PASS. Last full mobile result, **295
PASS / 45 FAIL**, preceded final compact component-test repairs; focused final
UI rerun is **PENDING**. Root also reports fresh SQLite Game/CIB Save and dirty
collector **PASS with one guard and one effect**: the initial zero-guard
hypothesis is refuted, not an exemption or a device sync fix. B2's **five
diagnostics-only source files** are integrated; sync/recovery **3 focused suites
/ 39 tests PASS**, but the original device sync failure's cause remains
**UNKNOWN** pending a new sanitized DEV `sync.financialActionRejected` event. No
behavior correction can be inferred.

**Remaining gates:** Root-owned final UI checks/commit/push and #405 draft PR
#406 rebase are pending. No new native visual/RTL/accessibility acceptance, no
completed live-Voice or broad SMS provider run, and **no added checklist PASS**
is asserted. Exact bounded evidence and pending states also appear in
[validation/compact-review-2026-10-20.md](validation/compact-review-2026-10-20.md).
All older scenario IDs, checklist marks, receipts and logs below remain
unchanged as their original-time evidence.

---

## ACTIVE handoff — owner-approved compact interactive review, 2026-10-20

This section **supersedes conflicting instructions in the historical M01–M20
matrix and older Maestro mapping below**, without deleting or changing that
history, its scenario IDs, files, receipts or results. Read
[compact manual validation note](validation/compact-review-2026-10-20.md) for
practical expected outcomes, scope and honest evidence statuses, and
[quickstart](quickstart.md) for the active entry. The **primary design** is the
approved runnable
[mockups/interactive/compact-review-2026-10-20/index.html](mockups/interactive/compact-review-2026-10-20/index.html)
with its
[short README](mockups/interactive/compact-review-2026-10-20/README.md). The
fragment alone is not runnable; preview CSS pixels do not prove native
dimensions. No new binding sidecar, approval or hash ceremony.

**Active delivery:** D is implementing compact RN presentation/routes/locales; B
separately owns authoritative selection and Undo lease behavior. Neither code
authorship nor browser interaction establishes native-device fidelity.
Root-reported 11 Save files: **7 affected suites / 97 tests, TypeScript and lint
PASS**. Owner-reported **one real TEST Save success on 2026-10-20**: selected
`[TEST] Game` / CIB fixture committed and its transaction appeared in
Transactions after the trusted-calendar-bound prior-action repair. This is **one
manual scenario**, not broad feature/visual acceptance. Native rendered
comparisons, accessibility and the comprehensive owner manual matrix are **NOT
RUN** at this handoff. #405 logos / PR #406 is a separate **draft stacked on
#396** and is not integrated into #396.

### Three distinct manual scopes

**1 — Voice transcript fixtures on the CURRENT real review page (M01, M04–M11,
M13–M14, M17):** Use **Settings → Development tools → Voice transcript
fixtures** (`/review-transcript-fixtures`) in an eligible nonproduction build.
Launch a catalog scenario there; it forwards `reviewSession`, `transcript` and
`detectedLanguage` to ordinary `/voice-review`. Use synthetic clearly labelled
TEST data. This exercises real UI/reducer/financial writer when Save is tapped
but **never invokes a microphone, speech transcription, Gemini or an SMS
provider**. Confirm current page, selected-only CIB/Game with QNB pending,
collapsed account summary, two-line expandable transcript, pending versus
`Accounts reviewed`, and missing-account rows in Needs review, with inline
linked previews and no fourth tab. Groups expose independent **explicit
Confirm** and inline three-dot actions—no `View all`, nested action menu or
row-selection implicit group confirmation. One active overlay at a time. Test
amount-preserving `Use account — EGP/USD` with candidate account/type/ currency
preselection and **no second Confirm Currency modal**. Draft name/type/currency
belong to one form and create nothing until actual final selected Save. Remove
leaves ghost Undo/Discard, where Discard must **revoke the real session Undo
lease**, not only hide its button. Initially/newly ready rows auto-select;
manual deselection persists, while `Select ready` expressly reselects eligible
rows within the active filter. Check native 44/48dp hit targets distinct from
small painted account/category icons, measured available-width text/reflow, long
account/category names, dot only inline with status+count, and no final orphan
divider. Light/dark readable information, EN/AR RTL, fixed safe footer/keyboard,
sticky dismissible feedback below header/outside scroll and modal-only inline
notices require actual native evidence. **TEST Save is REAL local financial
Save**: after one tap, inspect Transactions and accounts before retrying an
uncertain outcome; never save blindly twice.

**2 — Real Voice capture, separately (M03, M16–M17):** A real recording is
needed to assess app permission/recovery, recording/cancel/interruption,
temporary audio cleanup, speech transcription/Gemini, exact spoken-currency
extraction, provider errors/usage and navigation back to review. The fixture
does **not** prove these paths. No new Voice transfer support.

**3 — Targeted SMS regression (M02–M03, M08–M09, M12–M15, M19–M20):** Because
shared account/default/Undo/Save/sync paths changed, verify ordinary SMS
excludes Cash as **source**, true SMS ATM Bank/Cash endpoints remain distinct,
amount and currency remain faithful, pending group and row choices stay scoped,
Review later/restart retains source-specific durable choices, Discard revokes
the right lease, final Save is selected-only/idempotent and sync/pull/ACK
preserves ownership/fingerprint/private evidence. A complete SMS
parsing/provider retest is **not** required for unchanged provider paths.

### Supersessions of historical M01–M20 descriptions

| Historical entry below | Active compact interpretation                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M04                    | Explicit group Confirm can make rows **newly ready and auto-selected** unless manually unchecked; confirmation alone does not create accounts. CIB remains independent.                                                     |
| M05                    | Selecting a pending-group row **must not implicitly confirm** the group.                                                                                                                                                    |
| M08                    | Removed ghost offers Undo and final Discard **revokes session lease**; transactions remain intact.                                                                                                                          |
| M09                    | Account chooser confirms account **and authoritative currency once** without changing numeric amount. No standalone currency-only action or second confirmation; use the shared CurrencyPicker inside the new account form. |
| M10                    | Collapsed Review details expands **all groups inline**, not `View all` or a second list modal; `Accounts reviewed` is conditional and not global Save-ready.                                                                |
| M11                    | Initial/newly-ready auto-select, manual opt-out and active-filter `Select ready`; Clear affects active-filter selected rows.                                                                                                |
| M13–M14                | Real clearly marked TEST Save is permitted in the controlled Voice fixture; never imply dry-run or successful transaction from a button click. Check Transactions before a retry if outcome uncertain.                      |
| M17                    | Browser preview 320 CSS px is **not** an RN device measurement. Native layout, safe areas, keyboard and screen-reader checks remain open.                                                                                   |

**Entry distinction:** `voice-shared-drafts-qnb-cib` is a manual transcript
catalog scenario. The old `reviewFixtureSceneId` query recorded below is a
separate historical scene/Maestro harness, not the current Settings entry; its
scene IDs are not interchangeable.

**Legacy automation caution:** The four Voice Maestro YAML journeys previously
authored under `apps/mobile/e2e/maestro/account-review/` and Add form YAML were
**NOT RUN** as recorded below. They are **not verified compatible** with the new
compact UI; selectors and interactions must be reconciled first. Authored files
are not passing E2E or device visual evidence. Keep current direct
implementation/batched checks rather than reviving old mandatory Red/TDD.

## HISTORICAL 2026-10-14–17 scenario matrix and authored automation inventory

### Preserved original handoff (not current compact UI instructions)

This is the scenario source for future implementation, not executed test
evidence. No app code, test files, E2E run, device or emulator validation was
performed in this planning PR. Test authors must establish Red before production
edits; owner requests batched checks and no emulator execution.

## Scenario matrix

| ID  | Scenario and expected result                                                                                                                                                                  | Requirements       | Planned deterministic coverage                                                                    | E2E / manual boundary                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| M01 | Voice: one/several accounts, same-currency default, no account mentioned → accepted default and quiet disclosure                                                                              | FR-001–002         | Resolution/selection service unit and review component integration                                | Fixture-driven review flow to Save; owner real Voice sample                                      |
| M02 | SMS Cash default, no default, wrong currency or inconsistent defaults → compatible exact match or unassigned; no guess                                                                        | FR-003–004         | Source/type/currency eligibility matrix                                                           | Controlled SMS fixture; owner device delivery paths unchanged                                    |
| M03 | Omitted currency → preferred; conflicting/unsupported currency → no automatic account                                                                                                         | FR-004             | Response validation/currency-certainty and resolver tests                                         | Review fixture + owner real parsing sample                                                       |
| M04 | QNB3/CIB1: confirm QNB only → account blocker removed for3, none selected/created, CIB pending                                                                                                | FR-005–007         | Shared identity/state reducer and UI tests                                                        | Controlled review journey, group confirmation then one Save                                      |
| M05 | Select one eligible QNB row → prior disclosure and feedback; group confirmed, only clicked row selected                                                                                       | FR-008             | Selection/confirmation integration; hard-invalid rejection                                        | Review fixture, exact checked counts/save result                                                 |
| M06 | Edit draft identity; different card/type/currency evidence → no accidental merging; changed identity reconfirmed                                                                              | FR-005,012,021     | Canonical identity/dedup/override tests, validation failures                                      | Fixture-based draft edit; owner localized long/provider names                                    |
| M07 | Replace account via row versus group; cancel/stale/deleted candidate → correct scope/no unintended changes                                                                                    | FR-010,012         | Candidate filtering, scope and reference revalidation tests                                       | Existing chooser journey; owner modal accessibility                                              |
| M08 | Remove QNB, keep its rows unassigned; invalid selection clears; CIB unaffected; Undo does not override later edits                                                                            | FR-009             | Removal/undo revision and recovery tests                                                          | Remove/Undo/Choose flow; owner interruption/restart checks                                       |
| M09 | Choose another currency → EXISTING modal with transaction context; explicit accept only; numeric amount preserved                                                                             | FR-011–012         | Existing CurrencyPicker/context/unconfirmed adapter and regrouping tests                          | Supported-currency selection/cancel journey; owner keyboard/TalkBack                             |
| M10 | Combined/default-only/issues-only/confirmed/clean/filtered-empty, overlapping reasons and long group list → exact sections/counts                                                             | FR-013–015         | Read-model/counter/filter/component/layout tests                                                  | All accessible fixture states; owner visual reference comparison                                 |
| M11 | Select ready within active filter; unresolved rows remain; Clear selection and final count accurate                                                                                           | FR-015             | Bulk selection integration and count tests                                                        | Fixture filter/select/save journey                                                               |
| M12 | Add first/later account, toggle off/on, existing/no default, cancel/failed Save → correct unsaved boundary and sole default                                                                   | FR-016–017         | Form intent/owned command integration, concurrent revalidation                                    | Add/Edit journey with fixtures; owner account form/keyboard                                      |
| M13 | Save selected rows while unrelated group unresolved; unused confirmed drafts not created                                                                                                      | FR-018             | Atomic writer/reference/selected-draft tests                                                      | Controlled Save and resulting accounts/transactions                                              |
| M14 | Failed save/repeat Save/duplicate source fingerprint → no partial financial effects or duplicate accounts/transactions                                                                        | FR-018–019         | Writer failure injection/idempotency/source-fingerprint tests                                     | Honest failures need fixture harness; otherwise owner manual, no fake E2E claim                  |
| M15 | Restore SMS choices/removals, Review later; Voice exit has no added durable recovery                                                                                                          | FR-019             | SMS durable draft/service and Voice session boundary tests                                        | Restart fixture where controllable; owner actual SMS/device lifecycle                            |
| M16 | Confirm/edit/remove/currency actions → zero extra parsing requests/usage; references are owned                                                                                                | FR-020–021         | Transport call counts/validation/user-scope tests                                                 | Provider calls not driven live by E2E; owner real sample and usage check                         |
| M17 | Compact/ordinary/tablet/landscape, light/dark, RTL, enlarged fonts, long names, keyboard and bottom navigation                                                                                | FR-022–023         | Shared responsive/layout/inset/accessibility semantics tests                                      | Owner rendered comparison/TalkBack/VoiceOver; no emulator run                                    |
| M18 | Existing fields, type/currency read-only rules, provider/sender/card metadata and balance behavior preserved                                                                                  | FR-023             | Existing form/service regression coverage                                                         | Owner Add/Edit bank/wallet/Cash regression                                                       |
| M19 | Complete financial action: multiple new/existing accounts, children, transactions/ATM transfers, zero-net, replay/hash conflict, stale CAS, rejection compensation and generic-push isolation | FR-018–019,021     | Exact amount/action registry, complete writer, sync/reconciliation and pgTAP parity/failure tests | Fault-injected service/server coverage; owner offline/restart/sync checks; no emulator execution |
| M20 | V1/v2 parser and SMS payload compatibility, dangling groups, grounded evidence, late chunks/retries preserving choices/removal, unsupported provider schema                                   | FR-004–005,019–021 | Canonical/generated schema parity, provider/adapters, decoder migration and immutable merge tests | Controlled review fixtures; actual configured provider interpretation owner-run                  |

Automated targets, fixture capabilities and exact test filenames are assigned by
the future plan/tasks. Until authored and executed, every automation cell above
is **planned**, not covered/passing. Live provider interpretation, actual OS
keyboard and screen-reader speech remain separately reported manual checks.

## Data readiness

Use explicit current-user fixtures for: Cash default EGP; eligible Bank/Wallet
defaults; no default; conflicting default metadata; QNB same-currency
distinguishable accounts/cards; draft QNB3/CIB1; currency uncertainty;
wrong-currency/deleted/foreign references; SMS source fingerprints and restored
reviews. Do not seed/reset or mutate hosted/local business data during this
planning step. Future QA preparation must inspect the owner-selected local user
and add only missing fixture data under the approved scope.

## Current author-only E2E file reconciliation — 2026-10-17

The original M01–M20 scenario matrix above and its expected business rules are
unchanged. The earlier "planned" phrasing describes that historical planning
boundary; this addition names the current source-backed automation route, NOT an
executed test. Deterministic suite targets for every ID are preserved with exact
repository-relative names in
[`validation/final-coverage-handoff.md`](validation/final-coverage-handoff.md).
No task acceptance checkbox or test result is inferred from a YAML file.

**Authored Voice Maestro, NOT RUN:** All four entries are under
`apps/mobile/e2e/maestro/account-review/`: `conditional-states.yaml` (existing),
`choose-account-currency.yaml` (existing), `default-account.yaml` (new
M01/R3-07 + Why/cancel), `shared-suggestions.yaml` (new QNB/CIB
confirm/selection/remove/Undo). They use the implemented test-only
`voice-review?reviewFixtureSceneId=` entry, an authenticated current-owner role
profile, a nonproduction build and a validated canonical VOICE session. They
contain no financial session JSON or provider/microphone request. The new
journeys inspect the real Save readiness CTA but **never tap financial Save**:
no fixture-specific durable writer/post-Save outcome has been independently
established for E2E.

**Authored Add intent Maestro, NOT RUN:** The correct existing route is
`apps/mobile/e2e/maestro/accounts/account-default-intent.yaml`; it is NOT an
`account-review/add-default-account.yaml` replacement.

**SMS, faults and device boundary:** No fabricated SMS Voice deeplink, already
removed SMS Undo seed, save-recovery.yaml, 23505 adapter injection through
Maestro, or restart assertion is authorized. M14 failure/idempotency and M15
owner-bound SMS durable Review/restart are represented by actual existing
service/SQLite tests in the coverage handoff, **not SMS Maestro**. Voice
session-only exit does not imply SMS durable recovery. Owner's actual RTL,
light/dark, large font, OS keyboard, screen reader, device restart/offline and
configured provider evidence is NOT RUN.

| ID  | Current deterministic/E2E route mapping (exact filenames where authored)                                                                             | E2E status and remaining boundary                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M01 | `account-review/default-account.yaml`, `conditional-states.yaml`; `resolution.test.ts`, `account-review-default-info.test.tsx`                       | Voice default disclosure/Why/cancel authored NOT RUN; real Voice parse and financial Save owner-only     |
| M02 | `resolution.test.ts`, `normalization-safety.test.ts`                                                                                                 | SMS controlled logic only; no SMS Maestro, Cash SMS default prohibited                                   |
| M03 | `schemas.test.ts`, `account-review-parser-adapters.test.ts`                                                                                          | Omitted/conflicting currency automated logic; Voice/SMS provider interpretation manual NOT RUN           |
| M04 | `account-review/shared-suggestions.yaml`, `shared-groups.test.ts`, `shared-account-suggestions.test.tsx`                                             | QNB-only confirm with CIB pending authored NOT RUN; no account creation/Save asserted                    |
| M05 | `account-review/shared-suggestions.yaml`, `account-review-command-service.sqlite.integration.test.ts`                                                | One actual checked-row action and count authored NOT RUN; financial Save membership remains SQLite/owner |
| M06 | `shared-groups.test.ts`, `account-choices-guards.test.ts`                                                                                            | No long/provider/card identity edit Maestro; deterministic and owner-localized                           |
| M07 | `account-review/choose-account-currency.yaml`, `account-choices.test.ts`                                                                             | Existing real chooser/cancel authored NOT RUN; stale candidate and TalkBack owner                        |
| M08 | `account-review/shared-suggestions.yaml`, `account-review-undo-lifecycle.sqlite.integration.test.ts`                                                 | Actual Voice Remove→Undo same lease authored NOT RUN; later-edit/restart SMS only SQLite/owner           |
| M09 | `account-choices.test.ts`, `account-review-choices.test.tsx`                                                                                         | CurrencyPicker independent modal/amount only unit/component and owner keyboard, no fake SMS Maestro      |
| M10 | `account-review/conditional-states.yaml`, `default-account.yaml`, `shared-suggestions.yaml`; `read-model.test.ts`                                    | Voice state subsets authored NOT RUN; SMS issues-only/RTL/rest of matrix owner                           |
| M11 | `conditional-states.yaml`, `shared-suggestions.yaml`, `account-review-filter.sqlite.integration.test.ts`                                             | Fixture selected filter/single-row count authored NOT RUN; actual selected Save SQLite/owner             |
| M12 | `accounts/account-default-intent.yaml`, `account-default-intent-atomic.sqlite.integration.test.ts`                                                   | Existing Add form YAML authored NOT RUN; saved default parity and failure owner/SQLite                   |
| M13 | `account-review-save-intent.sqlite.integration.test.ts`, `account-review-save-service.sqlite.integration.test.ts`                                    | No financial Save Maestro; only genuine owned writer evidence                                            |
| M14 | `account-review-save-boundaries.sqlite.integration.test.ts`, `account-review-save-intent.sqlite.integration.test.ts`                                 | Genuine SQLite fault/idempotency/replay only; no placeholder save-recovery.yaml                          |
| M15 | `account-review-durable-recovery.sqlite.integration.test.ts`, `account-review-all-dedup-recovery.sqlite.integration.test.ts`, V2 codec               | SMS owner-scoped recovery SQLite, NOT SMS Maestro; owner real restart, Voice exit session-only           |
| M16 | `account-review-source-adapter-service.test.ts`, `account-review-parser-voice.test.ts`                                                               | Provider/usage calls not run by scene; owner configured-provider evidence                                |
| M17 | `account-review-panel.test.tsx`, `account-review-nativewind-safety.test.ts`                                                                          | All physical RTL/theme/font/landscape/keyboard/screen reader checks owner NOT RUN                        |
| M18 | `accounts/account-default-intent.yaml`, `account-default-intent-form.test.tsx`, `account-default-intent-atomic.sqlite.integration.test.ts`           | Existing Add/Edit fields preserved; physical Bank/Wallet/Cash owner checks NOT RUN                       |
| M19 | `account-review-save-service.sqlite.integration.test.ts`, `account-default-intent-sync-recovery.sqlite.integration.test.ts`, actual SQL091/SDK gates | Server/SDK results supplied by Root; final integrated sync/recovery/device not cleared, no E2E Save      |
| M20 | `schemas.test.ts`, `account-review-v2-codec.test.ts`, `account-review-parser-adapters.test.ts`                                                       | Schema/payload/provider/late chunks remain suite and owner; no SMS/Voice live provider Maestro           |

**Evidence status at this handoff:** Root reported local SQL 737/737 and SDK
seam 10/10 PASS on their separately identified batches, plus corrected logic
failures passing. Final mobile types/lint, compiled Maestro YAML, physical E2E,
full unified sync/Add/Review, hosted SQL/provider and device gates are
PENDING/NOT RUN here. Prior batch evidence is not rerun against this parent.
