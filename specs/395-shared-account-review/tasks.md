# Tasks: Shared account review for Voice and SMS

**Input**: `specs/395-shared-account-review/` — approved `spec.md`, `plan.md`,
`research.md`, `data-model.md`, the scoped contracts (including
`contracts/local-recovery.md`) and `manual-test-plan.md`. **Authority**:
Original spec/B1 approvals were recorded against Constitution **1.7.0**; their
immutable receipts remain valid and unchanged. Technical delivery now follows
Constitution **1.8.0** with the reviewed device-only migration exception
`dd16d5440556b651cb5b6395a00c1c4d37538dcf`. **Execution**: ACTIVE in
`codex/395-shared-account-review`: **32/80 task IDs checked/accepted, 48 still
open** at this immutable task source. Original planning base `main@7838df64` is
**historical**, not the current Main. Trusted pre-policy governance/source
history: `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`; reviewed policy exception
`dd16d5440556b651cb5b6395a00c1c4d37538dcf`. Current Main was verified at
`1d23e48d57cf408d901b4ece15316d055bd2e401` on 2026-10-17 and composed into the
feature checkout. Local feature/policy parent is
`902eee575920051112c5f1988fa0b4d9051194f4`, not Main. Feature PR #396 targets
Main. Separate policy PR #399 remains open and should merge before this feature;
no Main merge or hosted deployment is authorized. First-release integration
evidence is recorded in
[the delivery report](validation/first-release-delivery.md).

Paths below are repository-relative task targets; accepted implementation and
remaining work are distinguished by checked task IDs and their recorded
`workflow-status.md` evidence, not by initial planning prose. `NNN` is the
historical generic SQL-prefix placeholder; T004 reserved **090** for review and
**091** for Add. Checkboxes change only with their own acceptance evidence; 32
accepted task checkboxes do not imply complete feature, device/visual, hosted or
regression acceptance.

## First-release gate supersession — 2026-10-17

Use [first-release-scope.md](validation/first-release-scope.md) to distinguish
the **required ordinary** US6/US5 functionality, owner-scoped atomic Save,
retry/dedup/rollback and protected safe sync from **deferred automatic
recovery** (terminal Add compensation carrier, financial-successor
reconstruction and complex rejected-Add/history replay). Unproven remote
acknowledgement, lost owner/source identity, partial writes or loss of
dirty/pending local data remain blockers; defer advanced restoration by
preserving unresolved data, not by marking it accepted/synced or deleting
evidence.

This annotation **does not remove, renumber, check, uncheck or declare passed
any of the original 80 tasks**. Historical T044/T051/T069 extended recovery
descriptions and their previously authored tests remain reference for future
authorization rather than mandatory first-release completion. All ordinary
Add/default, selected Save, current-owner, native rollback, retry/dedup,
protected sync/pull and privacy suites remain active. Only the standalone
unshipped T069 carrier experiment is retired from active test discovery; its
exact artifact commit `682fa98eb44b8a6b88b9c2675c7debf0fe8fa7bb` is preserved in
the linked scope document. No new acceptance result, SQL, runtime/device check
or hosted deployment is claimed.

## Execution rules

- T001–T004 are **accepted historical intake gates** (see their checked entries
  and evidence in `workflow-status.md`), not work to perform again. Changed
  technical contracts still require their applicable fresh read-only analysis
  and tests-first Red before the next bounded source grant.
- T001 records local SQL/financial-action/sync implementation scope and delivery
  planning, **not hosted deployment**. No subsequent task or policy amendment
  silently authorizes a remote mutation.
- TDD: author unit/integration and controllable E2E tests first. Run the focused
  deterministic Red batch at each dependency boundary before corresponding
  production work; record failing behavior, not missing tooling. Run Green at
  integration/commit boundaries, not after every file. No emulator runs.
- E2E files are authored and statically validated here; actual journeys remain
  unexecuted until owner device testing. Do not claim a Maestro Red/Green run.
- Later workers follow Normal ChatGPT → verified OpenCode FREE models only
  (independently confirm current pricing/IDs and callable runtime) → Antigravity
  Gemini/Claude. Paid OpenCode routes are excluded. Native workers require
  Mohamed's separate explicit prior approval for each exact task/files/duration
  and stop/reassignment boundary, including local checks, reviews, completed-
  native follow-ups and resumed tasks; missing primary capability is not
  approval. No ownership assignment is made by this document. Serialize shared
  files, exports, generators, locale keys and foundation changes.
- `[P]` means independent file sets within the named ready wave, after its
  prerequisites. Unmarked tasks are sequential within their subsection unless
  the dependency table explicitly permits separate lanes.
- No new mockups; scope-specific sidecars override contextual background and
  presentation framing. Reuse CurrencyPicker; R3-04 custom chrome is excluded.

## Phase 1: Setup and approved implementation intake

- [x] T001 Record owner approval of complete review-save/default-create local
      SQL registrations, protected sync/reconciliation, no-effect/zero-net
      support and delivery estimate in
      `specs/395-shared-account-review/workflow-status.md`; separately list
      unapproved hosted deployment.
- [x] T002 Refresh/pin main and feature head, inspect #393 form changes and
      agree non-overlapping integration boundaries in
      `specs/395-shared-account-review/workflow-status.md`; preserve unrelated
      dirty work and use existing dependencies.
- [x] T003 Verify all 23 receipt-bound image/sidecar/dependency revisions with
      `scripts/verify-mockup-binding.js` and record reference-to-surface scope
      in `specs/395-shared-account-review/pre-plan-review.md`; stop on changed
      authority.
- [x] T004 Finalize concrete closed wire schemas, previous-default guard fields,
      zero-net/no-effect rules, safe cloud-field whitelist and reserved SQL
      prefixes 090 review / 091 Add (main ends at 089; 088 gap unavailable) in
      `specs/395-shared-account-review/contracts/financial-save.md` and
      `specs/395-shared-account-review/contracts/account-default-intent.md`;
      reconcile parser/command schema names with their contracts before
      consumers start.

## Phase 2: Foundation — blocking shared contracts and fixtures

**Goal**: One canonical typed source, owned snapshots and honest fixture entry.
T016 was the **mandatory foundation gate and is now accepted** (checked below
with its separate `workflow-status.md` evidence). This foundation acceptance
does **not** complete story route/data-domain/hook/runtime integration, picker,
SMS queue writer, persistence, Save, SQL/sync, network wiring or action
activation; each still needs its own scoped tests, implementation and review.
Historical pre-T016 pure/stateless exceptions below record their original
dependency boundaries, not fresh source grants. **Historical conditional
prerequisite, not a current source grant:** if Core's published namespace plan
and Root analysis prove a T014-M ↔ T028 identity-capture cycle, an atomically
owned queue-UUID acquisition/lease helper may be reviewed for pre-T016
implementation with its own Red and owner/cancellation/empty-cleanup/CAS tests.
No new DB table/column, edited-row renamespace or premature T028 completion.
Every other story production path still waits for the full T005–T016 gate; no
checkbox changes or implementation permission follow from this note.

### Tests first

- [x] T005 [P] Author schema/evidence fixtures and failing validation tests in
      `packages/logic/src/account-review/__tests__/schemas.test.ts`: v1/v2, null
      IDs, unique/dangling refs, spans, omitted versus unknown currency,
      malformed advisory content retaining valid rows.
- [x] T006 [P] Author owned account-read tests in
      `apps/mobile/__tests__/services/account-review-read-model-service.test.ts`:
      active/foreign/deleted accounts, bank children/senders, preferred-currency
      snapshot and batched queries.
- [x] T007 [P] Author parser compatibility/privacy/provider projection tests in
      `scripts/__tests__/account-review-edge-contract.test.ts` and
      `apps/mobile/__tests__/services/account-review-parser-adapters.test.ts`:
      supported Gemini/DeepInfra schema fixtures, old-server handling,
      original-call counts and existing completion/safeguards.
- [x] T008 [P] Author production-gated fixture-entry tests in
      `apps/mobile/__tests__/e2e/account-review-fixtures.test.ts`; specify
      current-user Voice/SMS fixtures for M01–M20 in
      `apps/mobile/e2e/fixtures/shared-account-review.json` without hosted seeds
      or real provider calls.

