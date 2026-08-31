# Metals Implementation Evidence

## Scope

Append-only future evidence ledger. Slice 1 creates this template only: no
production code/test work ran. After Slice 2 reviews, one stable local foundation
commit and isolated local branches/worktrees are authorized; no Metals push or PR
is authorized. Optional `before_implement` MUST NOT run.

## Red / Green / Refactor Record

```markdown
### [Slice/task or story] — [date]

Base: [verified commit/hash or explicitly uncommitted approved base]
Owner: [named owner]
Scope: [owned files only]
Requirements: [FR IDs, SC IDs, checklist proof IDs]

#### Red gate
| Test or command | Expected missing behavior | Actual failure | Result |
| --- | --- | --- | --- |
| `[exact command]` | [specific failure] | [output/evidence] | Red / stop |

#### Green gate
| Test or command | Expected behavior | Actual result | Evidence |
| --- | --- | --- | --- |
| `[exact command]` | [observable acceptance] | pass/fail | [path/run/log] |

#### Refactor and verification
| Check | Result | Evidence |
| --- | --- | --- |
| Focused suites | pass/fail | [exact command/output] |
| Type/lint/migration as applicable | pass/fail | [exact command/output] |
| `git diff --check` | pass/fail | [output] |
| Rebase/overlap review | pass/fail | [base/shared-file check] |

Manual-only cases: [scenario, runner limit, human owner, evidence]
Stop conditions triggered: [none or exact condition/action]
```

Green starts only after every listed test fails for intended missing behavior.
Infrastructure, fixture, type, or unrelated failure is a stop, not Red evidence.

## Command Log Rules

- Record exact command, working directory, date, base, result, and linked
  output for Red/Green, migration, SQLite, SQL, typecheck, lint, Maestro, hash,
  and diff checks.
- Never record an unrun command as passed. Keep blocked runner cause plus
  manual-only owner/rationale.
- Re-run and append affected evidence after rebase, source-hash drift, schema or
  fixture regeneration; do not overwrite historical evidence.

## Stop Conditions

Stop and return to owner/product for source-authority conflict; unapproved
business/schema/sync/account/design decision; non-intended Red failure; Green
regression; non-determinism; dirty/overlapping shared owner files; changed base;
migration collision; generated drift; asset mismatch; incomplete writer inventory;
unproven local/RPC atomicity; unsafe user scope; watermark safety failure; or
inaccessible consequential flow.

## Optional Hook Prohibition

`.specify/extensions.yml` marks `before_implement` as `optional: true`. It is
not required and MUST NOT run unless later explicit authorization requests its
commit action. Hook availability is never commit authorization.
