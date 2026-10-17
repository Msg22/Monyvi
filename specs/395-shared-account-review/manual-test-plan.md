# Manual test plan and automation mapping

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