### Implementation after focused foundation Red

- [x] T009 Implement logic-owned Zod evidence/session/assignment/group/command
      schemas in `packages/logic/src/account-review/schemas.ts`; derive types,
      preserve required category IDs and canonical domain vocabulary, account
      choice null, currency certainty wrapper.
- [x] T010 Implement owned batched snapshots in
      `apps/mobile/services/account-review-read-model-service.ts` using scoped
      account/bank/sender helpers; exclude private balances/full identifiers
      from provider context.
- [x] T011 Generate strict Edge contract/provider projection from T009 in
      `scripts/generate-edge-account-review-contract.cjs` and
      `supabase/functions/_shared/account-review-contract.ts`; add parity
      invocation in `package.json` without broadening legacy response schemas.
- [x] T012 Extend original Voice prompt/request/response in
      `supabase/functions/parse-voice/index.ts` and
      `apps/mobile/services/ai-voice-parser-service.ts`: version negotiation,
      scoped transcript evidence/ref aliases, v1 fallback unknown, existing
      request keys/quotas and no replay/grouping call.
- [x] T013 Extend original SMS chunk context/provider output in
      `apps/mobile/services/ai-sms-parser-service.ts`,
      `apps/mobile/services/ai-sms-parser-response.ts` and
      `supabase/functions/_shared/sms-ai/sms-ai-provider.ts`; validate each
      message's evidence, existing token bounds/refusals, message
      correlation/completion and configured provider policy.
- [x] T014 Implement deterministic source normalization and trusted/local SMS
      adaptation in
      `apps/mobile/services/account-review-source-adapter-service.ts` and
      `apps/mobile/services/sms-account-matcher.ts`; namespace aliases, remove
      v2 account-currency priority, retain source eligibility/live-confirm
      boundaries.
- [x] T015 Add existing test-mode-only fixture access for Voice session/SMS
      review through `apps/mobile/services/account-review-fixture-service.ts`;
      isolate current owner, reject production activation and expose honest
      user-visible outcomes without bypassing the writer.
- [x] T016 Export canonical APIs through `packages/logic/src/index.ts`; record
      foundation Red/Green, generated parity, source adapters and fixture
      readiness in `specs/395-shared-account-review/workflow-status.md` before
      dependent lanes.

## Phase 3: US1 — Eligible default without repetitive review (P1)

**Goal**: Accept a matching eligible default only when account evidence is
absent. **Independent test**: M01–M03 fixture opens with editable default label
and no account-only blocker; ineligible/uncertain cases remain unresolved.
End-to-end Save also requires US6; resolver/UI tests can run independently with
save mocked.

### Tests first

- [x] T017 [P] [US1] Author default/currency/source matrix tests in
      `packages/logic/src/account-review/__tests__/resolution.test.ts`:
      one/several accounts, absent/explicit/uncertain evidence, zero/multiple
      defaults, Cash exclusion, ATM destination and ordinary transfer endpoint
      rules.
- [x] T018 [P] [US1] Author disclosure/Why/editability and other-review-reason
      tests in
      `apps/mobile/__tests__/components/account-review-default-info.test.tsx`,
      plus `apps/mobile/e2e/maestro/account-review/default-account.yaml` before
      UI production.

### Implementation after US1 Red

Pure T019 may start only after accepted T004/T009–T011 canonical schemas,
generated contract parity, owned context and T014-P pure producer, plus
meaningful T017 Red and a new lead-reviewed exclusive source lease. T020's
isolated props-only disclosure/Why-sheet candidate needs accepted I1/T019, its
own T018 component Red and the approved B1 binding. T021, TransactionItem
integration and real callbacks still require T016. No T020 source grant or
checkbox completion follows from this dependency-only proposal.

- [x] T019 [US1] Implement immutable resolution in
      `packages/logic/src/account-review/resolution.ts`: known matching
      currency, preferred only for proven omission, owned eligibility, preserve
      user overrides/other blockers; no arbitrary first account or automatic
      conversion.
- [x] T020 [US1] Render shaped quiet default count/Why sheet in
      `apps/mobile/components/transaction-review/DefaultAccountInfo.tsx`; reuse
      tokens, localized approved copy, accessible actions and runtime bottom
      inset.
- [ ] T021 [US1] Integrate accepted-default presentation through
      `apps/mobile/components/transaction-review/TransactionItem.tsx`; retain
      editable account label and amount/category/currency reasons, using shaped
      props only.
- [ ] T022 [US1] After T020–T021 and T072, obtain owner rendered
      baseline/variant comparisons for governed
      `DefaultAccountInfo.tsx`/`TransactionItem.tsx` against R3-07/R3-12 and
      applicable combined bindings; link evidence/status in
      `specs/395-shared-account-review/tasks.md` (no emulator).
- [ ] T023 [US1] Separately obtain owner screen-reader/focus/announcement and
      inset/keyboard accessibility evidence for
      `DefaultAccountInfo.tsx`/`TransactionItem.tsx`; record in
      `specs/395-shared-account-review/tasks.md`, leaving incomplete if
      untested.

## Phase 4: US2 — Independently confirm one shared draft (P1)

**Goal**: Confirm once without selecting others or writing an account.
**Independent test**: M04–M06/M08 QNB3/CIB1; QNB confirmation affects exactly
three assignments, one row click checks one, CIB untouched. Save requires US6.

### Tests first

- [x] T024 [P] [US2] Author identity/reducer tests in
      `packages/logic/src/account-review/__tests__/shared-groups.test.ts`:
      explicit identity/currency/type/card/provider compatibility, merchant
      false positives, edit/reconfirm, disclosure-required selection,
      remove/Undo generations and late arrivals.
- [ ] T025 [P] [US2] Author atomic SMS group/recovery tests in
      `apps/mobile/__tests__/services/account-review-command-service.test.ts`
      and
      `packages/logic/src/sms-review-drafts/__tests__/account-review-v2-codec.test.ts`:
      v1 choices/fingerprints retained, v2 conflicting snapshots fail closed,
      stale commands, failed writes and owner isolation.
- [x] T026 [P] [US2] Author sheet/group/selection UI tests in
      `apps/mobile/__tests__/components/shared-account-suggestions.test.tsx` and
      independent confirm/edit/remove/Undo journeys in
      `apps/mobile/e2e/maestro/account-review/shared-suggestions.yaml`.

### Implementation after US2 Red

Pure T027 requires **T019 Green plus its own T024 Red** and reviewed disjoint
file ownership; neither checkbox is completed by this dependency note. T028–T030
codec, stateful queue/command writer, and T031 runtime binding still wait for
T016, their applicable Red and ownership/atomicity gates. T031's **independent
view-only components** are conditional on accepted T027 group/reducer types,
their own T026 component Red and frozen B1 bindings; no confirm/Undo reducer,
persistence or hook/service behavior. The complete T031 task remains blocked
until its governed integration. A Core-and-Root-proven minimal atomic owned
queue-UUID acquisition/lease helper might be necessary earlier solely for T014-M
identity capture: freeze its actual API/owned files only after read-only
analysis, own tests-first Red, owner/cancellation/empty-cleanup/CAS proof, with
no new tables/columns or T028 completion claimed. No such helper is authorized
here.

- [x] T027 [US2] Implement canonical evidence identity and immutable group
      commands in `packages/logic/src/account-review/identity.ts` and
      `packages/logic/src/account-review/reducer.ts`; separate confirmation from
      selection, validate nickname uniqueness, tombstones, scoped revisions and
      safe late-chunk merges. T054 reconciliation adds canonical `set_filter` as
      a scoped navigation-only transition: review revision +1 only on change,
      business generation and row/group revisions unchanged, no-op on same
      filter, preserve valid Remove Undo, reject owner/stale/frozen Save and
      ABA.
- [x] T028 [US2] Extend existing
      `packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts` with v1
      reader/v2 writer; preserve existing fields/choices, unknown legacy
      provenance, durable removal and no durable Undo/new table.
