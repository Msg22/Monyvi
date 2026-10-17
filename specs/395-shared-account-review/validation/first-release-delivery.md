# #395 first-release delivery evidence

This report covers the owner-approved first release in
[first-release-scope.md](first-release-scope.md). It does not certify deferred
automatic compensation, all historical task acceptance, hosted rollout, device
testing or other legacy financial writers.

## Delivered behavior

- Voice and SMS use shared account evidence, matching and currency review. A
  suggested account is confirmed once for its linked transactions, with
  individual edit/discard actions and shared-group updates.
- Approved candidate-choice, suggested-account editor, default-account
  explanation and existing currency-picker flows are wired into review. Currency
  omitted by the source uses the preferred currency; ambiguous or conflicting
  evidence requires confirmation.
- Add and Edit Account show the approved default-account helper, and Add
  supports the Default flag. Existing owner and current-default guards remain
  authoritative.
- Selected Save uses owned atomic local writes, immutable retry identity,
  financial effects and SMS deduplication. SMS review-later choices remain local
  and durable; private source/recovery evidence is excluded from generic cloud
  payloads.
- Protected sync preserves unresolved dirty data and rejects unknown ownership,
  financial membership or receipts. Ordinary accepted-Add ACK uses exact
  authenticated current financial readback, preserving independent rejection
  sources and final SDK captured-row checks.

## Scope and source integration

The approved spec and all 23 B1 image/binding receipts remain unchanged.
Original 80 task IDs and historical checkboxes are preserved. Their broader
advanced recovery/device acceptance is not silently declared complete by this
delivery.

Main was independently verified at 1d23e48d57cf408d901b4ece15316d055bd2e401 and
composed into the feature checkout. Local feature/policy parent is
902eee575920051112c5f1988fa0b4d9051194f4. PR399 remains a separate, unmerged
policy dependency and should merge before this feature; this report authorizes
no Main merge.

Final Normal ChatGPT repair artifacts are
03af0bf886c400e6cc87ac857aaa7e3be44c4c71,
5c36357ef18ab93524d0165265dc8b78e561d9f5 and
565a836744145da4ae0b6308d2b8305dc47c813a. They were reviewed and mechanically
integrated by exact verified parent/blob/preimage. These are unreferenced
handoff commits, not worker branch pushes. Root owns the single final feature
publication. After Normal ChatGPT, verified free OpenCode and Antigravity failed
to deliver the final typing repair, the owner approved one native worker for at
most 20 minutes, restricted to SDK change-map typing/import handling in
push-service.ts. Root retained review, consolidated checks, commit and
publication.

## Validation

Final affected batch completed 2026-10-17T21:00:42Z: 32 mobile suites / 358
tests passed; whole mobile TypeScript passed; architecture lint checked 349
files with zero errors and 122 warnings; formatting and diff checks passed; no
source drift. The reviewed SDK installer applied both locked files, and all 14
SDK patcher tests passed in the preceding release batch. That SDK source
remained unchanged for this typing-only final rerun.

The earlier SQL/logic/database cohort and corrected Edge-runtime cohort were
retained only after their source hashes were compared with the current checkout:
91 scoped logic/database/Supabase paths and 17 corrected Edge paths had no
drift. This is affected-source validation, not a claim that every repository
test or all historical task acceptance ran again.

Passing unchanged-source evidence from the earlier consolidated cohort includes
the complete local SQL CI-role cohort and privileged concurrency wrapper, logic
TypeScript and 116 suites/2,175 tests, database TypeScript and two suites/five
tests, real local database generation, schema-generator checks, SDK patcher unit
tests, generated Edge parity, i18n/privacy checks, all 23 binding receipts and
static Maestro YAML validation. Corrected Node Edge and Deno SMS/Voice tests
passed in their actual runtimes. The earlier mobile/lint failures are retained
as historical failures, followed by the final affected rerun results above; they
are not erased or reported as previous passes.

An operational runner initially loaded the SDK patch module without calling its
exported installer. This was corrected by invoking patchWatermelonSyncHooks();
the reviewed two-file locked SDK patch was applied. The release-validation batch
invoked that exported installer explicitly and passed all 14 patcher tests. The
final typing-only rerun reuses this unchanged-source evidence. Canonical public
types remain SHA256
5c9944cb2fc8008492b2d758a9d6bb0c1d44c5d8a9e05ae20d3209f2acedd68f.

## Not run and release boundaries

- No emulator or device testing. Maestro journeys were authored and statically
  checked; execution, visual/RTL/accessibility acceptance and live-provider
  checks remain with the owner.
- No hosted migrations or Edge deployment. Local SQL090/091 and affected
  functions need a separately authorized rollout.
- Advanced rejected-Add compensation/carriers, complex historical successor
  reconstruction, and specified post-prune automatic restoration/expiry remain
  deferred. Existing safeguards preserve unresolved financial rows, roots,
  private proof and retryability; a HELD result is not successful recovery or
  ACK.
- This feature does not certify every legacy financial writer or close
  independent synchronization work such as #340/#341.

## Publication boundary

This report records pre-publication source and local validation evidence. The
final PR description records the published commit and current CI state
separately. Commit and pre-push hooks remain mandatory; passing local checks do
not imply CI, manual acceptance or hosted rollout.
