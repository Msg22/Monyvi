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
- allow edits required by that assigned task inside the isolated worktree rather
  than relying on brittle per-file micromanagement; define explicit protected
  paths and reject edits outside the worktree or task responsibility;
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

The recommended default is to independently qualify the exact bounded-write
profile in a disposable synthetic checkout. The canary should prove one
legitimate in-scope edit succeeds and probes for outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action are denied.

The user may explicitly waive the canary for a specific model/task/profile. The
waiver must be recorded before dispatch and does not waive any other control. A
waived real-write lane requires all of the following:

- one isolated worktree/branch with one exclusive task owner;
- the explicit deny-by-default permission profile described above;
- no secrets, private financial records, bank/SMS payloads, personal identifiers,
  authentication artifacts, or other private user data in model context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- the normal persistent-session mentoring checkpoints for plan/assumptions,
  failing-test evidence where applicable, interim diff/risk, verification, and
  final diff;
- independent trusted-native inspection of the complete diff and execution of
  the required tests/verification before any result is accepted;
- immediate abort on any unauthorized access/write, sensitive-data exposure,
  destructive intent/action, ownership conflict, or other boundary breach.

When the recorded waiver and all safeguards above are present, lack of a canary
alone is not a stop condition. A material permission-profile expansion requires
a fresh canary or a new explicit user-authorized waiver for that expanded
profile. Read-only benchmark results remain capability evidence; lack of one
capability such as image input does not invalidate unrelated source-only
capability.

If runtime cannot enforce declared filesystem, environment, command, and network
boundaries, require a real OS/container sandbox that does or abort external
lane. An isolated worktree and post-run diff are evidence controls, not a
sandbox, and never justify dispatch with unenforced boundaries.

## Sensitive Data

Never include secrets, access tokens, environment values, production or private
financial records, bank/SMS payloads, personal identifiers, authentication
artifacts, or unredacted logs in prompts, attachments, session titles, model
context, or ledger. Use synthetic fixtures and minimum source excerpts.

Stop and treat session as exposed if sensitive data appears. Abort, preserve
only sanitized incident evidence, rotate affected credential through approved
process, and do not reuse session.

## Ownership And Git Safety

- One complete task/session/worktree/owner with exclusive write responsibility.
- Record base SHA before dispatch and verify it before accepting output.
- Define task/worktree scope plus protected/forbidden paths. Permit cohesive
  in-scope edits that the task genuinely needs; stop on another owner's scope.
- No overlapping writer. Stop on unexpected dirty state or changed base.
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

## Mentoring, Failure, And Timeout Safety

Use persistent-session checkpoints for plan/assumptions, failing-test evidence
where applicable, interim diff/risk, verification, and final diff. Observe
status and diffs; do not request or retain hidden chain-of-thought. Send bounded
corrections in the same session when recoverable.

Abort immediately for secrets/private-data exposure, destructive intent or
action, or unauthorized boundary crossing. For ordinary rule drift or a
materially wrong but safe direction, correct explicitly and allow up to three
materially identical rule failures on that model/task lane before stopping and
reassigning. A failed task does not permanently disqualify the model from an
unrelated capability.

Timeouts guide task sizing, checkpoint frequency, and timeout budget. A timeout
or silent polling interval alone is not a security failure or permanent model
disqualification; recheck the same session and continue there when recoverable.

## Sanitized Ledger

Keep only operational metadata needed for traceability:

- task, owner, exact provider/model, session, worktree/branch, base SHA, task
  scope, and protected paths;
- user opt-in record, approved provider, purpose, data-sharing boundary, and
  authorization expiry or review deadline;
- permission-profile identifier, canary status or recorded user-authorized
  waiver, timestamps, checkpoint outcomes, corrections, and terminal status;
- verification commands and summarized results;
- changed-path list, disposition, retry/rule-failure count, final result, and
  risk notes.

Do not retain full prompts, hidden/model reasoning, raw unnecessary tool
transcripts, credentials, user data, source snapshots, or unnecessary diffs. Set
explicit short retention for session logs and delete them after acceptance or
incident window. Store no ledger entry in product data or source control unless
project explicitly adopts a sanitized tracked format.

## Stop Conditions

Immediately abort and escalate on sensitive-data exposure, destructive intent or
action, unauthorized boundary crossing, or any breach of a recorded canary
waiver safeguard. Also stop for stale base, ownership conflict, unenforceable
security boundary, or unverifiable result. For ordinary recoverable drift, use
the explicit same-session correction and three-identical-rule-failures policy
above rather than weakening controls or cold-starting a new session simply to
finish faster. Absence of a canary by itself is not a stop condition when the
user-authorized waiver and required safeguards are recorded.
