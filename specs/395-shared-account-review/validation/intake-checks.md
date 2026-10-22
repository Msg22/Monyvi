# Implementation intake checks — #395

Date: 2026-10-14. Local verification began at 20:14:24 UTC in
`E:/Work/My Projects/Monyvi`, branch `codex/395-shared-account-review`, HEAD
`944cbafc7e7d9f36a13c75d20c0669204974db2b`.

## T003 receipt and binding evidence

Canonical CLI and exported `verifyMockupBinding` API passed all 23 unique
receipt-bound sidecars. Each current image hash, approved whole-sidecar hash,
Binding Facts revision and combined approval revision matches the exact B1
receipt. No source, image, sidecar, receipt or frozen manifest was changed. This
verifies the approved handoff, not rendered implementation fidelity.

- Manifest:
  `sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`.
- Spec, matched against both approval receipts:
  `sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`.
- `mockups/binding-contract.md`:
  `sha256:5717e4ab6dd4f2458c686565fb81c725bcf1a7d1197ebde3e167542716f48a68`.
- `mockups/proposals/r3/interaction-notes.md`:
  `sha256:2b4c8a42cb01a0148ef4e4ee6a09f158b60357ac3bb045b28ecd50b47e1ca5d4`.
- `mockups/adjustments.md`:
  `sha256:f25dd143c5859437d4602fccc70a23036f3416895d852d362d4a72158827a2b4`.

Both receipts remain `APPROVED`; manifest and spec bytes match their recorded
hashes. All 23 image/sidecar pairs exist and canonical validation reports no
errors. Original pre-approval whole-sidecar hashes are historical; comparison
uses the receipt's `approvedSidecarRevision` for current approved files.

## Exact reference-to-surface map

Paths below are relative to this feature directory. Every row passed canonical
validation and receipt parity. The scope column is copied from the approved
receipt, without expanding the binding surface. The existing approved
[pre-plan scope index](../pre-plan-review.md) remains unchanged.

| Sidecar                                                             | Approved surface scope                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `mockups/references/r1/03-multiple-matches-en.binding.md`           | Per-transaction existing-account chooser; background contextual.                                       |
| `mockups/references/r1/07-edit-shared-draft-en.binding.md`          | Foreground Edit suggested account sheet only; old background superseded.                               |
| `mockups/references/r1/08-account-helper-en.binding.md`             | Edit Account default flag/helper only; other form fields contextual.                                   |
| `mockups/references/r1/11-currency-confirm-en.binding.md`           | Foreground conflict confirmation sheet; extend with documented R3-03 other-currency action.            |
| `mockups/references/r1/12-multiple-matches-ar.binding.md`           | Arabic RTL per-transaction existing-account chooser.                                                   |
| `mockups/references/r2/01-unified-review-en.binding.md`             | Compact shared-group/issue/default grouping concept only; final detailed composition R3-05.            |
| `mockups/references/r2/02-individual-account-actions-en.binding.md` | Foreground per-group action sheet only.                                                                |
| `mockups/references/r2/03-all-suggested-accounts-en.binding.md`     | Foreground View all suggestions list and independent group actions.                                    |
| `mockups/proposals/r3/01-add-account-default-en.binding.md`         | Add Account default block after Initial balance, before SMS matching; surrounding form contextual.     |
| `mockups/proposals/r3/02-add-first-cash-default-en.binding.md`      | First Add Account default block with Cash-specific helper.                                             |
| `mockups/proposals/r3/03-confirm-currency-other-en.binding.md`      | Foreground conflict sheet with Choose another currency action.                                         |
| `mockups/proposals/r3/04-other-currency-picker-en.binding.md`       | Transaction-context sub-label and existing CurrencyPicker reuse ONLY; custom chrome excluded by owner. |
| `mockups/proposals/r3/05-combined-review-en.binding.md`             | Final combined Voice/SMS review information, filters, toolbar and row account states.                  |
| `mockups/proposals/r3/06-removed-suggestion-undo-en.binding.md`     | Removed-suggestion recovery in separate four-row fixture.                                              |
| `mockups/proposals/r3/07-default-only-en.binding.md`                | Default-only compact disclosure and review rows.                                                       |
| `mockups/proposals/r3/08-issues-only-en.binding.md`                 | Compact unresolved-fields section without draft/default banners.                                       |
| `mockups/proposals/r3/09-confirmed-feedback-en.binding.md`          | Confirmed-group status, selection feedback, filters and footer.                                        |
| `mockups/proposals/r3/10-clean-review-en.binding.md`                | Clean review without empty information containers.                                                     |
| `mockups/proposals/r3/11-empty-selected-filter-en.binding.md`       | Selected-filter empty recovery, distinct from recorder no-result state.                                |
| `mockups/proposals/r3/12-default-why-en.binding.md`                 | Foreground default explanation only; background contextual.                                            |
| `mockups/proposals/r3/13-group-replace-en.binding.md`               | Foreground existing-account replacement opened from shared-group menu.                                 |
| `mockups/proposals/r3/14-sms-save-failure-en.binding.md`            | SMS failed-save recovery and existing action footer.                                                   |
| `mockups/proposals/r3/15-combined-review-ar.binding.md`             | Arabic RTL final combined review, same semantics as R3-05.                                             |

## Commands and results

Canonical verifier source was read before execution. Its supported CLI is
`node scripts/verify-mockup-binding.js <sidecar.binding.md> [...]`; its exported
API is `verifyMockupBinding(sidecarPath)`.

The temporary, explicitly authorized helper invoked that CLI once with all 23
receipt paths, then checked canonical API results and SHA-256 parity. Command:

```powershell
node specs/395-shared-account-review/validation/intake-verifier.cjs
```