- [ ] T029 [US2] Implement serialized owned group+selection writes in
      `apps/mobile/services/account-review-command-service.ts` and
      `apps/mobile/services/sms-review-draft-repository.ts`; atomically migrate
      touched groups, preserve expiry/Review later and actionable rollback.
      Include V2 nine-header legacy decode as All, explicit tenth `filter` on
      new writes, exact owner/shared-header checks and all-live-row atomic
      `set_filter` persistence/rollback; no Undo/private preimage rewrite.
- [ ] T030 [US2] Add lifecycle/cancellation facade in
      `apps/mobile/hooks/useAccountReview.ts` and adapt
      `apps/mobile/hooks/useTransactionReviewSelection.ts` to the canonical
      reducer; no hook DB writes/calculations, stale callback rollback must not
      replace newer accepted state. Publish
      `readModel: AccountReviewReadModel     | null` using the actual owned
      account read-service and pure T059 projection; protect Voice
      readiness/reloads and SMS command refresh with owner/generation checks;
      filter navigation must retain Undo, not business shadows or copied
      readiness.
- [ ] T031 [US2] Build shaped independent action/edit/all-groups surfaces in
      `apps/mobile/components/transaction-review/SharedAccountSuggestions.tsx`
      and
      `apps/mobile/components/transaction-review/EditSuggestedAccountSheet.tsx`;
      locked group currency, linked-count disclosure, no Confirm all, FlatList
      and all statuses reachable.
- [ ] T032 [US2] After T031/T072, obtain owner rendered baseline/variants for
      governed suggestion/edit surfaces against R1-07, R2-02/03, R3-06/09; link
      `specs/395-shared-account-review/tasks.md` evidence without treating
      contextual old backgrounds as targets.
- [ ] T033 [US2] Separately obtain owner accessibility evidence for suggestion
      menu/edit/list/Undo in
      `SharedAccountSuggestions.tsx`/`EditSuggestedAccountSheet.tsx`; record
      focus, semantics, announcements, keyboard and bottom inset in
      `specs/395-shared-account-review/tasks.md`.

## Phase 5: US3 — Account matching and currency uncertainty (P1)

**Goal**: Explicit choice with correct row/group scope, no amount conversion.
**Independent test**: M07/M09 chooser cancel is inert; row change affects one,
group replacement its disclosed count; Choose another uses existing picker.

### Tests first

- [x] T034 [P] [US3] Author scoped candidate/currency command tests in
      `packages/logic/src/account-review/__tests__/account-choices.test.ts`:
      same currency/type/owner, deleted/stale candidates, per-row detach, group
      replacement, material edit reconfirm and preserved numeric amounts.
- [x] T035 [P] [US3] Author existing picker/sheet tests in
      `apps/mobile/__tests__/components/account-review-choices.test.tsx`; null
      means no confirmed selection, cancel/Back unchanged, old callers
      compatible; author
      `apps/mobile/e2e/maestro/account-review/choose-account-currency.yaml`.

### Implementation after US3 Red

T037 modifies the existing shared CurrencyPicker's selection/compatibility
contract and remains T016-gated with T035 compatibility Red. T038's **view-only
controlled-props sheets** may be considered after accepted T036 candidate and
command/output types, T035 component Red and B1, independently of the real
picker: Choose another is only a callback, not navigation. Actual CurrencyPicker
delegation and T039 remain T016-gated. No source grant, automatic choice,
reducer or business logic is implied.

- [x] T036 [US3] Add candidate/row-account/group-replacement/currency
      transitions in `packages/logic/src/account-review/reducer.ts` and
      `packages/logic/src/account-review/candidates.ts`; serialize after T027,
      enforce generation guards and no default fallback after explicit
      rejection.
- [x] T037 [US3] Add nullable unconfirmed selection and optional contextual
      sub-label to `apps/mobile/components/currency/CurrencyPicker.tsx`,
      preserving existing list/search/navigation and direct explicit selection
      semantics.
- [x] T038 [US3] Implement shaped chooser/conflict sheets in
      `apps/mobile/components/transaction-review/AccountChoiceSheet.tsx` and
      `apps/mobile/components/transaction-review/CurrencyConfirmationSheet.tsx`;
      distinguish row/group linked scope, meaningful masked identity and Choose
      another delegation to CurrencyPicker.
- [ ] T039 [US3] Wire scoped callbacks through
      `apps/mobile/hooks/useAccountReview.ts` and
      `apps/mobile/components/transaction-review/TransactionItem.tsx` after
      T030/T021; preserve unrelated confirmations/selections and known amount
      input.
- [ ] T040 [US3] After T037–T039/T072, obtain owner rendered baseline/variants
      for governed choice/conflict sheets and context-only CurrencyPicker
      against R1-03/11/12, R3-03/04/13; record scoped evidence in
      `specs/395-shared-account-review/tasks.md`.
- [ ] T041 [US3] Separately obtain owner chooser/picker accessibility evidence
      (no implied selection, cancel focus, RTL identity, keyboard/inset
      reachability) for those governed paths; record in
      `specs/395-shared-account-review/tasks.md`.

## Phase 6: US6 — Complete selected save and safe recovery (P1)

**Goal**: One local atomic action and one server CAS; no partial/unused writes.
**Independent test**: M13–M15/M19 selected fixture saves only its needed account
and rows; injected failure/replay leaves no duplicate or partial effects. Writer
tests consume frozen plain review fixtures and need no UI completion.

### Tests first

- [x] T042 [P] [US6] Author closed payload/exact-effect tests in
      `packages/logic/src/financial-actions/__tests__/review-batch-save.test.ts`:
      selected-only descriptors, no raw evidence/PII, canonical decimal/minor
      units, zero-net guards, absent-create guards and unchanged old-operation
      acceptance. Review-only T046 follow-up Red: multi-currency confirmed Voice
      Cash groups; all-new Cash/Bank/Wallet first-active selection by frozen
      actual account-create UUID order; active-existing/no-default preservation;
      required `creationDefaultSnapshot` iff any new account; missing/stale/
      duplicated default guards; no one-Cash limit or legacy-v1 widening.
- [ ] T043 [P] [US6] Author local atomic/failure/idempotency tests in
      `apps/mobile/__tests__/services/account-review-save-service.test.ts`:
      new/existing accounts/children, ATM endpoints, uniqueness,
      categories/owner, fingerprint dedup across transactions/transfers, unused
      groups, all-dedup cleanup-only, frozen intent/double tap and exact legacy
      balance parity. Test T043 approved localRef = selected row.rowId /
      group.groupId (frozen actual IDs distinct), deterministic BANK child
      UUID-v8 sender aliases with existing normalization/no NFC, CASH without
      children, owner/source/revision rechecks after awaits; ATM destination
      from eligible existing Cash or genuine canonical referenced group only, no
      invented destination/account. Extend Red to the strict nine-key local
      snapshot and actual prepared SMS/account/child/default postimage hashes;
      prove full same-batch rollback, cache/fresh-SQLite restart, nullable
      legacy root and no Voice transcript persisted. Do not claim a carrier
      already exists.
- [ ] T044 [P] [US6] Author complete push/rejection/restart tests in
      `apps/mobile/__tests__/services/account-review-sync.test.ts`: missing
      group never sent, root/child generic-push isolation, stale/hash-conflict
      rejection, exactly-once compensation/SMS restoration without overwriting
      newer choices. Cover private-field exclusion from RPC/outbox/push/logs and
      canonical dependency ordering, accepted/rejected/unsupported predecessor
      outcomes, queue pruned_empty versus discard/expiry/new-namespace races,
      partial 30-day redaction, clone-restart and no second compensation.
- [ ] T045 [P] [US6] Author pgTAP all-or-nothing
      CAS/replay/privacy/ownership/old-operation tests, including 090 review
      owner-wide `creationDefaultSnapshot` concurrency/first-active multi-type
      creation and unchanged 091 Add intent isolation, in
      `supabase/tests/review_batch_save.test.sql` and controlled Save/Review
      later/restart journeys in
      `apps/mobile/e2e/maestro/account-review/save-recovery.yaml`; fault
      branches unsupported by fixture harness remain service/pgTAP, not claimed
      E2E.

