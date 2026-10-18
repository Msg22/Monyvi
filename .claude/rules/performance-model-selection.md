---
description:
  Performance optimization guidelines for Claude Code model selection, context
  management, and agent delegation.
globs: ["**/*"]
---

# Performance & Model Selection

## Model Selection Strategy

**Haiku** (lightweight, cost-effective):

- Documentation updates, codemap generation
- Simple file renames and import fixes
- Single-file utility creation

**Sonnet** (best coding model — default for most work):

- Main development work and code generation
- Code reviews, security reviews, database reviews
- Build error resolution and refactoring
- Orchestrating multi-agent workflows

**Opus** (deepest reasoning):

- Complex architectural decisions
- Feature planning across multiple packages
- Debugging complex interactions spanning db → logic → mobile → api
- Research and analysis tasks

## Context Window Management

When context is getting large (many files read), prefer:

- Delegating to specialized agents (they get fresh context)
- Using `@agent` for focused subtasks
- Compact before starting large multi-file changes

Lower context sensitivity (safe when context is large):

- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Agent Delegation

Use specialized agents proactively:

- `architect` or `planner` → before implementing complex features
- `typescript-reviewer` → after completing a feature, before PR
- `security-reviewer` → after writing auth, API, or financial code
- `build-error-resolver` → when build/type errors occur
- `tdd-guide` → assigned regression coverage after implementation/manual
  feedback, or explicitly requested scoped TDD; follow
  docs/development-workflow.md
- `performance-optimizer` → when adding lists, observers, or heavy screens
