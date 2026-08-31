# Monyvi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-14

## Active Technologies

- TypeScript (strict mode) **Primary Dependencies**: React
  (002-refactor-upcoming-payments)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript (strict mode) **Primary Dependencies**: React: Follow standard
conventions

## Recent Changes

- 002-refactor-upcoming-payments: Added TypeScript (strict mode) **Primary
  Dependencies**: React

<!-- MANUAL ADDITIONS START -->

## Constitution-bound Feature Delivery

- Every Speckit output must reference the current constitution and verify its
  constraints before proposing work. Record finalized business rules in
  `docs/business/business-decisions.md` before implementation.
- For multi-owner delivery, assign exclusive file ownership, document dependency
  bases and no-overlap controls, and keep Red tests separate from their Green
  implementation window.
- Keep implementation evidence append-only. A later verification supersedes a
  dated result; it never silently rewrites historical commands, counts, or source
  hashes.
- Do not treat a local branch, commit, worktree, push, pull request, or GitHub
  mutation as authorized unless the delivery topology or explicit approval grants
  that exact operation.
<!-- MANUAL ADDITIONS END -->
