---
alwaysApply: true
---

# ECC Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Pull Request Workflow

When creating PRs:

1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## Worktree Rules

- **Disk & Location Invariant**: All git worktrees MUST be created on the exact
  same disk and within the exact same parent folder as the main repository
  (`E:\Work\My Projects\`), never on other disks (e.g., `C:`, user profile
  `~/.codex/worktrees/`, `~/.claude/worktrees/`, or temp paths).
- **Naming**: Sibling directories following `../Monyvi-<issue-or-feature-name>`.
- **Dependencies**: Never run `npm install` in secondary worktrees. Run
  `powershell -ExecutionPolicy Bypass -File scripts/link-worktree-node-modules.ps1 -RootWorkspace "E:\Work\My Projects\Monyvi"`.