Result: exit 0, 23 CLI PASS lines, 23 scope rows, three matching dependencies,
and `failures: []`. Executed helper SHA-256:
`sha256:23849854388807a22e43c2993fd3006c448faef9e042ffacc7475809f527417a`. The
helper source is retained below for reproduction; the temporary executable is
removed after this report is written.

```text
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve('specs/395-shared-account-review');
const receipt = JSON.parse(fs.readFileSync(path.join(root, 'approvals/b1-2026-10-14.json'), 'utf8'));
const specReceipt = JSON.parse(fs.readFileSync(path.join(root, 'approvals/spec-2026-10-14.json'), 'utf8'));
const { verifyMockupBinding } = require('../../../scripts/verify-mockup-binding.js');
const hash = (file) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const failures = [];
const check = (label, actual, expected) => { if (actual !== expected) failures.push(`${label}: ${actual} != ${expected}`); };
check('B1 receipt status', receipt.status, 'APPROVED');
check('spec receipt status', specReceipt.status, 'APPROVED');
check('entry count', receipt.entries.length, 23);
check('unique sidecars', new Set(receipt.entries.map((entry) => entry.sidecar)).size, 23);
check('manifest', hash(path.resolve(root, 'approvals', receipt.manifest)), receipt.approvedManifestRevision);
check('spec', hash(path.join(root, 'spec.md')), specReceipt.revision);
check('B1 spec', hash(path.join(root, 'spec.md')), receipt.specRevision);
for (const dependency of receipt.dependencies) {
  check(dependency.file, hash(path.join(root, dependency.file)), dependency.revision);
  console.log(`DEPENDENCY ${dependency.file} ${dependency.revision}`);
}
const cli = spawnSync(process.execPath, ['scripts/verify-mockup-binding.js', ...receipt.entries.map((entry) => path.join(root, entry.sidecar))], { encoding: 'utf8' });
process.stdout.write(cli.stdout || '');
process.stderr.write(cli.stderr || '');
check('canonical CLI exit', cli.status, 0);
for (const entry of receipt.entries) {
  const result = verifyMockupBinding(path.join(root, entry.sidecar));
  if (!result.isAuthoritative) failures.push(`${entry.sidecar}: ${result.errors.join('; ')}`);
  check(entry.image, hash(path.join(root, entry.image)), entry.imageRevision);
  check(entry.sidecar, hash(path.join(root, entry.sidecar)), entry.approvedSidecarRevision);
  check(`${entry.sidecar} binding`, result.currentBindingMetadataRevision, entry.bindingRevision);
  check(`${entry.sidecar} approval`, result.currentBindingApprovalRevision, entry.approvalRevision);
  console.log(`SCOPE ${entry.sidecar} | ${entry.scope} | ${entry.approvalRevision}`);
}
console.log(JSON.stringify({ entries: receipt.entries.length, dependencies: receipt.dependencies.length, manifestRevision: receipt.approvedManifestRevision, specRevision: receipt.specRevision, helperRevision: hash(__filename), failures }));
if (failures.length) process.exitCode = 1;
```

Before the successful file-based run, `ctx_compose` exceeded its 120-second
watchdog. Inline `node -e` was permanently blocked by tool policy and was not
retried. The first helper run had an incorrect relative require path and failed
with `MODULE_NOT_FOUND`; the path was corrected before the successful run. These
are tooling/setup failures, not binding failures.

Formatting uses the existing repository Prettier runtime. Authorized files:

```powershell
node node_modules/prettier/bin/prettier.cjs --write .agent/workflows/team-led-delivery.md .agents/skills/team-led-delivery/SKILL.md specs/395-shared-account-review/tasks.md specs/395-shared-account-review/quickstart.md specs/395-shared-account-review/workflow-status.md specs/395-shared-account-review/contracts/account-default-intent.md specs/395-shared-account-review/contracts/financial-save.md specs/395-shared-account-review/contracts/parser-evidence.md specs/395-shared-account-review/contracts/review-commands.md specs/395-shared-account-review/contracts/wire-shapes.md
```

Result: exit 0; only approved dirty Markdown formatted. The intake report was
also formatted with the same runtime before the consolidated check batch.

```powershell
node node_modules/prettier/bin/prettier.cjs --check .agent/workflows/team-led-delivery.md .agents/skills/team-led-delivery/SKILL.md specs/395-shared-account-review/tasks.md specs/395-shared-account-review/quickstart.md specs/395-shared-account-review/workflow-status.md specs/395-shared-account-review/contracts/account-default-intent.md specs/395-shared-account-review/contracts/financial-save.md specs/395-shared-account-review/contracts/parser-evidence.md specs/395-shared-account-review/contracts/review-commands.md specs/395-shared-account-review/contracts/wire-shapes.md specs/395-shared-account-review/validation/intake-checks.md
git diff --check
```

Results: both exit 0. Prettier reported “All matched files use Prettier code
style!” for all 11 files; Git reported no whitespace errors. The only report
link resolves to the unchanged tracked pre-plan scope index. The temporary
helper's absolute path was verified inside this feature's `validation/`
directory before its exact-file deletion; no helper remains in final status.

```powershell
git diff --name-only -- scripts/verify-mockup-binding.js specs/395-shared-account-review/spec.md specs/395-shared-account-review/approvals specs/395-shared-account-review/mockups specs/395-shared-account-review/pre-plan-review.md
```

Result: exit 0, no output; canonical verifier and approved artifacts unchanged
against the pinned HEAD. Receipt/hash checks separately verify current bytes.

## Limits

No application build, unit/integration tests, emulator, device, SQL execution,
provider call or deployment occurred. Rendered fidelity and accessibility remain
owner-run. No task checkbox, requirement map, product scope or receipt was
altered by this verification lane. Root owns completion bookkeeping.
