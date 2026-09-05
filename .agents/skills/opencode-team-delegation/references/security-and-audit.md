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

OpenCode defaults are not deny-by-default. Supply explicit task profile and
never use unrestricted `--auto`.

Read-only pilot:

- allow reads/searches only within task-specific source allowlist, or use a
  sanitized checkout containing only approved sources;
- explicitly deny `.env`, `.env.*`, `.mcp*.json`, credential stores, auth files,
  private keys, and any other repository-specific secret path unless supplied as
  separately reviewed synthetic example;
- deny edits, external directories, shell mutation, subagents, sharing, and all
  Git/remote mutations;
- deny network fetch/search by default. When approved public research is
  necessary, use a separate trusted lane or allow only exact domains/URLs and
  sanitized queries recorded in the task packet; never permit general egress.

Bounded mechanical write after pilot:

- allow `edit` only for exact path allowlist;
- allow only named non-mutating verification commands;
- deny destructive commands, dependency installation, schema/migration tools,
  secrets, Git commit/push, issue/PR mutation, release, and deployment;
- deny external directories except read-only traversal of resolved, verified
  main-workspace `node_modules` target required by Monyvi worktree junction;
  deny edits and shell mutations against that target;
- require lead response for any unlisted permission request; never remember a
  broader permission for convenience.

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

- One task/session/worktree/owner and explicit path allowlist.
- Record base SHA before dispatch and verify it before accepting output.
- No overlapping writer. Stop on unexpected dirty state or changed base.
- Do not expose a linked worktree's `.git` pointer or shared Git directory to
  the external runtime. A trusted native pre/postflight owns base, status, and
  diff commands through a narrowly scoped Git wrapper; alternatively use a
  sanitized self-contained checkout with no credentials or writable remote.
- External model must never install dependencies, commit, push, open/merge PR,
  resolve review threads, rewrite history, or remove another owner's work.
  Trusted native worker performs any authorized integration or Git/PR mutation.
- Inspect untracked files, ignored outputs when relevant, and full diff before
  accepting any result.

## Sanitized Ledger

Keep only operational metadata needed for traceability:

- task, owner, model, session, worktree, base SHA, allowed paths;
- user opt-in record, approved provider, purpose, data-sharing boundary, and
  authorization expiry or review deadline;
- permission-profile identifier, timestamps, terminal status;
- verification commands and summarized results;
- changed-path list, disposition, retry count, and risk notes.

Do not retain full prompts, model reasoning, raw tool transcripts, credentials,
user data, source snapshots, or unnecessary diffs. Set explicit short retention
for session logs and delete them after acceptance or incident window. Store no
ledger entry in product data or source control unless project explicitly adopts
a sanitized tracked format.

## Stop Conditions

Abort and escalate on permission escalation, sensitive-data exposure,
out-of-allowlist access/write, stale base, ownership conflict, destructive
intent, unverifiable result, repeated unchanged failure, or request involving
forbidden high-risk domains. Never weaken controls to finish faster.