### Implementation after US6 Red and T001/T004 approval

Pure T046 schema/financial-effect registry validation alone may start after its
own meaningful T042 Red, frozen T004, an **unchanged legacy v1 financial-action
regression baseline**, and lead-reviewed exclusive ownership. This does not
authorize financial writes, runtime action activation or server registration.
T047–T053 remain behind T016, their applicable Red, and separately approved
local-writer/SQL implementation, race-proof and sync/reconciliation gates.

- [x] T046 [US6] Register canonical strict `review.batch-save/v1` schema/effect
      mapping in `packages/logic/src/financial-actions/review-batch-save.ts` and
      `packages/logic/src/financial-actions/account-balance-effects-registry.ts`;
      required frozenIntentDigest for the original frozen selection/group/plan,
      minimal opaque correlation refs, persisted account fields only, no
      transcript/SMS/Undo cloud payload. Exact review-only optional
      `creationDefaultSnapshot` is required iff an account is created after
      dedup; no Cash singleton, first-active default by frozen actual create
      UUID order across Cash/Bank/Wallet, none when active snapshot nonempty;
      unchanged Add `expectedDefaultSnapshot` and old tuple definitions.
- [x] T047 [US6] Extend
      `apps/mobile/services/core-account-financial-action-service.ts` with
      explicit new-version adapter preserving affected zero-net account guards
      and absent-create guards; do not widen legacy v1, fabricate nonzero
      effects or split groups.
- [ ] T048 [US6] Implement stable selected intent/writer in
      `apps/mobile/services/account-review-save-service.ts` and reuse
      preparation in `apps/mobile/services/pending-account-service.ts`;
      revalidate inside one writer, post exact selected deltas once, freeze T043
      row/group/child alias map before awaits and check again after, capture
      owner-wide `creationDefaultSnapshot` iff any new account, atomically
      select exactly one first-active default by frozen actual create IDs or
      preserve existing/no default, no AI opening or default-on-confirm. Create
      an optional typed local snapshot builder on the linked plan, using
      immutable cached preimages and actual prepared postimages only after
      ownership validation. Set the device-private root column in the SAME
      adapter batch; legacy tuples remain null/unmodified.
- [ ] T049 [US6] Adapt `apps/mobile/services/sms-review-draft-save-service.ts`
      to complete writer and local cleanup/rebind of unchanged unselected linked
      rows in same transaction; dedup-only cleanup has no fake financial action
      and no unrelated legacy caller migration. Respect independently validated
      `toAccountEvidence`; ATM destination is existing eligible Cash or truly
      canonical confirmed referenced group, never invented destination/account.
      Update private queuePreimage disposition on proven empty-queue pruning,
      discard/reset/expiry/replacement atomically with cleanup; per-draft 30-day
      parsedAt cutoff is inclusive and redacts only expired/superseded raw
      review data. Never resurrect a newer queue.
- [ ] T050 [US6] Extend protected collector/version/entity recognition in
      `apps/mobile/services/sync/account-protected-fields.ts`; suppress every
      action-owned root/child from generic LWW and fail incomplete action push
      without marking rows synced. Exclude the private root column from
      generic/dedicated pull mapping inputs, push/RPC/outbox/outcomes/logs;
      preserve it by validated owned action identity in the dedicated pull
      writer. Dispatch actual unresolved default predecessors before dependent
      financial roots.
- [ ] T051 [US6] Extend
      `apps/mobile/services/financial-action-reconciliation-service.ts` for
      complete account/child/financial/default effects and SMS mapping
      restoration exactly once; owner scoped, preserve newer canonical data and
      existing Voice recovery boundary. Cold restart validates
      owner/action/session and private snapshot, prepared
      domain/effect/default/child/postimage hashes and queue lifecycle before
      once-only recovery. Missing evidence/newer edits fail closed; no Voice
      review persistence or remote snapshots.
- [ ] T052 [US6] Implement approved next-prefix
      `supabase/migrations/090_shared_account_review_save.sql`: strict
      tuple/schema/owner-wide creation default snapshot/active refs/unique
      fingerprints/currency/category/expected revisions, complete server
      transaction, replay/hash conflict and old tuple compatibility; no hosted
      application/reset/backfill.
- [ ] T053 [US6] Validate complete local migration state and regenerate
      authoritative `packages/db/src/supabase-types.ts` plus genuinely changed
      schema artifacts with `npm run db:sync-local`; inspect removals, retain
      old types, record no-domain-change outcome if applicable in
      `specs/395-shared-account-review/workflow-status.md`; never use
      remote-pushing `db:migrate` in this scope. Reserve versioned device-only
      Watermelon migration31 after max30, generator-consumed local-column
      override, non-generated model field and regenerated schema in one reviewed
      change. Verify fresh upgrade, repeated db:sync-local parity, public type
      retention, owned SQLite pull preservation and absence from cloud types.
      db:migrate runs remote db:push and is NOT authorized for local-only
      generation.
- [ ] T054 [US6] Wire validated Voice route boundary and selected save through
      `apps/mobile/app/(private)/voice-review.tsx` and shared SMS container
      `apps/mobile/components/transaction-review/TransactionReview.tsx` after
      T027/T029/T030/T039/T049–T053 and T059 projection; bind canonical
      filter/active-filter bulk command to the same CAS session and shaped
      `readModel`, no UI shadow filter/counts or second account authority;
      successful local commit precedes navigation, honest failure retains
      choices, zero extra provider call.
- [ ] T055 [US6] After T054/T072, obtain owner rendered baseline/variants for
      governed `TransactionReview.tsx`/`ReviewActionBar.tsx`
      save-failure/retry/Review later against R3-14; record
      functional-versus-visual evidence in
      `specs/395-shared-account-review/tasks.md`.
- [ ] T056 [US6] Separately obtain owner failed-save/retry/Review later
      accessibility evidence for governed review/footer paths, including focus
      recovery and safe-area actions; record in
      `specs/395-shared-account-review/tasks.md`.

## Phase 7: US4 — Compact conditional review states (P2)

**Goal**: One compact region, independent actions and truthful filters/counts.
**Independent test**: M10–M11 exactly reproduce combined 7/5/2, default-only,
issues-only, confirmed one-selected, clean and empty Selected fixtures.

### Tests first

- [ ] T057 [P] [US4] Author count/filter/read-model tests in
      `packages/logic/src/account-review/__tests__/read-model.test.ts`: distinct
      issue rows, actual checked count, linked group counts, active-filter
      ready-only select/clear and no confirmation from bulk selection.
- [ ] T058 [P] [US4] Author
      baseline390/compact340/RTL/font-scale1.35/layout/inset UI tests in
      `apps/mobile/__tests__/components/account-review-panel.test.tsx`; test
      each conditional state, long list, three filters/separate toolbar and
      authored `apps/mobile/e2e/maestro/account-review/conditional-states.yaml`.

### Implementation after US4 Red

T060's **static shaped compact panel** is conditional on accepted T059
projection/count types, its T058 component Red and accepted T020/T031
presentation. T059 still requires its governed T036/read-model dependencies:
this note does not unblock T059 or T060 now. T061 filters/toolbar/Review shell
and T054 Save route stay T016-gated. No panel computes its own count, group
readiness or filter/business state.

- [ ] T059 [US4] Implement pure projection/filter/bulk-ready commands in
      `packages/logic/src/account-review/read-model.ts` and
      `packages/logic/src/account-review/reducer.ts` after T036; derive counts
      from actual rows, preserve overrides and group confirmation. Projection
      always consumes canonical `session.filter` and current owner snapshots; do
      not duplicate reducer readiness, and do not mutate state/Undo or invent
      separate filter command authority.
- [ ] T060 [US4] Build shaped compact conditional panel/filter-empty recovery in
      `apps/mobile/components/transaction-review/AccountReviewPanel.tsx`; reuse
      T020/T031, all-group list, quiet default-only state, no empty clean
      container, no recorder no-results reuse.
