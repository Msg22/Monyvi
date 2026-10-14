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
- Current implementation order: user-created Normal ChatGPT → Antigravity →
  justified native fallback. Owner removed the unavailable intermediate pool on
  2026-10-14; active workflow cleanup is assigned separately.
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

Owner subsequently approved full implementation and concrete local SQL/action/
protected-sync/reconciliation scope in the intake below. Hosted deployment, data
resets/backfills and main merge remain outside this authorization.

## Approved implementation intake — 2026-10-14

**Owner direction**: “approved, please start the full implementation including
the local SQL and sync changes. use the workers in the agreed order, run checks
in one batch, and no emulator testing.” Additional direction removes the
unavailable intermediate models and their active workflow mentions. T001
approval is satisfied; no repeated approval requested. Full estimate
remains12–18h, including independent reviews/integration; actual
device/visual/accessibility execution remains owner-run. Wall-clock intake19:03
UTC, first30min checkpoint 19:33 UTC, with wave-transition updates sooner.

Execution: main checkout `E:/Work/My Projects/Monyvi`, branch
`codex/395-shared-account-review` clean at944cbafc before ledger update. Fresh
main remains7838df64 and included. #393 is still OPEN at0bb9fffb, base
`codex/ui-field-foundation`, owns an independent Add/Edit shared-field
migration. This feature preserves current form behavior and adds only its
approved default control/helper; it will not merge #393 or copy its shared-field
foundation. Recheck/reconcile if #393 or main changes before form integration.

Capability probes and contact recovery:

- Normal ChatGPT `391 - Audio validation extra`
  (`6acc6605-9b30-83e9-8e4f-abe71fee4f0c`): read-only readiness probe accepted;
  one status request sent. App returns only content-reference placeholders;
  Chrome explicitly shows “This response couldn’t load,” and Copy is empty. No
  branch/artifact write ownership granted; probe paused.
- Normal ChatGPT `Monyvi #347 — Server for backend tests/accounting`
  (`6ac63cf6-54fc-83e9-adba-b1d4338ba0a0`): read-only probe and status request
  accepted but no readable new turn; Chrome shows “Something went wrong.” No
  #395 write grant; previous assignments stay frozen; probe paused.
- Antigravity desktop exists; `agy`, `antigravity` and `gemini` are absent on
  PATH, standard CLI bins absent, no callable MCP or native-app control surface
  in this session. This is a callable-runtime blocker, not a quota claim.
- Native fallback is justified for the following bounded ready leaves. Recheck
  primary-pool capability before each subsequent assignment; do not infer a
  permanent failure or let an old remote run resume edits.

| Task | Lane / exclusive owner        | Worktree / branch                                                             | Scope                                                                         | Dependency                             | ETA / checkpoint                 | Status                                                                                                          |
| ---- | ----------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| W001 | Native `395_workflow_cleanup` | sibling `Monyvi-issue395-workflow`, `codex/395-workflow-worker` from944cbafc  | Active delivery workflow/skill cleanup; current tasks/quickstart routing only | Owner explicit workflow-change request | Finished within bounded estimate | Complete; accepted 8-file patch integrated into main uncommitted, T001/T002 recorded; source ownership released |
| T004 | Native `395_wire_contracts`   | sibling `Monyvi-issue395-contracts`, `codex/395-contract-worker` from944cbafc | Four technical contracts plus normative wire shapes; no code/SQL              | Approved scope, analyzed tasks         | Complete after guard checkpoint  | Accepted five-doc freeze integrated into main; parity5/5 and whitespace passed; ownership released              |

Both sibling worktrees are on E drive in the repository parent and share main
node_modules via junction. Writers own disjoint files. Root owns this ledger and
main integration coordination; workers make repository edits. T005 onward
production remains blocked on exact T004 contract freeze and test-first Red. No
feature production code, SQL, hosted change, emulator or provider call yet.

W001 result: edited team-led canonical workflow/skill plus current tasks and
quickstart routing; removed four retired entrypoints (two old execution
workflows, their skill and obsolete runtime PR adapter). Tracked active workflow
Markdown/current routing has no retired-pool mentions; retained links resolve,
whitespace clean. Historical feature evidence stays unchanged. Root reviewed
actual changed-file diff before mechanical main integration. No commit/push yet,
to consolidate publication with implementation. T001/T002 now checked from
recorded approval and main/#393 scope verification.

Fresh Normal ChatGPT chats requested asynchronously (Core/UI) to recover
preferred authoring capacity without blocking local progress. Existing failed
probes keep no write ownership. Local Deno/FFmpeg/Docker verified and Supabase
DB healthy; runtime availability is not feature validation. T004 identified076's
nonzero immutable-effect constraint; any narrowly scoped zero-net registration
must retain old-tuple rejection and SQL-enforceable root association, with
independent DB/security review before implementation acceptance.

## Worker recovery and contract freeze — 20:15 UTC

Owner created Normal ChatGPT `Monyvi #395 — Core`
(`6acfdd38-ba70-83ea-a4cc-01f8b5ffff6c`) and `Monyvi #395 — UI`
(`6acfdd2b-8a14-83ea-a4df-2827d27c5403`). Ordinary response bodies return
content-reference placeholders, so bounded capability reports use isolated
GitHub branches. UI published only its report at
`codex/395-ui-capability@532dcc81883a1d68857d12da8bb459c3ea88ae62`; actual
read/write access verified from the fetched artifact. UI authoring awaits
published frozen contracts, exclusive files and Red-first handoff. Core has a
five-minute report-only grant on `codex/395-core-capability`; no production
ownership yet. Both chats must stay in Normal ChatGPT.

T004 accepted as a technical freeze. Default/create CAS compares all current
active owned account IDs and current default ID/flag, never local/server
timestamps. Identical relevant A→B→A state may accept; changed active/default
state rejects atomically. Default clearing updates only its flag. Offline
successors retain durable local-only predecessor dependencies. Zero-net effects
require narrow root/tuple validation; zero-opening Add has empty effects.
Prefixes088/089 reserved after local001–087 history verification.
Publication-fence→owner-lock→account-row ordering must be proven across
generic/legacy/new writers, independently reviewed before SQL acceptance.
Contract completion does not claim that implementation proof.

T003/context validation is assigned to the existing local integration worker.
Normal ChatGPT cannot run this machine's binding/node checks; Antigravity has no
callable local runtime. Only a new intake report may be written. No production,
SQL execution or emulator testing has started. Intake elapsed approximately72
minutes; full forecast remains within approved12–18 hours.

T003 completed at20:20:42 UTC: all23 canonical CLI/API bindings, receipt-pinned
images/approved sidecars/Binding Facts/combined revisions, three dependencies,
spec and manifest passed. The existing pre-plan scope index is unchanged; full
reference-to-surface map and reproducible commands are in
[intake checks](validation/intake-checks.md). Eleven dirty-document Prettier
checks and whitespace passed; temporary verifier removed. No application tests
or SQL ran. Core independently published its report at
`codex/395-core-capability@0319581a9026240c2e3f39ba408e6b979f45feb7`; read/write
access verified. Both report-only grants are now frozen.

Next wave: publish the accepted context on an isolated handoff branch; Core owns
T005/T007 test authoring and UI owns T006/T008. Both produce isolated test-only
commits, then freeze for local Red verification. No corresponding production
edits until Red evidence is accepted. Local checking is a dependent successor,
not transfer of remote implementation ownership. Target feature branch
publication remains consolidated after implementation checks.
