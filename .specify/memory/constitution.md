<!--
Sync Impact Report
- Version change: 1.5.0 → 1.6.0
- Modified principles:
  - I. Offline-First Data Architecture: scoped LWW to ordinary independent
    metadata; added atomic local action groups and server CAS for grouped
    lifecycle or balance-changing actions; clarified root and child sync columns.
  - VIII. Authenticated User Scope & Sync Correctness: made inherited ownership
    strict, retained multi-device access, and added rejected-action reconciliation.
  - Technology Constraints: limited Metals V1 to Gold and Silver and established
    the shared Decimal.js financial arithmetic contract.
- Added sections: None.
- Removed sections: None.
- Templates reviewed:
  - .specify/templates/plan-template.md ✅ compatible; no update required.
  - .specify/templates/spec-template.md ✅ compatible; no update required.
  - .specify/templates/tasks-template.md ✅ compatible; no update required.
  - .specify/templates/commands/*.md ✅ directory absent; no files to update.
- Follow-up TODOs:
  - TODO(PACKAGE_BOUNDARY_REPAIR): remove remaining allowlisted package-boundary
    debt tracked by architecture audit issues.
  - TODO(UI_DEBT_AUDIT): replace remaining content-loading ActivityIndicator
    usage, raw console calls, and unjustified raw hex/style exceptions.
  - TODO(AGENT_GUIDANCE_SYNC): reconcile AGENTS.md and equivalent runtime
    guidance with this amendment in separately authorized documentation work.
  - TODO(SECURITY_HARDENING): issue #240 owns app lock, MFA or step-up,
    session/device management, sign-in notifications, and SecureStore logout.
  - TODO(APP_WIDE_DECIMAL_AUDIT): issue #241 owns audit and staged migration of
    existing financial calculations; Metals is the first adopter.
-->

# Monyvi Constitution

## Core Principles

### I. Offline-First Data Architecture

WatermelonDB is the **single source of truth** for all user-facing data on the
device. Every read and write operation MUST happen locally first.

- All user data (accounts, transactions, transfers, categories, debts, recurring
  payments, assets) MUST be persisted in WatermelonDB before any network call.
- Cloud sync to Supabase runs in the background and MUST be non-blocking. The
  app MUST remain fully functional with zero network connectivity.
- Local calculations (net worth, account balances, asset valuations) MUST NOT
  depend on API availability. Use `@monyvi/logic` for on-device computation.
- Ordinary independently replaceable metadata MAY use WatermelonDB Last Write
  Wins reconciliation.
- A grouped lifecycle or balance-changing financial action MUST use a stable
  `action_id`, an expected financial revision, and one idempotent atomic local
  action group. Synchronization MUST submit the complete group through one
  atomic server compare-and-swap operation. The first complete valid action
  accepted for the expected revision becomes canonical; repeat delivery is
  idempotent. Client timestamps and Last Write Wins MUST NOT choose between
  competing grouped financial actions.
- Every user-owned root syncable table MUST include `created_at`, `updated_at`,
  `deleted`, and `user_id`. A user-owned child MAY omit `user_id` only under
  the strict inherited-ownership contract in Principle VIII.
- Server-generated read-only pull-only tables MAY omit `updated_at` and
  `deleted`. A globally shared server-generated table MAY also omit `user_id`.
  These tables MUST use approved specialized pull behavior. Current examples:
  `market_rates`, `daily_snapshot_balance`, `daily_snapshot_assets`, and
  `daily_snapshot_net_worth`.

### II. Documented Business Logic

All finalized business rules MUST be documented in
`docs/business/business-decisions.md` before implementation begins and kept up
to date as decisions evolve.

- Agents and developers MUST reference `business-decisions.md` for any business
  rule before writing code. If the document contradicts the current codebase,
  the **codebase is authoritative** — update the document to match.
- No assumptions about business logic are permitted. When a rule is ambiguous or
  missing from the document, ask the project owner for clarification.
- New business decisions MUST be added to the document as they are made.
- Outdated entries MUST be corrected or removed when discovered.
- Schema changes MUST be reflected in the document's table definitions.

### III. Type Safety (NON-NEGOTIABLE)

TypeScript strict mode is enforced across the entire monorepo. There are no
exceptions.

- **Never use `any`**. Use proper types, generics, or `unknown` when the type is
  truly unknown.
- All functions and methods MUST have explicit return type annotations.
- Use `interface` for object shapes; use `type` only for unions, intersections,
  or mapped types.
- Use `import type` for type-only imports to reduce transpilation overhead.
- Prefer `readonly` for properties that MUST NOT change after initialization.
- Validate all external API responses at runtime using `zod` schemas.
- Handle `null` and `undefined` safely — never use non-null assertions (`!`).
- Use `const` by default; `let` only when reassignment is necessary.
- Prefer `async/await` over `.then()` chains.

### IV. Service-Layer Separation

Business logic MUST be separated from UI and React lifecycle concerns.

- **`packages/logic/`**: Shared calculations and parsers used by both mobile and
  API (e.g., net worth calculations, voice parser, currency utils). Logic
  functions operate on plain interfaces and MUST NOT import from `apps/`.
- **`apps/mobile/services/` command services**: Mobile-specific command
  functions that interact with WatermelonDB writes, platform APIs, sync, auth,
  or external clients (e.g., `transaction-service.ts`, `account-service.ts`).
  These are plain async functions, not hooks.
- **`apps/mobile/services/` read-model services**: Scoped local queries, joins,
  grouping, and display/read aggregation that should be testable outside React.
  Read-model services own multi-table WatermelonDB query construction and
  screen-specific read shaping.
- **Hooks (`apps/mobile/hooks/`)**: React hooks handle **lifecycle and
  subscriptions only** — observing data, managing local UI state, triggering
  re-renders, cancellation, refetch, and service invocation. Hooks MUST NOT
  contain database write logic, raw multi-table query construction, or business
  calculations.
- **Route/container components**: May connect hooks/facades to UI and may call
  command services for simple user actions or explicit lifecycle orchestration.
  If loading/error/cancellation state, subscriptions, or reuse are needed, wrap
  the service call in a hook. Components MUST NOT import the raw `database`
  object or construct WatermelonDB queries/subscriptions directly.
- **Presentational components**: Zero business logic. Receive already-shaped
  data via props and render UI. They MUST NOT import services, query helpers, or
  business logic.
- The `Alert.alert()` pattern and all UI-specific concerns MUST stay in the
  calling component or hook, never in the service layer.

### V. Premium UI with Consistent Theming

The app MUST deliver a premium, polished visual experience using NativeWind
(Tailwind CSS for React Native) as the primary styling mechanism.

- **Prefer Tailwind CSS classes** (`className="..."`) over `StyleSheet.create`
  unless absolutely necessary for dynamic values or complex calculations.
- **Dark mode**: Use Tailwind dark variants (`dark:bg-background-dark`) for
  styling. The `isDark` ternary conditional MUST NOT be used in style objects or
  `className` props. **Exception**: `isDark` MAY be used for component props
  that accept color values (e.g., `<Icon color={isDark ? '#fff' : '#000'} />`),
  because Tailwind `className` does not work with these props.
- **Known NativeWind v4 bug**: `shadow-*`, `opacity-*`, and `bg-color/opacity`
  Tailwind classes on `TouchableOpacity` or `Pressable` cause a race condition
  crash. Use inline `style` props for shadow/elevation on these components.
- **Color palette**: Use the Egyptian-inspired palette defined in
  `apps/mobile/constants/colors.ts`. Never hardcode hex values in JSX.
- **Animations**: Use `react-native-reanimated` and
  `react-native-gesture-handler` for smooth micro-interactions.
- **No basic MVPs**: Every screen MUST feel premium — vibrant gradients, subtle
  animations, modern typography, and intentional spacing.
- **Schema-driven UI**: All data-driven screens MUST strictly match the existing
  database schema (`@monyvi/db` models). Do NOT invent, rename, remove, or infer
  fields. Labels, data types, and required/optional states MUST reflect the
  schema exactly.

### VI. Monorepo Package Boundaries

The Monyvi monorepo uses npm workspaces + Nx with strict dependency direction.

- **`packages/db` (`@monyvi/db`)**: WatermelonDB models, schema definitions,
  type exports, and sync configuration. MUST NOT import from `apps/` or other
  packages. DB models own persisted fields, relationships, and DB-local
  convenience only. They MUST NOT own presentation formatting, parsed helper
  state, app workflows, or shared calculations.
- **`packages/logic` (`@monyvi/logic`)**: Shared business logic (asset
  calculations, voice parser, notification parser, currency utils). Logic owns
  pure calculations, parsers, and formatters over plain interfaces. Runtime
  imports from `@monyvi/db` are forbidden; type-only imports are allowed only
  when unavoidable. MUST NOT import from `apps/`.
- **`apps/mobile`**: The React Native Expo app. May import from any package.

- Dependency direction: `apps/ → packages/logic → packages/db`. Never reverse.
- Prefer named exports over default exports for better refactoring tooling.
- Each package MUST have its own `tsconfig.json` extending the root config.
- Existing reverse imports from `packages/db` into `apps/mobile` or
  `@monyvi/logic`, and runtime imports from `packages/logic` into `@monyvi/db`,
  are documented architecture debt, not accepted precedent. New work MUST NOT
  add more reverse dependencies. When touching affected model getters, move
  presentation formatting, parsed helper state, and app-specific helpers out of
  `packages/db`.

### VII. Local-First Migrations

All database schema changes (DDL) MUST go through local SQL migration files.

- Create `.sql` migration files in `supabase/migrations/` for every schema
  change (tables, columns, triggers, functions, indexes, RLS policies, enums).
- Follow the existing numbering convention:
  `supabase/migrations/NNN_descriptive_name.sql`.
- Run `npm run db:push` to apply local migrations to the remote Supabase
  database.
- Run `npm run db:migrate` to regenerate WatermelonDB schema, types, and local
  watermelon migrations from the latest SQL migration.
- Run `npm run db:sync-local` when you need to ensure that `schema.ts` and
  `supabase-types.ts` are up-to-date without pushing to remote. This also picks
  up the latest local migration into the WatermelonDB schema. Use this instead
  of `db:migrate` when the remote database is already up-to-date and you only
  need to refresh local generated files.
- **NEVER** use the Supabase MCP tool's `apply_migration` or `execute_sql` for
  DDL changes. **NEVER** make schema changes directly in the Supabase dashboard.
- The Supabase MCP tool MAY be used for **read-only** operations (querying data,
  checking schema, listing tables, inspecting logs).
- Commit both the migration file and generated schema changes together.
- **Bringing existing Supabase tables into WatermelonDB:** When adding an
  existing Supabase table to WatermelonDB sync (removing it from
  `EXCLUDED_TABLES` in both `transform-schema.js` and
  `sql-to-watermelon-migration.js`), you MUST manually add a `createTable` step
  to `packages/db/src/migrations.ts` and bump the schema version. The
  auto-generation script cannot detect this because no `CREATE TABLE` exists in
  the latest SQL migration.
- **DROP COLUMN:** WatermelonDB has no `dropColumn` migration primitive. Dropped
  columns remain in local SQLite but are ignored. No WatermelonDB migration is
  needed for column drops.

### VIII. Authenticated User Scope & Sync Correctness

Authenticated routing, local data access, and sync MUST be designed so one
account can never observe, route from, calculate from, push, or pull another
account's private data.

- Monyvi MAY support the same authenticated user on multiple devices. Every
  device remains subject to ownership scope and financial-action reconciliation;
  session policy MUST NOT be used as a substitute for data integrity.
- Private route UI MUST NOT be visible or interactable until the auth state is
  resolved and the required startup account/profile state has settled.
- Auth/session/profile gates are UX boundaries, not data security boundaries.
  Every WatermelonDB read/write for user-owned data MUST still be scoped to the
  current authenticated user through approved helper APIs or repositories.
- Profile and onboarding routing decisions MUST be based only on the scoped
  current-user profile. Missing current-user profile data during startup MUST
  show account loading or recovery, never default to onboarding or a foreign
  local profile.
- Logout MAY preserve local offline data. Preserved rows from another account
  MUST NOT influence routing, visible UI state, sync payloads, financial
  calculations, or current-user queries.
- A user-owned child table MAY omit `user_id` only when each row has one
  required immutable parent link and ownership is inherited from that parent.
  Reads, writes, pull, push, soft deletion, and RLS MUST verify the same owned
  parent chain; reparenting across owners MUST be impossible. `asset_metals`
  follows this approved contract through its parent `assets` row and MUST NOT
  duplicate `user_id`.
- Shared/system tables with mixed visibility MUST use explicit accessible-scope
  helpers. Examples include system categories (`user_id IS NULL`) plus
  current-user custom categories.
- Sync pull and push queries MUST be scoped to the authenticated user and to
  explicitly allowed shared/system data only. Supabase RLS is required, but
  client-side sync must still avoid requesting or applying out-of-scope data.
- Pull and push failures MUST fail the sync operation. Remote errors MUST NOT be
  converted into empty successful changes, and failed sync MUST NOT advance
  WatermelonDB sync metadata or mark local dirty changes as synced.
- A rejected optimistic grouped financial action and every linked effect MUST
  reconcile exactly once. It MUST affect no ownership, balance, net worth,
  reporting, or normal user History after reconciliation.
- Startup UX may block only what is required for safe routing (auth plus scoped
  account/profile state). Full cloud sync remains background work; after routing
  is safe, screens should use local data and screen-level skeletons.

## Technology Constraints

| Concern              | Technology                                | Notes                                           |
| -------------------- | ----------------------------------------- | ----------------------------------------------- |
| Mobile Framework     | React Native + Expo (managed workflow)    | File-based routing via Expo Router              |
| Styling              | NativeWind v4 (Tailwind CSS for RN)       | Known shadow bug on interactive components      |
| Local Database       | WatermelonDB (SQLite-based)               | Offline-first, sync-aware                       |
| Cloud Database       | Supabase (PostgreSQL + Auth + RLS)        | Mandatory authenticated sessions; no guest mode |
| Backend API          | Supabase Edge Functions                   | AI parsing and market-rate ingestion            |
| Monorepo             | npm workspaces + Nx                       | Build caching and task orchestration            |
| Language             | TypeScript (strict mode)                  | Across all packages and apps                    |
| Financial Arithmetic | Decimal.js shared primitive               | Precision 50; half-even final rounding          |
| Animations           | React Native Reanimated + Gesture Handler | Required for premium interactions               |
| API Caching          | React Query (TanStack Query)              | Prevents duplicate API calls                    |
| Target Market        | Egyptian users                            | EGP-centered, Arabic and English supported      |
| Supported Currencies | Generated `CurrencyType` enum + rates     | One account = one currency                      |
| Precious Metals      | Gold and Silver in V1                     | Future metals require separate approval         |

New authoritative financial calculations MUST use one shared `@monyvi/logic`
Decimal.js primitive cloned with 50 significant digits and `ROUND_HALF_EVEN`.
Inputs and non-posted outputs MUST cross calculation and persistence boundaries
as canonical base-10 strings; WatermelonDB stores them as text and PostgreSQL as
exact `numeric`. Posted money MUST cross account boundaries as integer minor
units for its currency. Calculations MUST perform no intermediate rounding and
MUST round only at the approved presentation or posting boundary.

Metals is the first adopter. Existing authoritative `number` calculations are
migration debt tracked by issue #241, not precedent. This amendment requires
staged reuse for new or changed financial calculations, not a big-bang migration.

## Development Workflow

### Code Quality Gates

- **Always clarify before coding**. No assumptions about requirements, business
  rules, or user intent. Ask clarifying questions when information is
  incomplete.
- **Debug before fixing**. For bugs and regressions, reproduce or observe the
  exact failing branch, thrown error, invalid state, query result, or data
  mismatch before changing production code.
- **SOLID principles** enforced. Composition over inheritance. Dependency
  injection for decoupling.
- **Single Responsibility**: Each file, function, and component has one clear
  purpose. Extract when responsibilities overlap.
- **Performance awareness**: Memoize with `useMemo` and `useCallback` in
  performance-critical components. Use `FlatList` for lists, never manual
  `.map()` for long arrays. Batch database operations to avoid N+1 patterns.
- **No magic numbers or hardcoded strings**. Extract constants with descriptive
  names. Never scatter unexplained literals through code.
- **No untracked technical debt**. Do not leave shortcuts or known issues
  without a `// TODO:` comment explaining the debt and the intended resolution.
- **Implementation-aligned documentation**. When documentation and code
  disagree, investigate the implementation before changing behavior. Update the
  relevant docs in the same change when business rules, architecture, theme
  conventions, setup commands, or public workflows change.
- **Known debt is not precedent**. If a current file violates this constitution
  (for example direct hook writes, reverse package imports, content spinners, or
  raw console calls), document or reduce the violation when touching that area.
  Do not copy the pattern into new code.
- **Static-analysis guardrails**: Custom ESLint or static-analysis rules MUST
  push developers toward approved scoped helper APIs, command services,
  read-model services, or established repositories. Wire every lint entry point
  consistently, including package scripts, Nx targets, lint-staged, IDE
  settings, CI, and scripts that invoke ESLint directly.

### Naming Conventions

| Target      | Convention                 | Example                 |
| ----------- | -------------------------- | ----------------------- |
| Components  | PascalCase                 | `TransactionCard`       |
| Functions   | camelCase                  | `calculateNetWorth`     |
| Variables   | camelCase + descriptive    | `isLoading`, `hasError` |
| Directories | lowercase-hyphenated       | `transaction-card/`     |
| Interfaces  | PascalCase (no `I` prefix) | `TransactionProps`      |
| Types       | PascalCase                 | `DisplayTransaction`    |
| Constants   | SCREAMING_SNAKE_CASE       | `MAX_RETRY_COUNT`       |
| DB Columns  | snake_case                 | `from_account_id`       |
| DB Tables   | snake_case (plural)        | `recurring_payments`    |

### Pre-Commit Checks

- ESLint with custom rules (no hardcoded hex in JSX, no `isDark` ternary in
  styles, scoped local database access) runs via Husky + lint-staged on every
  commit.
- TypeScript compilation check MUST pass.
- No `console.log` statements in committed code (use structured logging).

### File Organization

- Each component in its own file; keep components small and focused.
- Group by feature: `/components/transactions/`, `/components/dashboard/`.
- Use `index.ts` barrel exports for clean imports.
- Separate interfaces and types into dedicated files when shared across multiple
  components.

## Governance

- This constitution **supersedes** all ad-hoc decisions. When a principle
  conflicts with a one-off instruction, the constitution wins unless formally
  amended.
- **Amendments** require:
  1. Updating this file with the change.
  2. Updating `business-decisions.md` if the change affects business rules.
  3. Updating relevant `.agent/rules/` files if the change affects agent
     behavior.
  4. Bumping the version below according to semver rules.
- **Version bumps**:
  - MAJOR: Principle removed or redefined in a backward-incompatible way.
  - MINOR: New principle or section added, or existing one materially expanded.
  - PATCH: Wording clarifications, typo fixes, non-semantic refinements.
- **Compliance review**: All spec-kit commands (`/speckit.specify`,
  `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`) MUST reference this
  constitution and verify compliance before producing output.

**Version**: 1.6.0 | **Ratified**: 2026-02-14 | **Last Amended**: 2026-08-30