- [ ] T061 [US4] Integrate three filters and separate Select ready/Clear toolbar
      in `apps/mobile/components/transaction-review/TransactionReview.tsx` and
      `apps/mobile/components/transaction-review/ReviewActionBar.tsx` after
      T027/T029/T030/T054/T059; route `set_filter` and bulk commands through
      current facade CAS and `readModel` (no shadowed filter/selection/counts);
      shared PageHeader/actions, memoized FlatList rows and source-specific
      disclaimer/recovery.
- [ ] T062 [US4] After T060–T061/T072, obtain owner rendered baseline/variants
      for governed panel/shell/rows/footer against R2-01 concept and
      R3-05/07/08/09/10/11/15 final states; record all exact counts and scoped
      variants in `specs/395-shared-account-review/tasks.md`.
- [ ] T063 [US4] Separately obtain owner accessibility evidence for
      panel/filter/toolbar/long-list/empty-state actions in governed
      `AccountReviewPanel.tsx`/`TransactionReview.tsx`/`ReviewActionBar.tsx`;
      record semantics, announcements and keyboard/inset reachability in
      `specs/395-shared-account-review/tasks.md`.

## Phase 8: US5 — Default flag on Add and friendly helpers (P2)

**Goal**: Existing Edit pattern on Add; default changes only on successful
create. **Independent test**: M12/M18 first ON/disabled, later OFF/ON, no
default, cancel/failure, zero/nonzero balances preserve sole-default and
existing fields.

### Tests first

- [ ] T064 [P] [US5] Author default-intent/action tests in
      `apps/mobile/__tests__/services/account-default-intent.test.ts` and
      `packages/logic/src/financial-actions/__tests__/account-create-default.test.ts`:
      first/later/no/multiple default snapshots, zero/nonzero opening,
      concurrent metadata guards, stable IDs and failed local/remote rollback.
- [ ] T065 [P] [US5] Author Add/Edit control/helper/required-fields regressions
      in `apps/mobile/__tests__/components/account-default-control.test.tsx`;
      preserve provider/sender/card and read-only Edit type/currency; author
      `apps/mobile/e2e/maestro/account-review/add-default-account.yaml`.
- [ ] T066 [P] [US5] Author atomic server
      default-clear/create/children/opening/replay tests in
      `supabase/tests/account_create_default.test.sql`; keep active-default
      unique index, wrong-owner and prior-default race rejection, no independent
      clear/create.

### Implementation after US5 Red and approved SQL scope

- [ ] T067 [US5] Register closed account/default intent tuple in
      `packages/logic/src/financial-actions/account-create-default.ts` and
      shared registry after T046; exact metadata/no-effect guards, preserve old
      create and Edit operations.
- [ ] T068 [US5] Implement validated atomic zero/nonzero create/default intent
      in `apps/mobile/services/account-service.ts` using T047 foundation;
      revalidate active/default snapshot, one account/children/default/opening
      commit, no post-create Edit toggle.
- [ ] T069 [US5] Implement approved next-prefix
      `supabase/migrations/091_account_create_default.sql` and extend protected
      sync/reconciliation after T050–T052/T067; one guarded clear/create/server
      transaction, preserve unique index/old tuple, regenerate complete local
      types as T053, no hosted deployment. The SDK protected-sync writer/ACK
      seam depends on the tests-first
      `apps/mobile/__tests__/services/sync/account-sync-sdk-hooks.sqlite.integration.test.ts`
      and
      `specs/395-shared-account-review/validation/t069-watermelon-sync-hooks.md`;
      use exact-version/content-pinned `scripts/postinstall.js` extension only
      after Root's meaningful real-SQLite Red and separate source grant.
      Missing/incompatible runtime hook capability must fail closed; do not
      treat generic push filtering alone as ACK/writer revalidation.

      Bounded T069 terminal-liveness technical substep (not an extra task or
      checkbox): after a real Add B rejection/atomic A restoration, later
      genuine ordinary Edit choosing owned D must sync before B's first ACK
      and after a prior terminal ACK; keep corrupt terminal F3 refusing.
      Reuse ONLY the original local private column: unchanged exact 12-key
      Add bytes + closed versioned completion carrier, complete rooted
      receipt/original-snapshot/restored-postimage/double-digest validation,
      same dedicated compensation adapter batch, all-readers strict decode,
      complete original accepted/pending creator membership, no backfill or
      legacy relaxation. Preserve existing Add-aware root pull at current
      bd245 Main; update only its terminal decoding boundary, not its review
      receipt/remapping/privacy corrections. Keep separate owner-scoped Edit
      metadata UPDATE and SDK writer/ACK guards; no new financial effects,
      SQL/schema/API states, source lease or test ownership. The required
      independently authored real-SQLite Red and failure matrix, rooted
      cross-reader APIs and byte ceilings are in
      `validation/t069-compensation-completion-contract.md`. Root runs
      fresh analyze + actual Red before any source grant.

- [ ] T070 [US5] Add unsaved intent/default block to
      `apps/mobile/app/(private)/add-account.tsx` and approved helper to
      `apps/mobile/app/(private)/edit-account.tsx`, reusing existing flag
      pattern and lifecycle facade; placement after balance/before SMS, first
      ON/disabled, later OFF, source/type-aware copy; reconcile #393, preserve
      unrelated form behavior.
- [ ] T071 [US5] After T070/T072, obtain owner rendered baseline/variants for
      governed Add Default block/Edit helper against R3-01/02 and R1-08 scoped
      binding; record keyboard/safe-area/form regression evidence in
      `specs/395-shared-account-review/tasks.md`.

## Phase 9: Integration, independent audits and delivery

- [ ] T072 Integrate approved EN/AR copy in
      `apps/mobile/locales/en/transactions.json`,
      `apps/mobile/locales/ar/transactions.json`,
      `apps/mobile/locales/en/accounts.json` and
      `apps/mobile/locales/ar/accounts.json`; locate actual namespaces before
      editing and record any path reconciliation, preserve B1
      wording/plurals/RTL. This task serializes shared locale edits after story
      UI exists, before rendered checks.
- [ ] T073 Separately obtain owner accessibility evidence for governed
      `add-account.tsx`/`edit-account.tsx` Default/helper controls:
      switch/disabled/required semantics, helper reading order, RTL and
      keyboard/bottom reachability; record in
      `specs/395-shared-account-review/tasks.md` (US5 evidence, after
      T070/T072).
- [ ] T074 Author and execute deterministic final regressions in
      `apps/mobile/__tests__/services/account-review-regression.test.ts`:
      M16/M20 zero extra transport/usage, v1/v2/provider projection,
      owner/logout, late chunks/tombstones, existing quota/empty-result and
      live-SMS boundaries. Include 30-day equality/partial-expiry and
      discard/new-namespace non-resurrection, cloned restart, owner/logout,
      malformed evidence, dependency blocks, same-cache failure retry, private
      push exclusion and Voice no-transcript regression vectors.
- [ ] T075 Add synthetic 500-row/100-group projection/action benchmark in
      `packages/logic/src/account-review/__tests__/performance.test.ts`; report
      median/p95 and batched-query counts in
      `specs/395-shared-account-review/workflow-status.md`, investigate
      nonlinear/N+1 work without claiming device latency from unit timings.
- [ ] T076 Complete independent TypeScript/hooks → logic →
      database/security/sync → style/coverage reviews against current code and
      all approved scopes; record findings/dispositions in
      `specs/395-shared-account-review/workflow-status.md` using agreed worker
      order, no review before implementation.
- [ ] T077 Reconcile every M01–M20 case with actual unit/integration/pgTAP/E2E
      filenames and honest execution status in
      `specs/395-shared-account-review/manual-test-plan.md`; distinguish
      authored YAML/static validation from run journeys and
      real-provider/manual-only cases.
- [ ] T078 Run one integration/commit check batch for affected Jest suites,
      generated contract parity, pgTAP against local DB, logic/db/mobile
      typechecks, architecture lint, i18n/privacy, E2E static validation,
      binding hashes and git diff checks; record commands/results in
      `specs/395-shared-account-review/workflow-status.md`; no emulator/provider
      calls or hosted migrations.
