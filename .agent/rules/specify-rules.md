# Monyvi Development Guidelines

Delivery order follows `docs/development-workflow.md`; generated historical plan
notes do not reinstate mandatory TDD. Preserve tests and basic pre-merge
data/sync safety coverage; Mohamed owns manual testing.

Auto-generated from all feature plans. Last updated: 2026-10-07

## Active Technologies

- TypeScript ~5.9.2 strict mode; PostgreSQL SQL migrations; Deno-based Supabase
  Edge Functions + Expo 55, React Native 0.83.6, Expo Router, expo-localization
  55, expo-crypto 55, Supabase JS 2.106, Zod 4, @google/genai, NativeWind 4.2.6,
  i18next (389-voice-usage-limits)
- TypeScript ~5.9.2 strict mode; Expo 55 / React Native 0.83.6; Supabase Edge
  Functions + PostgreSQL; expo-localization; Zod 4; existing Gemini voice
  provider (389-voice-usage-limits)
- TypeScript ~5.9.2 in strict mode; Deno-based Supabase Edge Functions +
  `@supabase/supabase-js@^2.49.1`, Zod 4.4.3, native Fetch/AbortController,
  DeepInfra OpenAI-compatible Chat Completions API (388-sms-ai-provider)
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

- 389-voice-usage-limits: Planned unified Manual/Voice Add Transaction redesign,
  server-authoritative 5/day + 2/min voice allowance, local-midnight timezone
  windows, and subscription-ready entitlement boundary
- 389-voice-usage-limits: Planned server-authoritative local-day voice quotas,
  voice-only operational ledgers, provider-independent entitlements,
  availability endpoint, and mockup-gated client states
- 388-sms-ai-provider: Added configurable SMS AI provider boundary with
  DeepInfra/DeepSeek planning, strict external-response validation, and
  provider-independent prompt caching design
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
  mutation as authorized unless the delivery topology or explicit approval
  grants that exact operation.

## Database Ownership Classification (Constitution VII 2.1.0)

- In every spec/plan/tasks involving a database change, classify each field and
  table as **Supabase-owned/syncable** or strictly **device-only WatermelonDB**.
  Record the reason and source of truth; do not treat an existing cloud-backed
  parent table as automatic permission to sync its private recovery fields. See
  `docs/architecture/device-local-migration-policy.md`.
- For server-owned or syncable changes, require next-prefix local
  `supabase/migrations` SQL, generated public types/schema, local parity,
  CAS/RLS/ownership and independent review. A feature's implementation grant
  does not authorize remote `db:push`. `npm run db:migrate` currently performs
  `db:push` and MUST NOT be described as a local-only generation command.
- For genuinely device-only state, plan a numbered Watermelon migration, durable
  generator-consumed local schema override, non-generated model declaration,
  reproducible local generation and committed outputs. Include focused
  fresh/upgrade, ownership, pull preservation and privacy exclusion checks, plus
  affected retention/failure/restart checks needed for data safety. Follow the
  delivery policy: source first, batched checks and necessary safety evidence
  before merge. Apply the first-release impact rule; a migration does not
  mandate speculative recovery features or exhaustive scenarios. No dummy
  Supabase column, manual generated-base edit or public type deletion.
- Device-only storage cannot conceal server-owned financial/CAS/revision or
  cross-device business state. Material product/financial behavior still follows
  approved business-decisions/spec gates; this migration-routing policy alone
  adds no business decision and grants no feature-specific schema or hosted
  deployment approval.
- Scope migration source and generator ownership to the feature's separate PR.
  Workflow-only constitutional amendments do not alter the feature's frozen
  spec/plan/tasks, tests, products, SQL or approved mockup bindings.

<!-- MANUAL ADDITIONS END -->
