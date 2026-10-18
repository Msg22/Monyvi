---
description:
  Safely identify and remove dead code with batched verification under the
  delivery policy.
---

# Refactor Clean

Safely identify and remove dead code with batched verification under the
delivery policy.

## Step 1: Detect Dead Code

| Tool     | What It Finds                       | Command        |
| -------- | ----------------------------------- | -------------- |
| knip     | Unused exports, files, dependencies | `npx knip`     |
| depcheck | Unused npm dependencies             | `npx depcheck` |
| ts-prune | Unused TypeScript exports           | `npx ts-prune` |

If no tool is available, use Grep to find exports with zero imports.

## Step 2: Categorize Findings

| Tier        | Examples                                           | Action                                          |
| ----------- | -------------------------------------------------- | ----------------------------------------------- |
| **SAFE**    | Unused utilities, test helpers, internal functions | Delete with confidence                          |
| **CAUTION** | Components, API routes, middleware                 | Verify no dynamic imports or external consumers |
| **DANGER**  | Config files, entry points, type definitions       | Investigate before touching                     |

## Step 3: Safe Deletion Loop

For each SAFE item:

1. Confirm dead-code evidence and dependencies before surgical removal.
2. Keep one cohesive owned cleanup scope; preserve existing tests.
3. Batch relevant existing tests, type and lint checks at
   integration/pre-commit.
4. Investigate actual failures and revert only the unsafe owned change.
5. Follow [delivery policy](../../docs/development-workflow.md) for owner manual
   feedback and regression coverage; no full-suite rerun per deletion.

## Step 4: Handle CAUTION Items

Before deleting CAUTION items:

- Search for dynamic imports: `import()`, `require()`
- Search for string references: route names, component names in configs
- Check if exported from a public package API
- Verify no external consumers

## Step 5: Consolidate Duplicates

After removing dead code, look for:

- Near-duplicate functions (>80% similar) — merge into one
- Redundant type definitions — consolidate
- Wrapper functions that add no value — inline them

## Step 6: Summary

```
Dead Code Cleanup
──────────────────────────────
Deleted:   N unused functions
           N unused files
           N unused dependencies
Skipped:   N items (tests failed)
Saved:     ~N lines removed
──────────────────────────────
All tests passing ✅
```

## Rules

- **Confirm unused behavior before deletion; verify the cohesive batch**
- **One deletion at a time** — Atomic changes make rollback easy
- **Skip if uncertain** — Better to keep dead code than break production
- **Don't refactor while cleaning** — Separate concerns