- [ ] T079 Prepare owner-only
      device/live-provider/offline/restart/rendered/accessibility checklist in
      `specs/395-shared-account-review/quickstart.md`; keep
      T022–T023/T032–T033/T040–T041/T055–T056/T062–T063/T071/T073 pending until
      real evidence, and document separately approved compatible-server rollout
      before enabling new contracts.
- [ ] T080 Update implementation-aligned `docs/business/business-decisions.md`,
      `specs/395-shared-account-review/README.md`,
      `specs/395-shared-account-review/workflow-status.md` and PR #396 coverage
      description; normal hooks, consolidated commit/push, refresh exact
      CI/reviews, report functional/visual/manual/deployment readiness
      separately.

## Dependency DAG and file serialization

Phase order expresses priority, not permission to skip integration dependencies.
Within each implementation subsection, unmarked tasks run in listed order
**except** the three narrowly released side-effect-free pure tasks, conditional
_props-only_ presentation slices and the conditional namespace- identity
prerequisite if Core's plan proves the T014-M ↔ T028 cycle. Each requires its
own meaningful Red, Root analysis and lead-reviewed file-specific approval; no
conditional helper API/source ownership is granted here. None completes T016 or
opens user-facing runtime wiring. A stateless subset does not complete
T020/T031/T038/T060; T037, all data/domain/workflow hooks and route/container
integrations remain blocked. Presentation i18n/theme/safe-area context hooks
(useTranslation/useSafeAreaInsets/useModalBottomInset) and React render memo
hooks are permitted with shaped props/callbacks only; components own no
account/review/selection state. T018's parent test journey may control
modal-visible state without granting child workflow ownership.

| Wave                              | Prerequisites                                                                                                                | Ready work                                                                                 | Explicit completion dependency                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Intake                            | Tasks/analyze accepted, implementation scope authorized                                                                      | T001 → T002 → T003 → T004                                                                  | All production blocked until these gates                                                                                        |
| Foundation Red                    | T004                                                                                                                         | T005–T008 parallel                                                                         | Meaningful deterministic Red before T009                                                                                        |
| Foundation implementation         | Foundation Red                                                                                                               | T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016                                      | T016 still required before runtime integration; early pure exceptions below do not complete it                                  |
| Early pure Red                    | Frozen T004 plus accepted schemas/parity/context/producer as applicable                                                      | T017; T024; T042 in disjoint test files                                                    | Actual task-specific Red; no runtime, SQL or integration permission                                                             |
| Early pure implementation         | T017 Red + accepted foundation → T019; T019 Green + T024 Red → T027; T042 Red + T004 + legacy baseline → T046                | Pure T019, T027, T046 only (separate reviewed source leases)                               | Side-effect-free declarations/logic; T016 remains INCOMPLETE and mandatory downstream                                           |
| Conditional identity prerequisite | Only if published Core namespace plan + Root analysis prove T014-M ↔ T028 cycle                                              | Proposed smallest owned queue-UUID acquisition/lease helper (API/paths NOT frozen)         | Separate real Red + owner/cancel/empty-cleanup/CAS guards; no new tables/columns, no T028/T016 completion or runtime enablement |
| Story Red                         | T016 except isolated T018/T026/T035/T058 props-only UI Red                                                                   | US1 T018; US2 T025–T026; US3 T034–T035; US6 T043–T045; US4 T057–T058; US5 T064–T066        | Static test fixtures only pre-T016; stateful/persistence/story wiring still held                                                |
| Conditional props-only UI         | Approved B1 + accepted I1/T019 + each own component UI Red                                                                   | T020 first; T031 after T027/T026; T038 after T036/T035; T060 after T059/T058 and T020/T031 | Root dependency decision and existing speckit.analyze first; no source grant/T016 bypass                                        |
| Resolution presentation           | Accepted I1/T019 + T018 component Red + B1 for T020 static; T016 for T021                                                    | T020 view-only → T021 integration                                                          | T020 conditional only; T021/TransactionItem remains held                                                                        |
| Shared state runtime              | T027 Green + T026 UI Red for static T031; T016/T025–T026 for runtime                                                         | T028 → T029 → T030 → T031                                                                  | Only shaped T031 components conditionally early; codec/writer/hooks held                                                        |
| Choice                            | Accepted T036 + T035 UI Red for static T038; T016 for T037                                                                   | T036 → T037 / T038 → T039                                                                  | T037 existing-picker changes and T039 delegation require T016, T021/T030                                                        |
| Financial save runtime            | T046 Green incl. all-type `creationDefaultSnapshot`/multi-Cash Red follow-up, T016, T043–T045 Red, approved SQL/writer scope | T047 → T048 → T049 → T050 → T051 → T052 → T053                                             | No Save/writer/network activation without independent SQL/raceproof/local-writer gates                                          |
| Save routes                       | T027, T029, T030, T039, T049–T053, T059                                                                                      | T054                                                                                       | Canonical filter and owned readModel before route; no legacy writer or UI shadow fallback                                       |
| Conditional UI                    | Accepted T059 + T058 UI Red + T020/T031 for static T060                                                                      | T059 → T060 → T061                                                                         | T061 needs T027 set_filter, T029 V2 durability, T030 shaped facade and T054; no shadow state                                    |
| Account intent                    | US5 Red, T046–T053 (090 review before 091 Add)                                                                               | T067 → T068 → T069 → T070                                                                  | Shared registry/foundation/sync edits serialize after US6; T002 reconciles #393 before forms                                    |
| Final integration                 | T061, T070                                                                                                                   | T072 → T074 → T075 → T076 → T077 → T078 → T079 → T080                                      | Failures require focused corrections/rechecks, not repeated unrelated full checks                                               |
| Rendered/a11y                     | Each governed UI task and T072                                                                                               | T022–T023, T032–T033, T040–T041, T055–T056, T062–T063, T071/T073                           | Owner physical-device evidence; source tests never close these tasks                                                            |

Serialization: reducer T027 → T036 → T059; hook T030 → T039; row T021 → T039;
review shell T054 → T061; registry T046 → T067; foundation T047 → T068
integration; protected sync/reconciliation/SQL T050–T053 → T069; all locales
T072 only. Generated exports/DB types have one integration owner. Do not run
concurrent workers against these same files. T072 path discovery is technical
reconciliation only; approved copy meaning must not change.

**T054 technical reconciliation / tests-first packet (2026-10-16):** Keep T027's
immutable reducer as the sole `set_filter` authority with
owner/session/review/business-generation CAS and filter-only review-revision
increments, preserving valid Remove Undo (current filter survives Undo). T029's
V2 codec/writer must read original nine-field headers as All without rewriting
physical bytes and persist ten-field filter headers on all owned drafts
atomically. T030 consumes the authenticated T010 read service, calls T059's pure
projection and exposes only `AccountReviewReadModel | null`, guarding Voice/SMS
loads and async owner changes. T054/T061 bind those APIs to the existing
approved panel and bulk actions, never local filtering of a copied session or
second account read authority. New unit/SQLite/hook Red tests and a fresh Root
Speckit analysis precede any production source grant. These annotations add
**zero** new tasks, accepted checkmarks, source activation, provider/SQL changes
or new R3/B1 behavior.

### Independent and parallel examples per story

| Story | Safe parallel test-authoring example after foundation  | Independent checkpoint                                                |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| US1   | T017 resolver tests + T018 UI/YAML                     | Default truth table and quiet disclosure; complete Save after T054    |
| US2   | T024 reducer + T025 persistence + T026 UI/YAML         | Confirm QNB3/select1/remove safely; persistence checked without UI    |
| US3   | T034 command tests + T035 chooser/YAML                 | Row/group scope and existing nullable picker; no amount conversion    |
| US6   | T042 payload + T043 writer + T044 sync + T045 SQL/YAML | Complete selected atomic writer/CAS/failure replay independent of UI  |
| US4   | T057 projection + T058 component/YAML                  | Exact conditional counts/filters; production integrates after T054    |
| US5   | T064 action + T065 form/YAML + T066 pgTAP              | First/later intent tested independently; shared foundation serialized |

