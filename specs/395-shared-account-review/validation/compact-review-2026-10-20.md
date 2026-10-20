# #395 compact review — manual validation and evidence (2026-10-20)

**ACTIVE manual handoff, NOT a completion receipt.** This note supplements
[manual-test-plan.md](../manual-test-plan.md)'s preserved M01–M20 IDs and the
[current quickstart](../quickstart.md). The owner's approved
[runnable compact review](../mockups/interactive/compact-review-2026-10-20/index.html)
and its
[short README](../mockups/interactive/compact-review-2026-10-20/README.md) are
the primary current visual, layout, responsive and interaction reference; the
raw source fragment alone is not runnable. This already approved concept
requires **no new binding sidecar, hash/metadata ceremony or repeat design
approval**. Earlier B1/R1–R3 image bindings and original approvals remain
untouched for their historical scopes.

## Evidence register — keep distinct

| Scope                                  | Evidence already reported                                                                                                                     | Status of further acceptance                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Selected CIB / `[TEST] Game` fixture   | **ONE owner-reported manual Save success on 2026-10-20** after trusted calendar-bound prior-action fix; saved record appeared in Transactions | Only this specific Save path was observed; other compact/manual scenarios **PENDING**                             |
| Eleven Save files                      | Root-reported **7 affected suites / 97 tests PASS**, TypeScript PASS, lint PASS                                                               | Do not infer new compact frontend/device/visual acceptance; this note executed no checks                          |
| Browser interactive v1                 | Owner approved and explored compact default-collapsed concept, including 320 CSS px preview                                                   | Browser preview is **not** React Native geometry, device screenshot or accessibility evidence                     |
| Compact frontend/domain implementation | D owns presentation/routes/locales; B separately owns authoritative auto-selection/Undo and guarded domain transitions                        | Current RN implementation/manual QA **PENDING**; no completed native UI proof claimed here                        |
| Real Voice provider                    | No provider/device execution in this handoff                                                                                                  | **NOT RUN** for permission, recorder, temp-file cleanup, transcription/Gemini and spoken currency                 |
| Targeted SMS regression                | Earlier deterministic SMS/SQLite evidence remains separate                                                                                    | **NOT RUN** in this handoff; only changed shared paths need focused follow-up                                     |
| Maestro E2E                            | Four historically authored Voice journeys and Add YAML retained                                                                               | **NOT RUN**, and **not verified compatible with the updated compact UI**; recheck selectors/journeys before reuse |
| Native rendered/accessibility          | No new screenshots, RTL native evidence, keyboard/inset proof or screen-reader evidence                                                       | **NOT RUN** — feature visual fidelity and owner manual acceptance **PENDING**                                     |
| #405 logos                             | PR #406 is a **separate draft stacked on #396**                                                                                               | Not integrated into #396; do not mark current compact visual QA complete based on #405                            |

The single observed Save and Root's automated regression result are **not** a
blanket assertion that all account choices, ready-selection transitions, Undo,
SMS, live Voice or layout states are accepted. No checkbox below is prechecked.

## A. Voice transcript fixture — current REAL review UI; synthetic input

Use **Settings → Development tools → Voice transcript fixtures**
(`/review-transcript-fixtures`) in an eligible nonproduction build. Launch the
catalog scenario `voice-shared-drafts-qnb-cib`, or another transcript; the
launcher forwards `reviewSession`, `transcript` and `detectedLanguage` to the
normal `/voice-review` page. The older `reviewFixtureSceneId` query is a
distinct scene/Maestro harness; its identifiers are **not** transcript catalog
IDs. Use synthetic `[TEST]` content. This opens the **real current review
page**, not a static/mock browser design. It makes **zero microphone, speech
transcription, Gemini or SMS provider calls**. It is not a dry-run Save: the
clearly marked **TEST Save is a real guarded local financial Save** when
activated. Use a controlled owner/test profile.

- [ ] **F01 / M10,M17 — early content:** Transactions appear early; transcript
      `What I heard` shows **two lines initially** and expands/ collapses
      without losing scroll/selection. Review details starts **collapsed** and
      expands all account groups **inline**, with no `View all` sheet or nested
      action modal.
