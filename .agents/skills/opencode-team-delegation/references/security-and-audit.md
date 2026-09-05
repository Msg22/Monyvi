# OpenCode Security And Audit Controls

Read before every OpenCode dispatch mode.

## Server And Credentials

- Bind every server to `127.0.0.1`; disable network discovery and unnecessary
  CORS.
- Prefer one short-lived dedicated loopback server per task, with its own server
  identifier, task-scoped Basic Auth credential, and task-scoped
  provider/session credentials. Never store credentials in repository, brief, or
  log.
- A shared loopback server is allowed only when the lead records why it is
  needed, its server ID, every active task/session using it, and which
  credentials are task-scoped versus server-global. Do not put a task-exclusive
  secret in a server-global environment.
- Keep provider credentials in OpenCode credential storage or approved secret
  manager. Never add them to project configuration or environment files.
- Pass the minimal environment allowlist required for model/provider and task.
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
- derive a concrete workspace-relative writable allowlist from that exclusive
  artifact set. Use exact files and the minimum owned directory prefixes needed
  for cohesive edits or new in-scope files; never grant arbitrary
  repository-root writes;
- enforce the writable allowlist in the permission profile. Any attempted or
  actual write outside it is a security boundary breach;
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

## Immutable Identity And Capability Evidence

Before every dispatch, record the exact provider, provider-prefixed model ID,
**immutable provider model revision/build**, OpenCode/runtime version, exact
tool surface/version set, permission-profile identifier or hash, and environment
boundary relevant to the task. A moving display alias is not sufficient model
identity. If the immutable revision/build cannot be established, do not reuse
prior capability evidence or a canary waiver for write work.

Every real-write assignment must have positive evidence for every material
capability it will use. Capability evidence is bound to the immutable model
revision/build plus every runtime/tool/permission/environment dimension material
to that capability. The absence of a recorded unsupported capability is not
proof of support. When the immutable model revision/build changes, invalidate
all capability evidence for the prior revision. When another bound dimension
changes, invalidate every affected capability record and requalify it before
use.

Negative capability evidence is revision-bound too. A known unsupported
capability from one revision must not be generalized to a different revision;
the new revision remains unqualified for that capability until it has positive
evidence.

## Canary And Waiver Binding

The recommended default is to independently qualify the exact bounded-write
profile in a disposable synthetic checkout. The canary should prove one
legitimate in-scope edit succeeds and probes for outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action are denied.

The user may explicitly waive the canary. A waiver is valid only for the **exact
task** and the recorded full enforcement configuration:

- provider and provider-prefixed model ID;
- immutable provider model revision/build;
- OpenCode/runtime version;
- exact tool surface/version set;
- permission-profile identifier or hash;
- environment/sandbox and network boundary; and
- derived writable-allowlist fingerprint.

Any enforcement-relevant change invalidates the waiver before another write.
Changing task ID, model revision/build, runtime, tool surface, permission
profile, sandbox/network boundary, or writable allowlist requires a fresh
explicit user waiver or a canary for the changed configuration.

A waived real-write lane still requires:

- one isolated worktree/branch with one exclusive task owner;
- non-overlapping artifact/file ownership, with one writer per artifact per
  wave;
- the concrete enforced writable allowlist described above;
- explicit deny-by-default permissions;
- no secrets, private financial records, bank/SMS payloads, personal
  identifiers, authentication artifacts, or other private user data in model
  context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- the required lead-accepted pause gates for plan/assumptions and failing Red
  evidence where applicable, plus any task-required interim diff/risk gate;
- independent trusted-native inspection of the complete diff and execution of
  required tests/verification before any result is accepted; and
- immediate abort and incident quarantine on unauthorized access/write,
  sensitive-data exposure, or another security boundary breach.

When the recorded waiver and all safeguards are present, lack of a canary alone
is not a stop condition. A waiver can never waive incident quarantine,
requalification, positive evidence for unrelated material capabilities, or
independent verification.

### Provisional First-Write Evidence

A user-authorized waiver remains usable when **repository-edit capability is the
only material capability lacking prior positive evidence**. In that case, permit
one provisional first-write checkpoint under these additional controls:

1. Every other material capability required from the external worker already has
   positive evidence for the immutable configuration.
2. The worker may make one small representative edit only inside the derived
   writable allowlist.
3. The worker then pauses before any additional edit.
4. The trusted native owner verifies changed paths, permission enforcement, and
   the complete provisional diff.
5. Only an accepted checkpoint becomes positive repository-edit capability
   evidence for that immutable configuration and allows the same task/session to
   continue.

A failed provisional checkpoint is not capability evidence. An out-of-allowlist
attempt, unauthorized access, or other security breach immediately triggers the
quarantine rules below. The provisional first-write path never supplies evidence
for unrelated capabilities such as test execution, image input, or network/tool
use.

