# #395 — T068 Add admission repair (bounded candidate)

**Date:** 2026-10-16  
**Immutable parent:** `134a332e1aa0a749f91f1b3d76d1d18a03d1f601`  
**Parent tree:** `259cc56978511e5894daf33a3423b0209857b417`  
**Ownership:** only the Add command preparation, owned-default hook, T065 component RNTL test, T064 pure test, and this report. No SQL, foundation, reconciliation, Recovery, Storage, UI production components, locales, schema, Git refs or providers changed.  
**Execution:** **NOT RUN**. The reported earlier Wave 6 is external Root evidence, not this author's execution.

## Reported baseline / admission blockers

Root's actual Wave 6 ran pure T064 31 and registration 10 (41 PASS) and 30 physical/service cases (23 PASS, 7 FAIL). Those seven failures included later-ON Add never reaching the writer because `account-default-intent-command.ts` rejected the legitimate captured prior-default UPDATE UUID as a duplicate of an existing active account. A separate TypeScript check reported TS2322 for assigning an unbranded literal revision `"0"` to `FinancialActionAccountGuard.expectedRevision`; TS2367 for test comparisons of a closed Add-only mutation union to impossible `transaction`; and an unresolvable `@monyvi/logic/src/...` deep import from the owned read hook. Form tests were unable to load the route because real `PageHeader` pulled `AppDrawer → logout → sync`, whose unrelated production schema imports are absent from the deliberately narrow account-form SQLite mock. These are *source-confirmed repair targets*, not new measured pass counts.

## Exact changed paths and corrections

1. `apps/mobile/services/account-default-intent-command.ts`
   - The strict `validateAccountCreateDefaultPayload` call still checks the complete canonical eight-key wire, sorted domain refs/guards, exactly one account, and one exact captured previous-default `account_default` clear with `expectedIsDefault:true`. The captured prior default remains present in `domainRecordRefs`, as frozen by wire-shapes, but it is an UPDATE, not a new CREATE.
   - Duplicate/reserved-ID proof now uses only **genuinely created mutation IDs** plus the **new action ID** and optional **new effect ID**, not every domain reference. It still rejects any reused planned new ID, action/effect/child collision with each other, or overlap between a planned new identity and any UUID in `snapshot.activeAccountIds`. It does not suppress the authenticated same-writer owner/full-snapshot CAS or physical absent-create checks elsewhere. The exact previous-default update ID is independently bound by the pure validator; spoofed wrong-clear-ID remains rejected even if an attacker also edits domainRecordRefs.
   - Nonzero `accountGuards` uses the existing `parseCanonicalUnsignedIntegerString("0")` constructor from the authoritative financial revision package export. No casts, duplicate brand or string widening. Zero opening remains guards `[]`, effects `[]`, revision0; nonzero remains one guard revision0 and exactly one account/currency/minor-units opening effect, revision1.

2. `apps/mobile/hooks/useOwnedAccountDefaultState.ts`
   - Replaced unsupported `@monyvi/logic/src/financial-actions/*` package deep imports with the same canonical **workspace-relative** import used by existing mobile services: `../../../packages/logic/src/financial-actions/account-create-default`, bringing the original `accountDefaultSnapshotSchema` and inferred `AccountDefaultSnapshot` type together. No duplicated local DTO, alias/config changes, owned filtering, readiness or recovery semantics changes.

3. `apps/mobile/__tests__/components/account-default-intent-form.test.tsx`
   - Preserves **all 17 original Add/Edit/default/EN-AR form RNTL cases** and SQLite/auth/market context; no account screen, account form hook, default controlled field, read facade or business write SUT mocked.
   - Adds a **narrow PageHeader navigation-shell mock only** so its unrelated `AppDrawer → logout → sync` module chain cannot require the full production database schema. The shell renders a real React Native View/Text/TouchableOpacity header and forwards the actual screen-provided Back and Save callbacks, accessible roles/labels, test IDs, and disabled/loading Save state. Thus validation, busy-save and back-navigation assertions still inspect the screen's actual booleans and callbacks. PageHeader's own UI/accessibility tests remain separate. This does **not** claim integration proof for the actual navigation drawer.

4. `packages/logic/src/financial-actions/__tests__/account-create-default.test.ts`
   - Retains **31 T064 pure contract cases** (23 plain + 8 required-root omissions). Two invalid comparisons against the impossible `transaction` literal on the closed Add mutation entity union now inspect the real emitted entity array with `not.toContain("transaction")`. Negative no-fake-transaction coverage is preserved, without casts, new union variants, or weakened schema checks.

5. `specs/395-shared-account-review/validation/t068-add-admission-repair.md`
   - This report, with the expected Root check matrix and limits.

## Contract and proof boundaries

- A later-ON Add action legitimately includes the prior active default UUID in immutable `domainRecordRefs` and a precisely scoped `account_default/update` mutation. The original defect checked that UPDATE UUID as if the action intended to CREATE it; the new collision proof distinguishes them without allowing any duplicate CREATE. Caller never resamples a stale snapshot or generates replacement IDs on CAS rejection.
- The original 16 T064 real-SQLite service tests, 14 T068 atomic SQLite tests (including stale A→B→A, same-command replay, hash mismatch, full atomic rollback), and 10 registration tests are **unchanged in this bounded repair**, retaining Root's independent execution responsibility.
- Fixes remove identified *admission blockers in source* but do not establish Green. Root must repeat the 41 pure/registration, 16+14 physical, 17 RNTL, TypeScript, lint/format and cross-owner Storage/Recovery/foundation/SQL integrity checks. Actual PageHeader/AppDrawer wiring should remain covered by its separately owned tests and subsequent device checks.
- No local test execution, formatters, TypeScript, ESLint, pgTAP, SQL/DB, CI, emulator/native, hosted call or Git ref/push/PR/delegation occurred here. The immutable parent and disjoint external owners remain authoritative until Root imports and validates the unreferenced candidate.

**SOURCE RELEASED. STOP.**
