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

| Step                    | Status   | Evidence                                                                                                                                                                              |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect extension hooks | Complete | extensions.yml checked before plan; optional pre/post commits consolidated into authorized batch                                                                                      |
| `speckit-git-feature`   | Complete | PowerShell branch script returned `codex/395-shared-account-review`; exact override preserves project codex prefix                                                                    |
| `speckit-specify`       | Complete | `spec.md` follows repository template; feature selector points here                                                                                                                   |
| `speckit-clarify`       | Complete | Existing owner decisions encoded; coverage in `clarification-report.md`                                                                                                               |
| Requirements checklist  | Complete | `checklists/requirements.md` separates content quality from readiness                                                                                                                 |
| Spec owner approval     | Complete | Exact published spec approved on 2026-10-14; immutable bytes bound by `approvals/spec-2026-10-14.json`                                                                                |
| Visual/binding package  | Complete | B1 frozen manifest and exact owner receipt approvals/b1-2026-10-14.json; image/facts/dependencies unchanged                                                                           |
| Visual/binding gate     | Passed   | Explicit B1/R3 EN/AR approval recorded; all23 approved sidecars pass canonical verifier                                                                                               |
| `speckit-plan`          | Complete | setup-plan.sh --json selected exact feature; research/data-model/four contracts/quickstart and agent-context update; design gates checked                                             |
| `speckit-tasks`         | Complete | setup-tasks.sh selected exact feature; 80 unchecked canonical tasks, six priority-ordered stories, dependency/file serialization and coverage matrices; original #383 tasks untouched |
| `speckit-analyze`       | Complete | Read-only report emitted in chat; prerequisite selected exact feature with tasks; 32/32 requirement coverage, no actionable findings, no implementation authorization implied         |

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
from tasks and discussed before worker start. Tasks and analysis completed in
the following checkpoint.

## Tasks and analysis checkpoint — 2026-10-14

Task generation: 80 unchecked tasks; US1:7, US2:10, US3:8, US6:15, US4:7, US5:8,
shared:25. Twenty disjoint test-authoring tasks permit safe parallel work after
their prerequisites. The financial lane can overlap resolver/state/UI work;
shared reducer, hooks, shell, registry, sync, SQL, generated types and locales
serialize explicitly. No worker assignment made.

Read-only analysis compared spec/plan/tasks, four contracts, data model,
constitution1.7.0 and M01–M20. All24 FRs and eight buildable SCs have mapped
tasks; all20 manual scenarios and23 approved scoped references are represented.
No actionable duplication, ambiguity, constitutional conflict or baseline
coverage gap found. The structured report was emitted in chat without writing or
modifying analysis inputs; this checkpoint is subsequent administrative
bookkeeping, not remediation of analyzed artifacts.

All23 canonical bindings plus approved spec/manifest/dependency hashes passed
before consumption. Task format/count/story labels/references and document
format/whitespace are checked at publication; this is documentation validation,
not implemented/covered behavior. All task checkboxes remain pending, including
owner-rendered and separate accessibility evidence. No emulator/test authoring,
app source change, SQL execution or provider call occurred.

Next: review canonical tasks and authorize full implementation plus the concrete
local SQL/financial-action/protected-sync/reconciliation scope. T001 records
that approval; T002 refreshes main/#393 and T004 freezes exact wire schemas and
next local migration prefixes before consumers. Provisional estimate remains
12–18 elapsed hours with safe overlap; refine at intake. Hosted deployment, data
resets/backfills and main merge remain outside this authorization.