If runtime cannot enforce declared filesystem, environment, command, and network
boundaries, require a real OS/container sandbox that does or abort external
lane. An isolated worktree and post-run diff are evidence controls, not a
sandbox, and never justify dispatch with unenforced boundaries.

## Sensitive Data And Incident Quarantine

Never include secrets, access tokens, environment values, production or private
financial records, bank/SMS payloads, personal identifiers, authentication
artifacts, or unredacted logs in prompts, attachments, session titles, model
context, or ledger. Use synthetic fixtures and minimum source excerpts.

On sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach:

1. Abort the implicated session immediately.
2. Quarantine the implicated **provider + immutable model revision/build +
   OpenCode/runtime + tool combination** across read and write modes and **all
   permission profiles**.
3. Prevent a new task, session, worktree, or permission profile from bypassing
   quarantine.
4. Preserve only sanitized incident evidence and rotate affected credentials
   through the approved process.
5. Restore eligibility only after incident review and requalification succeed.

Incident review may narrow quarantine to a permission-profile-local cause only
when evidence proves that the breach was confined to that profile and the
intended restored configuration has passed requalification. Until then, the
broader provider/model-revision/runtime/tool combination remains quarantined.
User authorization or canary waiver cannot override quarantine.

## Ownership And Git Safety

- One complete task/session/worktree/owner has exclusive write responsibility.
- One writer owns each artifact/file per wave across all concurrent lanes. Stop
  and report any ownership overlap before further edits.
- Record base SHA before dispatch and verify it before accepting output.
- Derive the writable file/directory allowlist from the exclusively owned
  artifact set before dispatch and record its fingerprint with the task.
- Permit cohesive in-scope edits only inside that enforced writable allowlist.
  Expanding the allowlist is an enforcement-relevant profile change and requires
  the applicable waiver/canary revalidation before more writes.
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
3. When a provisional first-write checkpoint is required, the worker pauses
   immediately after the first representative allowlisted edit for
   trusted-native acceptance before any additional edit.
4. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
5. Verification and final-diff checkpoints remain required before acceptance.

Observe status and diffs; do not request or retain hidden chain-of-thought. Send
bounded corrections in the same session when recoverable.

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

## Terminal Task Teardown And Shared Servers

At every terminal task outcome—accepted, rejected, cancelled, failed, timed-out,
or security-aborted—terminate that task's model session and task-scoped injected
credentials immediately.

For server teardown:

- **Dedicated per-task server:** terminate it immediately with the terminal
  task.
- **Intentionally shared server:** remove the terminal task's session and
  task-scoped credentials immediately, update the active-session registry, and
  keep the server only while another recorded active task/session still needs
  it. Terminate the shared server as soon as the last active session becomes
  terminal.
- **Server/runtime implicated in a security incident:** abort every affected
  session and terminate the shared server immediately rather than waiting for
  the normal shared-server drain rule.

For a security-aborted task, retain only sanitized incident evidence needed for
incident review and requalification. For other terminal outcomes, only
non-sensitive resources such as an isolated worktree, adapter configuration, and
sanitized task metadata may remain reusable. Record the owner, expiration, and
mandatory cleanup deadline for every retained reusable resource.

## Sanitized Ledger

Keep only operational metadata needed for traceability:

- task, owner, provider/model ID, immutable model revision/build,
  OpenCode/runtime version, tool surface/version set, server ID/mode,
  worktree/branch, base SHA, task scope, artifact/file ownership, derived
  writable allowlist/fingerprint, and protected paths;
- positive material-capability evidence and the exact immutable identity/bound
  dimensions that evidence applies to;
- user opt-in record, approved provider, purpose, data-sharing boundary, and
  authorization expiry or review deadline;
- permission-profile identifier/hash, canary status or fully bound
  user-authorized waiver, provisional first-write status when used, quarantine
  and eligibility status, timestamps, checkpoint acceptances, corrections, and
  terminal status;
- verification commands and summarized results;
- changed-path list, disposition, retry/rule-failure count, final result, and
  risk notes.

Do not retain full prompts, hidden/model reasoning, raw unnecessary tool
transcripts, credentials, user data, source snapshots, or unnecessary diffs. Set
explicit short retention for sanitized operational logs and delete them after
the acceptance or incident window. Store no ledger entry in product data or
source control unless project explicitly adopts a sanitized tracked format.

## Stop Conditions

Immediately abort and apply the cross-profile quarantine above on sensitive-data
exposure, unauthorized scope access/write, an out-of-allowlist write attempt, or
another security boundary breach. The user cannot waive this response.

Also stop for stale base, ownership conflict, overlapping artifact/file
ownership, unenforceable security boundary, invalidated waiver/evidence, or
unverifiable result. For ordinary recoverable drift, use the explicit
same-session correction and three-identical-rule-failures policy above rather
than weakening controls or cold-starting a new session simply to finish faster.
Absence of a canary by itself is not a stop condition when the fully bound
user-authorized waiver and required safeguards are recorded.
