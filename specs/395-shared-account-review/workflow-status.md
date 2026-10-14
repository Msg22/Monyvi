# Workflow status and delivery ledger

Date: 2026-10-14. Issue: [#395](https://github.com/Msg22/Monyvi/issues/395).

## Authority and execution location

- Main checkout `E:/Work/My Projects/Monyvi`, branch
  `codex/395-shared-account-review`.
- Initial stack base: `389-voice-usage-limits` at
  `c1e6a198422385a59f7e1bf4e5de3191b353e865`. Owner subsequently reported #383
  merged and authorized targeting main. Verified merge; feature branch
  fast-forwarded to latest `origin/main` at
  `7838df64eb9b3828c6e8f1a02f590b008d5435fd`. PR now targets main. Application
  trees of these two revisions are identical.
- Team-led workflow read from main. Governing main ref refreshed to
  `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`; constitution and feature-base
  contracts remain required.
- Later main refresh returned `7838df64eb9b3828c6e8f1a02f590b008d5435fd`; the
  reviewed feature tree and its governing sources are retained by the merge.
- Owner explicitly retained mockup generation with lead and prohibited
  pre-implementation delegation. Lead handles this planning/publication wave
  under those user overrides; no workers are assigned.
- Later implementation order: user-created Normal ChatGPT → suitable OpenCode →
  Antigravity → justified native fallback. Pool readiness is not claimed before
  actual future dispatch.
- No emulator testing, no more mockup generation, no production implementation,
  hosted data mutation or merge in this wave.

## Speckit execution

| Step                    | Status      | Evidence                                                                                                                                  |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect extension hooks | Complete    | extensions.yml checked before plan; optional pre/post commits consolidated into authorized batch                                          |
| `speckit-git-feature`   | Complete    | PowerShell branch script returned `codex/395-shared-account-review`; exact override preserves project codex prefix                        |
| `speckit-specify`       | Complete    | `spec.md` follows repository template; feature selector points here                                                                       |
| `speckit-clarify`       | Complete    | Existing owner decisions encoded; coverage in `clarification-report.md`                                                                   |
| Requirements checklist  | Complete    | `checklists/requirements.md` separates content quality from readiness                                                                     |
| Spec owner approval     | Complete    | Exact published spec approved on 2026-10-14; immutable bytes bound by `approvals/spec-2026-10-14.json`                                    |
| Visual/binding package  | Complete    | B1 frozen manifest and exact owner receipt approvals/b1-2026-10-14.json; image/facts/dependencies unchanged                               |
| Visual/binding gate     | Passed      | Explicit B1/R3 EN/AR approval recorded; all23 approved sidecars pass canonical verifier                                                   |
| `speckit-plan`          | Complete    | setup-plan.sh --json selected exact feature; research/data-model/four contracts/quickstart and agent-context update; design gates checked |
| `speckit-tasks`         | Not started | Next canonical phase; original #383 tasks untouched; no implementation task IDs assigned                                                  |
| `speckit-analyze`       | Not run     | Requires tasks; must precede production edits or worker assignment                                                                        |

The tracked `.specify/feature.json` selects this new directory. The
clarification prerequisite script returned the actual branch
`codex/395-shared-account-review` and
`/mnt/e/Work/My Projects/Monyvi/specs/395-shared-account-review` (same E-drive
checkout via its Bash runtime), confirming the intended feature before
downstream commands. Published `spec.md` declares the directory for remote
workers explicitly.

## Scope and decision ledger

| ID  | Decision                                                                                  | Owner direction                                    | State                                                                         |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| D01 | Independent shared-draft actions, compact combined review                                 | Prior owner approval of R1 retained concepts/R2    | Approved scopes in mockup receipt                                             |
| D02 | Add Account same Default flag as Edit                                                     | Owner B1 approval                                  | Approved placement/first/later states; atomic create/default contract planned |
| D03 | Choose another currency reuses existing modal with transaction context                    | Image annotation 2026-10-14                        | Required; supersedes custom picker depiction                                  |
| D04 | Separate issue/branch/PR with mockups in new spec; retarget latest main after #383 merged | Latest explicit requests                           | Authorized; branch updated to main                                            |
| D05 | No more mockup generation                                                                 | Latest explicit request                            | Enforced; existing final generated files only                                 |
| D06 | R3 missing-state visuals/copy                                                             | Owner reply approving B1 bindings and R3 additions | Approved exact manifest and combined revisions; receipt authoritative         |

## Planned delivery sequence

Planning/publication only is estimated at 45–75 minutes from new-issue intake,
excluding earlier image generation; next checkpoint is package publication. Full
implementation estimate and safe non-overlapping ownership will be supplied from
the approved plan. A credible estimate over four hours requires the workflow's
pre-start discussion before implementation. No implementation worker
quota/readiness assumptions are made now.

1. Publish this specification and immutable image/approval package in the
   separate stacked PR.
2. Finalize existing visual bindings and EN/AR adjustments; no regenerated
   mockups.
3. Complete plan/research/data-model/contracts/manual plan, then tasks and
   read-only analyze.
4. Map canonical task IDs to owners and dispatch in agreed order after gates
   pass.
5. Author tests/E2E before production changes; run authorized checks in a batch
   before committing/pushing; owner executes device/manual visual QA.

## Plan completion checkpoint — 2026-10-14

Pre-plan gates passed before setup. Exact approved spec/B1 source bytes remain
frozen. Phase0 research and Phase1 design cover evidence, source adapters,
shared review state, durable SMS v2, existing modal/form patterns and complete
financial saves. Agent context script completed; active Speckit marker points to
this plan. No new mockups, SQL, hosted mutations, test implementation or
workers.

Research identified two necessary technical extensions: complete selected-review
batch action and atomic account creation with default intent. New local SQL
registrations, protected sync and reconciliation scope are proposed in the
contracts and require explicit approval before implementation; no deployment is
included. Full implementation estimate is12–18h with safe overlap, to be refined
from tasks and discussed before worker start. Next steps: speckit-tasks, then
speckit-analyze.