After task-specific Red, pure T019 and T046 may proceed in disjoint lanes; T027
follows T019 Green and T024 Red. Once T016 completes, T047–T053 can overlap
other ready state/UI work with distinct ownership and their independent
SQL/local-writer gates. Shared forms are not a second simultaneous
sync/foundation lane. Rendered and accessibility reviews are separate evidence
activities, not additional production writers.

## Requirement and success coverage

All 24 FRs and eight buildable SCs have explicit tasks; this is planning
coverage, not evidence that tests pass or behavior exists.

| Requirement | Task IDs                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- |
| FR-001      | T017,T019,T021,T043,T054                                                                            |
| FR-002      | T018,T020,T021,T054                                                                                 |
| FR-003      | T014,T017,T019                                                                                      |
| FR-004      | T005,T012,T013,T014,T017,T019,T034,T036                                                             |
| FR-005      | T005,T007,T009,T011,T012,T013,T024,T027,T028                                                        |
| FR-006      | T026,T027,T029,T031,T036,T038                                                                       |
| FR-007      | T024,T026,T027,T029,T031,T043                                                                       |
| FR-008      | T024,T026,T027,T030,T031                                                                            |
| FR-009      | T024,T025,T027,T029,T031,T032                                                                       |
| FR-010      | T034,T035,T036,T038,T039                                                                            |
| FR-011      | T035,T036,T037,T038,T040                                                                            |
| FR-012      | T024,T027,T034,T036,T039                                                                            |
| FR-013      | T057,T058,T060,T061,T062                                                                            |
| FR-014      | T026,T031,T058,T060,T062                                                                            |
| FR-015      | T057,T058,T059,T061                                                                                 |
| FR-016      | T064,T065,T066,T067,T068,T069,T070                                                                  |
| FR-017      | T064,T065,T066,T068,T069,T070                                                                       |
| FR-018      | T004,T042,T043,T045,T046,T047,T048,T049,T052,T053,T054                                              |
| FR-019      | T025,T028,T029,T044,T049,T051,T053,T054,T074                                                        |
| FR-020      | T007,T011,T012,T013,T014,T054,T074                                                                  |
| FR-021      | T005,T006,T007,T009,T010,T014,T024,T034,T042,T043,T045,T048,T052,T053,T074                          |
| FR-022      | T018,T022,T023,T026,T032,T033,T035,T040,T041,T055,T056,T058,T062,T063,T065,T070,T071,T072,T073      |
| FR-023      | T002,T065,T068,T070,T071,T073,T076,T077                                                             |
| FR-024      | T001,T002,T003,T016,T076,T078,T080                                                                  |
| SC-001      | T024,T026,T027,T029,T031,T043                                                                       |
| SC-002      | T057,T058,T059,T060,T061,T062                                                                       |
| SC-003      | T017,T018,T019,T043,T054                                                                            |
| SC-004      | T007,T012,T013,T014,T054,T074                                                                       |
| SC-005      | T042,T043,T044,T045,T046,T047,T048,T049,T050,T051,T052,T053                                         |
| SC-006      | T064,T065,T066,T067,T068,T069,T070                                                                  |
| SC-007      | T005–T008,T015,T017–T018,T024–T026,T034–T035,T042–T045,T057–T058,T064–T066,T074,T075,T077,T078,T079 |
| SC-008      | T003,T022,T032,T040,T055,T062,T071,T076,T078,T079                                                   |

## Manual scenario / authored automation mapping

Exact proposed filenames are in the referenced test tasks. All automation is
unwritten/unexecuted at task generation; scenario results remain pending.

| Manual cases | Deterministic test tasks | Authored Maestro target task                             | Manual-only extension                                                               |
| ------------ | ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M01–M03      | T005,T007,T017,T018,T034 | T018,T035                                                | Real Voice/SMS interpretation                                                       |
| M04–M06,M08  | T024,T025,T026           | T026                                                     | Interruption, long localized names                                                  |
| M07,M09      | T034,T035                | T035                                                     | Real picker/keyboard/screen reader                                                  |
| M10–M11      | T057,T058                | T058                                                     | Rendered variants T062/T063                                                         |
| M12,M18      | T064,T065,T066           | T065                                                     | Real Add/Edit/balance controls                                                      |
| M13–M15      | T025,T043,T044,T045      | T045                                                     | Failure injection only if fixture supports honest visible failure; physical restart |
| M16,M20      | T005,T007,T024,T025,T074 | Existing story fixture flows; no live provider E2E claim | Configured-provider and usage verification                                          |
| M17          | T018,T026,T035,T058,T065 | Existing UI journey targets                              | All rendered/a11y tasks, physical OS keyboard                                       |
| M19          | T042–T045,T064,T066      | T045 only controllable user path                         | Server faults/CAS covered pgTAP; offline sync/restart owner-run                     |

## Approved visual scope mapping

Each key resolves to its exact image and scoped sidecar in B1 receipt. No
image/background not covered by its sidecar becomes implementation authority.

| Receipt scope                     | Governed production tasks                          | Rendered / separate accessibility tasks |
| --------------------------------- | -------------------------------------------------- | --------------------------------------- |
| R1-03, R1-11, R1-12               | T037,T038,T039                                     | T040 / T041                             |
| R1-07                             | T031                                               | T032 / T033                             |
| R1-08                             | T070                                               | T071 / T073                             |
| R2-01                             | T060,T061 (concept only; final R3 governs details) | T062 / T063                             |
| R2-02, R2-03                      | T031,T060                                          | T032,T062 / T033,T063                   |
| R3-01, R3-02                      | T070                                               | T071 / T073                             |
| R3-03, R3-04, R3-13               | T037,T038                                          | T040 / T041                             |
| R3-05, R3-08, R3-10, R3-11, R3-15 | T060,T061                                          | T062 / T063                             |
| R3-06, R3-09                      | T031,T060,T061                                     | T032,T062 / T033,T063                   |
| R3-07, R3-12                      | T020,T021,T060                                     | T022,T062 / T023,T063                   |
| R3-14                             | T054,T061                                          | T055 / T056                             |

Each rendered task requires declared 390×844 baseline side-by-side/overlay plus
compact, tablet, landscape, both themes, EN/AR/RTL, enlarged text and applicable
keyboard/inset variants. Record device, viewport/font-scale/theme/language,
reference revision and deviations. Accessibility evidence additionally requires
actual reading/focus/action behavior; semantic unit tests alone are
insufficient.

## Implementation strategy and completion boundaries

Smallest usable increment: foundation + US1 + the necessary US6 complete-save
slice, source wiring, disclosure/copy and checks. US1 alone is a resolver/UI
checkpoint, not a safely shippable financial feature. Avoid presenting an
unguarded legacy writer as an MVP. Incrementally add shared suggestions/choices,
conditional states and Add default intent through the same approved contracts.

The full 80-task delivery remains provisionally 12–18 elapsed hours with safe
overlap; refine at T001 using worker readiness and local SQL tooling. No workers
start before analysis and implementation scope approval. Track 30-minute
checkpoints, report overruns and preserve completed work on failed lanes.

Functional checks, authored/unexecuted E2E, visual fidelity, accessibility and
hosted rollout are separate statuses. No emulator testing. No deployment, hosted
migration, account backfill, reset, main merge or new mockup generation. T080
may publish checked code with clearly pending owner evidence; it may not mark
the feature visually complete or hosted-compatible without those results.

Replay-integrity amendment (2026-10-16): T042/T046 are reopened for the required
review-only frozenIntentDigest and its exact canonical projection in
contracts/wire-shapes.md. T048 must bind original selected rows and confirmed
provenance, including omitted SMS rows, before returning historical replay;
later saved-source edits/deletion must not cause a false replay failure.
T045/T052 retain strict SQL/hash parity; T053 regenerates complete artifacts.
This adds no task IDs or UI approval, table/column, legacy tuple or hosted
authorization. Existing T016/T034/T036 acceptance stands. Run speckit.analyze
before digest implementation.

### Technical dependency reconciliation: device-local recovery (2026-10-16)

