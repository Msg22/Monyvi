---
name: verification-loop
description:
  "A comprehensive verification system for pre-PR quality gates. Use after
  completing features, before creating PRs, or after refactoring."
---

# Verification Loop Skill

A comprehensive verification system for ensuring quality before PRs.

## When to Use

Invoke this skill:

- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification

```bash
# Check if project builds
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check

```bash
npx tsc --noEmit 2>&1 | head -30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check

```bash
npm run lint 2>&1 | head -30
```

### Phase 4: Test Suite

```bash
# Run tests with coverage
npm run test -- --coverage 2>&1 | tail -50

# Check coverage threshold
# Target: 80% minimum
```

Report:

- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan

```bash
# Check for secrets
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# Check for console.log
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### Phase 6: Diff Review

```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:

- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Batched validation and owner manual testing

Follow `docs/development-workflow.md`. Run the relevant existing checks together
at integration/pre-commit and final affected checks after code/test changes. Do
not run verification every 15 minutes, after every function or after each file
edit. Re-run affected checks only for new changes, failures or unresolved risks.
Keep hooks and CI enabled.

Report implementation/manual-ready status separately from Mohamed's actual
manual acceptance. No emulator/device execution unless explicitly requested.
Regression coverage follows behavior stabilization; focused financial/sync/data
safety tests remain required before merge and may follow implementation.
