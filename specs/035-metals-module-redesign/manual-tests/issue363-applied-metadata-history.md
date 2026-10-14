# METALS-363 — Manual QA, device and recovery protocol

**Status: ALL SCENARIOS NOT RUN.** QA is reserved for the local final
pre-push/device wave. Do not use a shared remote database or personal/customer
records. Work with minimal seeded, owner-scoped local/dev fixtures only when
explicitly permitted.

1. **Offline single-field edit:** open a test holding, switch fully offline,
   edit Name only, save. Details History shows the exact previously persisted
   Name → locally applied new Name, without a pending/saved-device label.
   Restart app offline; same one entry remains. Repeat separately for Notes
   add/edit/clear; cleared value is null, not an invented empty note.
2. **Multiple offline saves:** change Name A→B and B→C while offline, restart,
   reconnect. Each per-edit request remains individually durable. After
   canonical sync, History includes only the actual server accepted before/after
   for each; replay produces no duplicates.
3. **Clock winner/loser:** on a second device, write a later Name clock and
   older Notes clock. Reconnect first device. Verify only accepted,
   value-changing fields appear; losing Name or Notes candidate
   disappears/corrects without a new UI state. Confirm current holding matches
   authoritative server.
4. **No-op and tuple conflict:** apply a winning clock with the same Name, then
   attempt same clock tuple with conflicting value. No false changed-value
   History; conflict fails atomically, including any concurrently submitted
   Notes candidate.
5. **Mixed correction:** change Weight and Name/Notes simultaneously. Confirm
   exact material before/after unchanged from existing contract, metadata deltas
   only where each clock applies, and one material correction History item.
   Repeat with server-stale financial action: financial revision/material
   changes remain rejected, while independently winning Name/Notes fields retain
   exact immutable canonical deltas in a metadata History row. A losing field is
   absent. Malformed, wrong-hash, foreign-owner or invalid-predecessor requests
   must make zero metadata writes.
6. **Offline restart/ambiguous retry:** lose network immediately after server
   accepts the request; kill app; relaunch and sync. Repeat same ID/hash returns
   the same outcome, no duplicate History. Same ID/new hash remains terminal and
   never overwrites the canonical record.
7. **Foreign-owner boundary:** with separately seeded User A and User B on one
   device, ensure User B sees no User A outcomes after logout/login. Cross-user
   direct RPC and SELECT must be denied or empty, including soft-deleted parent
   cases.
8. **Existing journeys:** verify no change to Add, Sell, Undo, No Longer,
   Delete, historical purchase-rate display/cache, current Metal values, P/L and
   account financial effects. The global All/Sold/Disposed list remains
   terminal-only.
9. **Localization and accessibility:** in English and Arabic, check Name/Notes
   values with Arabic/Latin/numeric content; RTL arrow/word order, wrapped long
   notes, 200% text, TalkBack/VoiceOver reading exact field and before/after.
   Check compact phone, ordinary phone, tablet, landscape and dark mode; capture
   rendered snapshots and compare with the approved reference at the declared UI
   context. A binding fact cannot be overwritten by a planning map.

Record OS/build, tested user-scoped fixture identities, screenshots, whether the
app really disconnected, RPC replay identifiers (no secrets), expected vs actual
Timeline, local/server reconciliation states internally, and remaining blockers.
Visual fidelity and accessibility proof are distinct from unit-test success. If
an existing UI cannot display these exact deltas without redesign, stop and seek
explicit owner UX approval; do not invent pending messaging.

## Authored device automation

`apps/mobile/e2e/maestro/metals/name-notes-history.yaml` drives the seeded 21k
Gold Chain through Name edit, direct Save, visible exact Name delta, Notes
clear, visible exact null-clear delta, app stop/restart and portfolio reopen.
Prerequisites: unchanged authenticated English lifecycle seed and a bundled QA
build or already-loaded dev client; the runner must prove offline mode before
execution. Reseed an isolated local fixture before rerunning because the flow
intentionally changes the holding. No internal DB mutation or private service
call occurs in this flow. **NOT RUN.**

Run the same journey manually in Arabic/RTL, dark mode and enlarged text;
automated English content assertions do not prove visual ordering or spoken
accessibility on devices. Mixed financial/metadata conflict and two-device clock
cases remain manual device journeys, backed by deterministic
unit/integration/public-RPC SQL cases.

Do not run the root db:migrate script for QA: it can invoke a remote db push.
Final SQL verification must use the lead-approved isolated explicit local
database with rollback, never shared remote records.
