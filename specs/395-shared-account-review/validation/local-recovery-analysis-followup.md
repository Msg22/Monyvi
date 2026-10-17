# #395 — Local recovery analysis metadata follow-up

**Date:** 2026-10-16  
**Artifact base:** `6ae581ae5c3ebf5bd574d77bfdd425124328f59e`  
**Scope:** Only `tasks.md` metadata/coverage/SQL filename and this new report.  
**Result:** Documentation correction ready for Root verification; no
implementation or hosted approval claimed.

## Actual analysis and authority

Root reported a **fresh read-only Speckit prerequisite PASS** on the reconciled
local-recovery package, with **0 Critical / 0 High** findings. This author **did
not execute** Speckit analysis, formatters, tests or repository checks. The
subsequent small findings were documentation metadata and traceability only;
closing their source text here is not evidence of a new analysis run.

Original spec approval SHA-256
`e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0` and B1
manifest SHA-256
`cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0` remain
**untouched**. All original **80 T001–T080 task IDs**, their order and their
checkboxes remain unchanged: **32 checked/accepted, 48 open** in the immutable
parent and corrected `tasks.md`. Historic acceptance, replay-integrity notes,
and existing validation evidence were not rewritten as new completion.

The original feature spec/B1 receipts were approved under Constitution
**1.7.0**. Their approval history does not retroactively change. The reviewed
device-local exception `dd16d5440556b651cb5b6395a00c1c4d37538dcf` supplies
Constitution **1.8.0** technical authority for this feature reconciliation; the
trusted pre-policy revision was `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.
`main@7838df64` was a **historical planning base**, not the present Main. Root
reports current Main `902eee575920051112c5f1988fa0b4d9051194f4` with
Constitution 1.8.0 via its separately published/formatted policy work. The local
Main commit is **Root-reported, not connector-retrieved** in this bounded remote
authoring session. Governance-only PR #399 remains separate; feature PR #396
stacks on the policy branch, without an authorized Main merge.

## Exact findings and dispositions

| Root finding                                                           | Correction confined to `tasks.md`                                                                                                                                    | Status                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Input refers to four contracts, omitting new local recovery            | Uses generic approved scoped contracts, explicitly including `contracts/local-recovery.md`                                                                           | Addressed in document |
| Historic Constitution 1.7 approval confused with current authority     | Distinguishes immutable original 1.7 receipt from adopted 1.8 technical exception                                                                                    | Addressed in document |
| Original no-implementation status/current Main base stale              | Marks active delivery, 32/80 accepted, 48 open; distinguishes historic 7838 base, trusted c02a, reviewed dd16 and Root-reported current Main/policy-stack chronology | Addressed in document |
| Four original production tasks absent from requirement/success mapping | Adds existing T009/T011/T015/T053 to matching FR/SC rows without adding a task or requirement                                                                        | Addressed in document |
| T052 uses old proposed filename                                        | Changes only T052 task target to Root's reserved `supabase/migrations/090_shared_account_review_save.sql`; prefix stays 090 and no SQL is written                    | Addressed in document |

### Exact coverage additions — previously missing task IDs

| Existing task | Existing requirement/success row(s) | Why this maps                                                                                                                                              |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T009          | FR-005, FR-021                      | Canonical validated account evidence, currency, assignments, groups and scoped reference vocabulary                                                        |
| T011          | FR-005, FR-020                      | Generated strict Edge/provider contract parity for original-request suggestions/evidence; no additional parsing request                                    |
| T015          | SC-007                              | Guarded owner-isolated test-only Voice/SMS fixture access, never production bypass                                                                         |
| T053          | FR-018, FR-019, FR-021, SC-005      | Device-local migration and generated schema/privacy/pull parity protect atomic Save and durable SMS recovery, owner-scoped evidence and safe restart/retry |

The requirement/success table still represents **planned traceability**, not
test execution or runtime acceptance. All other task mappings are retained. The
pre-existing source contracts may include the earlier **proposed** SQL 090
filename; only the T052 task target was authorized for correction in this wave.
Root's reserved SQL worker must use the actual
`090_shared_account_review_save.sql` path and reconcile any remaining historical
references under separate file ownership if needed. This is a file-name
alignment, not a change in server tuple, public wire, local private snapshot,
product behavior or SQL semantics.

## Remaining guards

No open business or privacy approval is introduced. The feature's reserved
Watermelon-only recovery column/migration31, generator-preserved model, owned
pull, exact cold-restart snapshots, predecessor action ordering and server
090/091 SQL remain **separately owned implementation work**, with the previously
passed analysis and applicable tests-first Red gates. No feature PR, governance
PR or server deployment has been modified here.

**NOT RUN by this author:** Speckit commands/analysis, formatting, lint,
TypeScript, test suites, local/hosted SQL, code generation, pull/parity checks,
emulator, native or provider. Root independently rechecks coverage and closes
the analysis metadata findings.
