# OpenCode Security And Audit Controls

Read before every OpenCode dispatch mode.

## Server And Credentials

- Bind server to `127.0.0.1`; disable network discovery and unnecessary CORS.
- Prefer a short-lived server. Every server must set Basic Auth through runtime
  secret injection unless an OS/container network namespace prevents access by
  unrelated processes; never store password in repository, brief, or log.
- Keep provider credentials in OpenCode credential storage or approved secret
  manager. Never add them to project configuration or environment files.
- Pass minimal environment allowlist required for model/provider and task.
  Prevent inherited shell, cloud, GitHub, Supabase, signing, release, and
  production credentials unless separately required and authorized.

## Permission Profiles

OpenCode defaults are not deny-by-default. Supply an explicit task profile and
never use unrestricted `--auto`.

Read-only capability qualification:

- allow reads/searches only within the assigned task source scope, or use a
  sanitized checkout containing only approved sources;
- explicitly deny `.git` metadata, `.env`, `.env.*`, `.mcp*.json`, credential
  stores, auth files, private keys, and any other repository-specific secret
  path unless supplied as a separately reviewed synthetic example;
- deny edits, external directories, shell mutation, subagents, sharing, and all
  Git/remote mutations;
- deny network fetch/search by default. When approved public research is
  necessary, use a separate trusted lane or allow only exact domains/URLs and
  sanitized queries recorded in the task packet; never permit general egress.

Bounded write with recommended canary or explicit waiver:

- give one worker exclusive responsibility for one complete task in one isolated
  worktree/branch;
- preserve non-overlapping artifact/file ownership across concurrent writers;
  one writer owns each artifact per wave, and any overlap stops the lane;
- allow cohesive edits required by that task within its exclusively owned
  artifacts rather than relying on brittle per-file micromanagement;
- explicitly deny `.git` metadata, secrets, external directories, dependency
  installation, destructive actions, releases, deployments, and unauthorized
  Git/remote operations;
- deny general shell and network access. If a narrowly named non-mutating
  verification capability is separately exposed, authorize only that capability
  under the reviewed profile; otherwise the trusted native owner runs
  verification;
- deny external directories except read-only traversal of a resolved, verified
  main-workspace `node_modules` target required by Monyvi worktree junction;
  deny edits and shell mutations against that target;
- require lead response for any unlisted permission request; never remember a
  broader permission for convenience.

Every real-write assignment must have positive evidence for every material
capability it will use. The absence of a recorded unsupported capability is not
proof of support. Capability evidence is bound to the exact
provider/model/runtime/tool/profile combination and must be rechecked when a
material dimension changes.

The recommended default is to independently qualify the exact bounded-write
profile in a disposable synthetic checkout. The canary should prove one
legitimate in-scope edit succeeds and probes for outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action are denied.

The user may explicitly waive the canary for a specific model/task/profile. The
waiver must be recorded before dispatch and does not waive any other control. A
waived real-write lane requires all of the following:

- one isolated worktree/branch with one exclusive task owner;
- non-overlapping artifact/file ownership, with one writer per artifact per
  wave;
- the explicit deny-by-default permission profile described above;
- no secrets, private financial records, bank/SMS payloads, personal
  identifiers, authentication artifacts, or other private user data in model
  context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- the required lead-accepted pause gates for plan/assumptions and failing Red
  evidence where applicable, plus any task-required interim diff/risk gate;
- independent trusted-native inspection of the complete diff and execution of
  the required tests/verification before any result is accepted;
- immediate abort on any unauthorized access/write, sensitive-data exposure,
  ownership conflict, destructive intent/action, or other security boundary
  breach.

When the recorded waiver and all safeguards above are present, lack of a canary
alone is not a stop condition. A material permission-profile expansion requires
a fresh canary or a new explicit user-authorized waiver for that expanded
profile. A waiver can never waive incident revocation or requalification.

If runtime cannot enforce declared filesystem, environment, command, and network
boundaries, require a real OS/container sandbox that does or abort external
lane. An isolated worktree and post-run diff are evidence controls, not a
sandbox, and never justify dispatch with unenforced boundaries.

## Sensitive Data

Never include secrets, access tokens, environment values, production or private
financial records, bank/SMS payloads, personal identifiers, authentication
artifacts, or unredacted logs in prompts, attachments, session titles, model
context, or ledger. Use synthetic fixtures and minimum source excerpts.