The **original 80 task IDs and existing execution checkboxes remain intact**.
The separately reviewed Constitution VII 1.8.0 local-only migration exception
(`dd16d5440556b651cb5b6395a00c1c4d37538dcf`) permits the private Watermelon
carrier **without** a Supabase column/type or dummy SQL. This is not a grant for
feature source, hosted deployment, provider, device, SQL or new product
behavior. The full private contract is
[local recovery](contracts/local-recovery.md), with parent
[wire shapes](contracts/wire-shapes.md#local-restoration-and-canonical-outcomes).

| Existing ID | Explicit private recovery seam / proof                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T043        | Tests-first nine-key versioned snapshot, actual cached/prepared preimage/postimage hashes, same-batch rollback, clone/restart, and Voice no durable transcript                                       |
| T044        | Tests-first privacy exclusions, queue lifecycle and 30-day partial/equality expiry, restart, predecessor accept/reject/unsupported, new namespace and no duplicate compensation                      |
| T048        | Optional private linked-plan builder after prepared ownership validation and root-local snapshot in the same atomic batch; no change to public tuple, old roots null                                 |
| T049        | SMS delete/rebind, auto prune `pruned_empty`, explicit discard/reset/new namespace supersession, expiry redaction and original-header recreation guards                                              |
| T050        | Protected action private-field exclusion from push/RPC/outbox/logs, owned dedicated pull preservation coordination, and default predecessor dispatch ordering                                        |
| T051        | Cold restart authenticated root lookup, once-only compensation, postimage/default/children/effect/queue proof, preservation of newer edits, no Voice durable review                                  |
| T053        | **Watermelon migration31** after max30, generator-consumed local override, non-generated model, schema/generator reproducibility, public Supabase type preservation, owned SQLite pull/upsert parity |
| T074        | Final legacy/source/privacy/regression coverage for partial expiry, created queue, restart, failures, actor changes and dependency blocking                                                          |

`local_recovery_snapshot_json` / `localRecoverySnapshotJson` is currently
**not** implemented on the generated financial-action model or linked foundation
plan. `account-review-local-save/v1` is the proposed strict nine-key private
schema, including `queuePreimage`, per-entry available vs metadata-only
expired/superseded variants and stable `defaultDependencyActionIds`. At
`parsedAt <= now-30 days` redact only that SMS entry's raw evidence. A removed
queue can be recreated **only** after proven `pruned_empty`, no current owned
queue, and exact owned/prepared postimage checks. Server rejection/retry does
not auto restore explicitly discarded, expired or replaced queues. The public
`frozenIntentDigest` (original frozen request) and root `payloadHash` (canonical
financial envelope) remain distinct opaque hashes, not private snapshot storage.

The current `db:migrate` script invokes **remote `db:push` first**. Use
reproducible `db:sync-local` only after local generator override implementation;
do not claim it already retains the proposed field. 090/091 are separate
sequential server-owned local SQL under CAS/RLS, with no hosted deployment
permission. Follow T043/T044 genuine Red, Root's fresh read-only Speckit
analysis of reconciled docs, then individually granted source/SQL/sync lanes and
independent DB/security review. Owner device/render/accessibility checks remain
**NOT RUN**, unless and until separately executed.

## Unshipped SMS cleanup proof reconciliation (2026-10-17)

Preserve all 80 existing IDs and checkboxes. Under T042/T046, cover two SMS
deletions with one actual financial source ref and refuse insufficient deletion
bookkeeping. Under T043/T048, prove exact all-selected physical deletion
membership, genuine mixed dedup first write/cold replay, zero unowned writes and
full physical/cache rollback. Under T044/T051, cover root tuple/private-public
membership corruption, genuine legacy/Add classification, accepted retained
proof, real command-driven queue updates and final all-dedup prune. Existing
queue writers preserve sealed headers while draft timestamps provide freshness.
T045 includes an SQL090 unequal-count positive without changing SQL enforcement
or claiming device proof on the server. Implementation, independent review and
runtime gates remain open; no new task ID or visual approval is created.

## Historical Add root ACK versus current row ACK (2026-10-17)

Existing T069 retains its original ID and open status. Extend its genuine SDK
cases to accepted Add plus a lawful financial successor or sender replacement
before original root ACK; keep root-only historical authority separate from
current row financial/metadata authority. Unproved higher revisions cannot clean
account financial fields, and corrupt original effects or
missing/foreign/reparented original members cannot authorize root ACK. Record
current root/field liveness separately; no completion follows from authored
source or tests alone.

## 2026-10-20 — approved compact interactive review: supplemental task mapping

This short overlay **preserves all original 80 T IDs, existing checkboxes,
evidence and B1/R1–R3 image approvals**. The owner-approved latest runnable
design entry is `mockups/interactive/compact-review-2026-10-20/index.html` (blob
`e410f2a5495ff4f9f2106e1881d540564ee7c65b`). `source.fragment.html` (blob
`d07aae0eb285bcbd6e53988692cc1cef3e443572`) is provenance, while
`reference.json` (blob `0d7bd8e349694047ec343edf664b19f50c8f7e9d`) records
browser test provenance without pretending to be a native QA receipt. Short
`README.md` provides version/run/native adaptation notes. **No new sidecar
approval gate:** the worker's prior PENDING `compact-review.binding.md` is
withdrawn from the active handoff and must be removed by Root, not converted
into an approved historical image binding.

| Existing task mapping                           | Locally authored/integrated scope; acceptance still pending                                                                                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T020/T021/T031/T060/T072                        | Collapsed expandable summary, early transactions and two-line expandable transcript; all groups inline, explicit Confirm, accurate account-reviewed status; no View all/nested menu modal.                                                                                          |
| T039/T060/T061                                  | Account-needed and linked-group source-order temporary filters, Show all, linked transaction scope before group-wide account choice; no Save-scope mutation.                                                                                                                        |
| T021/T039/T060/T072                             | Account/category pencil-square edit, actual-container/font-scale responsive reflow, legible native EN/AR/dark, 44/48dp touch targets, sticky page notices, existing keyboard/inset/footer/divider, #405 identity slots preserved.                                                   |
| T031/T038/T039/T072                             | One active chooser showing account currency and explicit Use account — CODE without conversion, one unsaved draft form including currency; distinct currency-only picker without modal stacking.                                                                                    |
| T029/T030/T059/T061 — **separate domain owner** | Initial/newly-ready auto-selection with manual opt-out, pending-group select never confirms, scoped Select ready; session-local Discard revokes Undo lease while preserving transactions; guarded group/draft currency transitions. Frontend consumes authoritative callbacks only. |
| T022/T032/T040/T062/T063/T073/T078/T079         | Root scoped Speckit analysis and exact file ownership, consolidated source intake/checks, then owner manual width/font/name/RTL/dark/inset/overlay/removal/selection review; native/visual/accessibility evidence still NOT RUN.                                                    |
| T074/T076/T077/T078                             | Post-feedback deterministic/E2E coverage and final affected validation; preserve required financial/retry/owner/sync safety checks before merge. No TDD Red prerequisite for this new work.                                                                                         |

**Implementation reconciliation (2026-10-20):** Root activated the frontend
lease, integrated the authored compact UI and NormalB's guarded
selection/Undo/currency source, then released the source ownership. Group edit
uses optional `edit_group.identity.currency`, the same form as name/type and a
single guarded submit; actual ready selection and session-local Discard/Undo
authority remain in the facade. New compact checkbox taps on pending groups
expose explicit inline Confirm, rather than invoking the protected legacy
`confirmForClick` route. `CanonicalTransactionReview.tsx` is 898 formatted
lines; `EditSuggestedAccountSheet.tsx` is 762. See
[compact-review-ui-contract.md](contracts/compact-review-ui-contract.md) for the
implemented source/callback mapping and evidence boundary. **No original T task
ID, checkbox or test history is asserted complete by this overlay.** Root's
consolidated TypeScript/lint/23 mobile suites/logic-account-review batch is
**RUNNING**; results and final commit/deployment remain pending. C owns
manual-test-plan, quickstart and validation documents plus related test
coordination; the **owner** conducts manual/native QA, still **NOT RUN**.
Financial Save/service/logging, #405/PR406 logos, global workflow and frozen
design/image reference bytes remain excluded.