- [ ] **F02 / M04,M10 — pending versus reviewed:** Pending suggestions disclose
      name/type/currency/status/linked count, and remain pending until an
      **explicit Confirm**. `Accounts reviewed` appears only when relevant
      pending groups and account-needed rows are resolved; it does not assert
      every financial row is Save-ready.
- [ ] **F03 / M05 — no implicit confirmation:** Selecting/checking a row from a
      pending group must **not** confirm that group or imply a financial write.
      Each group has its own Confirm; a pending QNB remains pending even when
      independent CIB is resolved.
- [ ] **F04 / M07,M10,M11 — temporary source-order filters:** Account needed
      gathers unresolved account/currency rows from **discontiguous positions**
      in source order; a filter-empty state allows recovery. Linked-row
      drilldown shows precisely current affected IDs in source order, clearly
      marked with an exit. `Show all` restores full rows without changing
      canonical selected/Save scope. Group-wide account choice shows the
      particular linked transaction names and amounts.
- [ ] **F05 / M04,M11 — ready-selection contract:** Initially ready rows and
      newly ready rows following explicit resolution auto-select. A manual
      uncheck is respected on later unrelated rerenders; `Select ready`
      deliberately reselects eligible rows **inside the active filter**, while
      Clear operates on selected rows in that filter. Pending/unready rows
      remain excluded and counts match real authoritative checkboxes.
      Auto-selection never auto-confirms a group.
- [ ] **F06 / M06,M07,M09 — one account chooser:** Quiet compact **account
      pencil-square** opens one active chooser; tapping ordinary static account
      name/metadata does not. Current eligible account/type is preselected when
      appropriate; alternative candidates display authoritative name/currency
      and provider/card context. Explicit `Use account — EGP/USD` applies the
      account and its currency together with the **numeric amount unchanged**
      (no FX conversion) and **no second Confirm currency or Confirm
      account-and-currency overlay**. Cancel/dismiss leaves the original choice
      intact. Independent currency-only correction may still use the existing
      contextual picker.
- [ ] **F07 / M06,M13 — draft boundary:** Add/Edit suggested draft has name,
      type and currency **together in one form**, with affected group scope and
      current choice/type visible. Material change invalidates confirmation when
      required. Draft interaction, confirmation and cancel do not create a
      persisted account; only final Save of selected rows genuinely using the
      draft may create account/children. Unused or unselected drafts remain
      uncreated.
- [ ] **F08 / M08 — real Undo lease:** Remove leaves affected rows unresolved
      and a compact ghost offering Undo and final trash Discard. Valid Undo
      restores only within current review/owner/revision scope, never overriding
      later edits. **Discard revokes the real Undo lease**, removes the ghost
      and makes stale Undo fail safely; hiding a button without revocation is
      insufficient. It never deletes transactions, accounts or financial
      history.
- [ ] **F09 / M10,M17 — painted density and native width:** Compact
      account/category pencil-square icons have **small visible chrome** but
      actual **44/48dp effective touch targets** that do not overlap; category
      icon opens its direct edit. Title, signed amount/currency,
      account/category and full identity stay legible. With real available
      container width, long names/categories, wide amounts and native font
      scale, keep inline while content fits then naturally reflow; never clip
      financial identity. Status/linked-count dot only appears **when both are
      on one physical line**; no orphan dot or stray final divider.
- [ ] **F10 / M17 — dark/RTL/modal/footer/feedback:** Native light/ dark
      informational text is readable; selected/warning fills remain meaningful.
      EN/AR RTL, scaled type, scrolling, keyboard and gesture/ 3-button
      navigation bottom inset preserve actions. A dismissible sticky page notice
      sits **directly under PageHeader/outside scroll**, modal feedback sits
      **inside the single active overlay**; no new toasts and no stacked sheets.
      Final row/list dividers stay correct.
