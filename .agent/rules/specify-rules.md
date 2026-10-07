# Monyvi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-10-07

## Active Technologies

- TypeScript ~5.9.2 strict mode; PostgreSQL SQL migrations; Deno-based Supabase Edge Functions + Expo 55, React Native 0.83.6, Expo Router, expo-localization 55, expo-crypto 55, Supabase JS 2.106, Zod 4, @google/genai, NativeWind 4.2.6, i18next (389-voice-usage-limits)
- TypeScript ~5.9.2 strict mode; Expo 55 / React Native 0.83.6; Supabase Edge Functions + PostgreSQL; expo-localization; Zod 4; existing Gemini voice provider (389-voice-usage-limits)
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

- 389-voice-usage-limits: Planned unified Manual/Voice Add Transaction redesign, server-authoritative 5/day + 2/min voice allowance, local-midnight timezone windows, and subscription-ready entitlement boundary
- 389-voice-usage-limits: Planned server-authoritative local-day voice quotas, voice-only operational ledgers, provider-independent entitlements, availability endpoint, and mockup-gated client states
- 002-refactor-upcoming-payments: Added TypeScript (strict mode) **Primary
  Dependencies**: React

<!-- MANUAL ADDITIONS START -->

## Constitution-bound Feature Delivery

- Every Speckit output must reference the current constitution and verify its
  constraints before proposing work. Record finalized business rules in
  `docs/business/business-decisions.md` before implementation.
- For approved-mockup UI work, record the declared binding viewport or component
  context and every known spacing, sizing, color, typography, state,
  interaction, and transition fact. Bind explicit sidecar approval to an
  immutable content revision and reset changed binding facts to `PENDING` until
  renewed approval. Treat presentation-only frames, outer canvas, browser
  chrome, and export padding as non-binding; do not invent missing metadata.
  Require rendered comparison evidence and every in-scope responsive, dark, RTL,
  and enlarged-text variant before declaring visual completion.
- For multi-owner delivery, assign exclusive file ownership, document dependency
  bases and no-overlap controls, and keep Red tests separate from their Green
  implementation window.
- Keep implementation evidence append-only. A later verification supersedes a
  dated result; it never silently rewrites historical commands, counts, or
  source hashes.
- Do not treat a local branch, commit, worktree, push, pull request, or GitHub
mutation as authorized unless the delivery topology or explicit approval grants
that exact operation.
<!-- MANUAL ADDITIONS END -->