If sensitive data is exposed, abort immediately. Revoke write eligibility for
the exact model/task/profile, preserve only sanitized incident evidence, rotate
affected credentials through the approved process, and require incident review
and requalification before that lane can write again. A user-authorized canary
waiver cannot waive this response.

## Ownership And Git Safety

- One complete task/session/worktree/owner has exclusive write responsibility.
- One writer owns each artifact/file per wave across all concurrent lanes.
  Stop and report any ownership overlap before further edits.
- Record base SHA before dispatch and verify it before accepting output.
- Define task/worktree scope plus protected/forbidden paths. Permit cohesive
  in-scope edits only within artifacts exclusively owned by that worker.
- Stop on unexpected dirty state or changed base.
- Do not expose a linked worktree's `.git` pointer or shared Git directory to
  the external runtime. A trusted native pre/postflight owns base, status, and
  diff commands through a narrowly scoped Git wrapper; alternatively use a
  sanitized self-contained checkout with no credentials or writable remote.
- OpenCode must never install dependencies, commit, push, open/merge PR, resolve
  review threads, rewrite history, deploy, release, or remove another owner's
  work. Trusted native owner performs any authorized integration or Git/PR
  mutation.
- Inspect untracked files, ignored outputs when relevant, and the full diff
  before accepting any result.

## Mentoring, Pause Gates, Failure, And Timeout Safety

Persistent-session checkpoints are control gates, not asynchronous status
reports:

1. The worker pauses after plan/assumptions. The lead must explicitly accept
   that checkpoint before implementation edits begin.
2. Where TDD or debugging applies, the worker pauses after failing-test or
   reproduction evidence. The lead must explicitly accept it before production
   implementation begins.
3. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
4. Verification and final-diff checkpoints remain required before acceptance.

Observe status and diffs; do not request or retain hidden chain-of-thought. Send
bounded corrections in the same session when recoverable.

Sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach immediately aborts the session and revokes write eligibility for
the exact model/task/profile pending incident review and requalification. This
revocation is non-waivable, including when the user waived the canary.

For ordinary rule drift or a materially wrong but safe direction, correct
explicitly and allow up to three materially identical rule failures on that
model/task lane before stopping and reassigning. A failed task does not
permanently disqualify the model from an unrelated capability.

Timeouts guide task sizing, checkpoint frequency, and timeout budget. A timeout
or silent polling interval alone is not a security failure or permanent model
disqualification; recheck the same session and continue there when recoverable.

## Independent High-Risk Verification

Approved financial, schema, sync, security, architecture, authentication/RLS, or
migration implementation by an external model requires an independent
appropriate specialist before acceptance. External implementation does not grant
decision authority.

## Post-Task Teardown And Reuse

After every accepted task, always tear down:

- the model session;
- injected credentials; and
- the live OpenCode server.

These resources are never retained as a reusable lane. Only non-sensitive
resources such as an isolated worktree, adapter configuration, and sanitized
task metadata may remain reusable. Record the owner, expiration, and mandatory
cleanup deadline for every retained reusable resource.

## Sanitized Ledger

Keep only operational metadata needed for traceability:

- task, owner, exact provider/model, worktree/branch, base SHA, task scope,
  artifact/file ownership, and protected paths;
- positive material-capability evidence;
- user opt-in record, approved provider, purpose, data-sharing boundary, and
  authorization expiry or review deadline;
- permission-profile identifier, canary status or recorded user-authorized
  waiver, eligibility status, timestamps, checkpoint acceptances, corrections,
  and terminal status;
- verification commands and summarized results;
- changed-path list, disposition, retry/rule-failure count, final result, and
  risk notes.

Do not retain full prompts, hidden/model reasoning, raw unnecessary tool
transcripts, credentials, user data, source snapshots, or unnecessary diffs. Set
explicit short retention for sanitized operational logs and delete them after
the acceptance or incident window. Store no ledger entry in product data or
source control unless project explicitly adopts a sanitized tracked format.

## Stop Conditions

Immediately abort and revoke the exact model/task/profile write eligibility
pending incident review and requalification on sensitive-data exposure,
unauthorized scope access/write, or another security boundary breach. The user
cannot waive this response.

Also stop for stale base, ownership conflict, overlapping artifact/file
ownership, unenforceable security boundary, or unverifiable result. For ordinary
recoverable drift, use the explicit same-session correction and
three-identical-rule-failures policy above rather than weakening controls or
cold-starting a new session simply to finish faster. Absence of a canary by
itself is not a stop condition when the user-authorized waiver and required
safeguards are recorded.