- [ ] **F11 / M01,M12–M14,M19 — REAL clearly marked TEST Save:** Confirm
      selected CIB / `[TEST] Game` only; QNB stays pending/unselected. Tap
      **TEST Save once**; verify exact selected transaction appears in
      **Transactions**, with amount/currency/category and CIB Bank account,
      without QNB draft creation, unrelated default/balance changes or duplicate
      financial effects. **When an outcome is uncertain, inspect Transactions
      and account list before any retry**; do not blindly Save again. Replays
      must not double-create. Negative root/currency/owner/ rollback protections
      belong to existing real SQLite service evidence, not an invented manual
      fault or a false success notice.

## B. Real Voice recording — separate provider/device evidence

The Voice fixture **does not exercise** any of these:

- [ ] **V01 / M16,M17:** Existing custom permission explanation and permission
      grant/denial/recovery; recorder start/stop/cancel/ interruption and
      temporary-audio-file cleanup on success, cancel and failure. No lingering
      sensitive private recording.
- [ ] **V02 / M03,M16:** Real speech transcription and configured Gemini
      parsing; verify at least an actual spoken-currency example against
      displayed account/currency, plus omission/ambiguity when relevant. No
      invented conversion or additional provider call caused by subsequent
      chooser/group edits; verify real usage/error paths separately.
- [ ] **V03 / M13,M15:** End-to-end navigation to real current compact review
      and correct session-only Voice draft lifetime. **No Voice transfers**
      added by this feature.

Keep actual audio/transcripts, account IDs, provider tokens and personal records
out of shared screenshots/evidence. Record only sanitized outcomes.

## C. Targeted SMS regression — shared-path changes, not provider overhaul

Scope only affected account review/default/Undo/Save/sync/ownership paths;
unmodified provider/parser behavior does **not** require wholesale retesting.

- [ ] **S01 / M02,M03,M09:** Ordinary SMS **source** cannot be Cash. Omitted
      currency uses preferred only when otherwise safely eligible;
      conflicting/ambiguous currency never auto-assigns. For actual SMS ATM,
      Bank source and compatible Cash destination resolve independently. No fake
      Voice transfer or amount conversion.
- [ ] **S02 / M04,M07,M08,M11:** Shared suggestions, confirmation, temporary
      filter/Show all, chooser scope, manual ready uncheck, Remove/Undo/Discard
      and single-overlay actions preserve source-specific SMS guards. No
      pending-group implicit confirmation or unselected save.
- [ ] **S03 / M12–M15,M19:** SMS Review later, restart, owner-scoped durable
      draft evidence/choices and source fingerprints survive safely. Discard
      revokes only the appropriate current-review recovery lease, never
      immutable historical financial data. Selected-only atomic Save, replay,
      new-account/default behavior and duplicate fingerprint remain consistent
      across local restart.
- [ ] **S04 / M14,M19,M20:** Offline pending/rejected outcomes and push/pull/ACK
      must not invent success, duplicate financial effects, leak private SMS
      evidence or cross owner scope. Use pre-existing deterministic
      SQLite/SDK/SQL safeguards for hard-to-force faults; do not claim an SMS
      live-provider/Maestro pass from those suites.

## Recording actual manual outcomes

For each **executed** scenario log ID, date/build, test account/fixture versus
real Voice versus SMS, scoped native available width, locale/theme/ font,
expected/observed outcome and sanitized evidence. Mark actual **PASS / FAIL /
NOT RUN** without silently promoting unchecked items. Separate **functional
readiness**, **native visual comparison**, **native accessibility**,
**real-provider behavior**, **SMS regressions** and **owner final acceptance**.
As of this document, native rendered/screenshots, RTL/font/keyboard/safe-area
and screen-reader evidence remain **NOT RUN**, and overall owner acceptance is
**PENDING**.

Historical Maestro files remain **authored / NOT RUN**; the old journeys'
selectors/interactions are **not verified compatible** with the compact page. Do
not reuse as claimed current E2E coverage until reviewed. No new device/E2E
execution, feature source change, data write, design-binding approval or
completion checkbox was performed by this documentation task. #405 institution
logos / PR #406 remains a **separate draft stacked on #396**, not integrated
into #396.
