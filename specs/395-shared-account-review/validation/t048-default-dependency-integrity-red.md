# #395 T048 — Default Dependency Immutable-Root Integrity (TESTS FIRST)

**Date:** 2026-10-16  
**Exact immutable parent:** \`5559ae21ddab0bbc0872dc7e41ff0af741eafe4b\`  
**Parent tree:** \`1b8adf3f768fd5a4c4773baa29c8a279b784e8cd\`  
**Status:** AUTHOR-ONLY test candidate, **NOT RUN**. Root must first observe genuine regressions before granting any production repair. No source release/admission or behavior claim.

## Exact owned changes

1. **NEW** \`apps/mobile/__tests__/services/account-review-default-dependencies.sqlite.integration.test.ts\`: 15 actual-collector regression cases with real WatermelonDB/SQLite, the existing full generated schema, real model classes, a real authenticated scoped query and canonical registered financial envelopes.
2. **EXISTING harness-only** \`apps/mobile/__tests__/components/account-default-intent-form.test.tsx\`: fixed Babel/Jest hoisting of local \`ScopedHeaderProps\` inside PageHeader mock factory. The shell uses an **inline prop object type** with type-only \`import("react").ReactNode/ReactElement\`, not a runtime variable captured outside the hoisted mock. Preserves all **17** original form semantic assertions, real Add/Edit, hooks/default field/SQLite and screen callback/disabled bindings. No business component mock or screen logic relaxation.
3. **NEW** \`specs/395-shared-account-review/validation/t048-default-dependency-integrity-red.md\`: this report.

No production code or foundation, Recovery, Storage, SQL, migrations, generated types, feature hooks, network paths, frontend screens, test seam, provider or registration modified. The independent Panel Low-unused-import observation remains held for a later explicit source lease.

## Real fixture authority and exact API

- The suite directly calls the **existing** \`captureReviewDefaultDependencies({database,scope,ownerId,actionId,payload})\` from \`services/account-review-local-snapshot-defaults.ts\`; it does **not** mock this function or substitute a future verifier.
- The database is created by the **real** \`@nozbe/watermelondb\` Database/SQLiteAdapter with the existing \`packages/db/src/schema\` and authoritative \`account-review-save-ledger-models\` physical classes. It uses \`clearAndSeed(..., {onlyCategories:true})\`, real owned Account and FinancialActionGroup prepared inserts/updates, and \`getCurrentUserDataScope()\` backed by an authenticated-owner-only test Supabase seam. The collector's actual \`Q.where("deleted",false)\` owned-root query runs unchanged.
- Canonical Add roots use existing \`makeAccountCreateDefaultPayload\` / \`validateAccountCreateDefaultPayload\` with a Cash account and **exact captured prior-default UPDATE**, the existing feature registry, \`canonicalizeFinancialActionEnvelope\` and \`hashFinancialActionEnvelope\`. SHA-256 comes from Node \`createHash\` implementing the **actual \`Sha256Provider.digestUtf8\` contract**, not a forged hardcoded digest. \`payloadJson\`, \`payloadHash\` and \`accountGuardsJson\` are stored as real root columns.
- Real Review and legacy controls reuse the frozen \`reviewBatchSavePayload\`, \`smsNewBankEnvelope\`, and \`legacyEditBalanceEnvelope\` with only source-valid actor/action or existing-account substitutions. Review payload mutations are revalidated through \`validateReviewBatchSavePayload\`, so the collector input is a complete closed approved financial action rather than a hand-rolled DTO.
- The test hashes/compares source fixture bytes but does not mock source verification, future calls or financial business decisions. Physical source rows are seeded only to establish authenticated owned creator/reference data; the narrow collector test is **not** an end-to-end posting/compensation simulation.

## 15 authored cases — desired Red/positive boundary

| ID | Case | Expected on original Pro source |
| --- | --- | --- |
| D01 | Canonical pending Add creates one related account; complete stored hash and guards checked as positive control | PASS |
| D02 | Related Add \`payloadJson\` unchanged but persisted \`payloadHash\` replaced with unrelated 64-hex digest | **RED**: collector must reject, currently ignores hash |
| D03 | Zero-opening Add signed envelope still has no financial guards, but persisted \`accountGuardsJson\` falsely contains a revision-0 guard | **RED**: collector must reject, currently ignores column |
| D04 | Add root has noncanonical JSON whitespace and its own **correct raw SHA-256**; parsed payload remains valid but canonical reserialization differs | **RED**: collector must check canonical bytes, not only raw hash |
| D05 | Stored actionId disagrees with signed Add envelope | PASS existing reject |
| D06 | Stored domainReferenceId is the captured previous-default UPDATE ID instead of the created account | PASS existing reject |
| D07 | Stored Add kind downgraded to \`edit_balance\`, signed envelope still \`create_with_default\` | **RED**: collector must reject, currently silently skips |
| D08 | Stored Add domain changed to \`transactions\`, envelope still \`accounts\` | **RED**: collector must reject, currently silently skips |
| D09 | Envelope rehashed under different owner while stored root remains correctly owned | PASS existing reject |
| D10 | Valid pending Add creates an account unrelated to a different owned financially affected account | PASS: no false dependency |
| D11 | Add's \`account_default/update\` prior ID appears in \`domainRecordRefs\` but is **not** a new account creator | PASS: no false dependency |
| D12 | Valid pending Review root genuinely creates the referenced new Bank account | PASS: Review predecessor preserved |
| D13 | Canonical legacy \`accounts/edit_balance\` has no created account | PASS: ignored |
| D14 | Unsupported stored accounts tuple remains fail-closed | PASS: rejects |
| D15 | Foreign-owner pending Add root never appears in current owner's scoped root query | PASS: ignored |

The five **RED** expectations are \`await expect(captureForExisting(...)).rejects.toThrow()\` against the actual current collector. They intentionally fail if it returns a dependency or silently ignores a malformed root. There is no catch-all, mocked hash verifier, skipped case, tautological assertion or new production API.

## Minimal future threading proposal (not authored)

At parent \`5559ae21\`, \`captureReviewDefaultDependencies()\` has **no** \`Sha256Provider\` parameter, so the five Reds cannot be correctly fixed by tests or by assuming a verifier exists. The already-existing \`SnapshotInput.hashProvider\` in \`services/account-review-local-snapshot.ts\` is currently passed to \`captureReviewDefaultPreimages\`, but **not** to \`captureReviewDefaultDependencies\` (capturePrivateParts lines 65–69).

A separately authorized source writer can thread that **same** provider through the existing dependency-capture boundary, use \`hashFinancialActionEnvelope(envelope, hashProvider, approvedRegistry)\`, require byte-for-byte \`canonicalText === root.payloadJson\`, \`payloadHash === root.payloadHash\`, and require \`root.accountGuardsJson === JSON.stringify(envelope.accountGuards)\`. Verify stored \`domain/kind/domainReferenceId/userId/actionId\` against the validated envelope before any early \`edit_balance\`/unrelated fallback; record dependencies only from exact \`account/create\` mutation IDs. This is a proposed narrow implementation route, **not** permission to modify the current API, introduce a copied brand/union/cast/any, or change the public action wire.

## Limits / Root handoff

This review did not run **Jest, TypeScript, ESLint, Prettier, SQLite, emulator, native, SQL, provider, hosted or CI checks**. No confirmed test PASS/FAIL or independent security approval is claimed. Root should run the isolated suite and form RNTL suite on this exact unreferenced candidate **before** a source grant. The new cases prove only dependency collector intake and isolated authenticated owner/root identity; server CAS, protected push, offline replay, private snapshot lifecycle, downstream recovery and physical rollback still require their separate held executions.

No refs/branches, push, PR, database, hosted operations, formatters, delegation or Codex handoffs.

**TESTS FROZEN WHEN IMPORTED / SOURCE RELEASED — STOP.**
