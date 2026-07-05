# monyvi - Project Instructions

## Project Context

monyvi is a personal financial app — a frictionless financial companion that
tracks cash, digital payments, and savings (Gold/USD) for the modern Egyptian
user. It solves the "boring manual entry" problem using voice and automation.

The developer (Mohamed) is a Senior Front-end engineer with 8 years of Angular
expertise, new to React/React Native/Expo. When explaining concepts, compare
with Angular equivalents in chat (never in code comments).

## Architecture & Design Principles

- Act as a world-class software architect. Engineer solutions, don't just write
  code.
- The **constitution** (`.specify/memory/constitution.md`) is the highest
  authority. It supersedes all ad-hoc decisions.
- When working GitHub sprint issues, follow `.agent/workflows/sprint-issue.md`.
  Its approval gates for business logic, user-flow, and UI/design changes are
  mandatory.
- **Offline-first**: WatermelonDB is the single source of truth for all
  user-facing data. Every read/write MUST happen locally first. Cloud sync to
  Supabase is non-blocking background work. The app MUST work with zero network
  connectivity.
- All syncable tables MUST include `created_at`, `updated_at`, `deleted`, and
  `user_id` columns. **Exception**: server-generated read-only pull-only tables
  (e.g., `market_rates`, `daily_snapshot_*`) MAY omit `updated_at` and
  `deleted`.
- Follow SOLID principles strictly. Flag violations immediately.
- Prioritize composition over inheritance, use dependency injection.
- Use appropriate GoF design patterns (Strategy, Factory, Observer, Repository,
  Adapter).
- Encapsulate data access behind approved scoped helper APIs, read-model
  services, command services, or repositories where that pattern already exists.
- Use consistent API response envelope: success indicator, data payload, error
  message, pagination metadata.
- No "quick and dirty" fixes unless explicitly asked. No magic numbers or
  hardcoded strings.
- Mark tech debt with `// TODO:` comments.
- Reference `docs/business/business-decisions.md` before implementing any
  business logic. No assumptions — ask if a rule is ambiguous or missing.

## Architecture Hard Rules

- DB models own persisted fields, relationships, and DB-local convenience only.
  They MUST NOT own presentation formatting, parsed helper state, app workflows,
  or shared calculations.
- `packages/logic` owns pure shared calculations, parsers, and formatters over
  plain interfaces. Runtime imports from `@monyvi/db` are forbidden; type-only
  imports are allowed only when unavoidable.
- `apps/mobile/services` owns WatermelonDB writes, scoped read queries,
  read-model aggregation, sync, platform adapters, and workflow command
  services.
- Hooks are React facades: subscriptions, loading/error/cancellation state, and
  service invocation. Hooks MUST NOT own DB writes, raw multi-table query
  construction, or business calculations.
- Route/container components may invoke command services only for simple user
  actions or explicit lifecycle orchestration. If loading/error/cancellation
  state, subscriptions, or reuse are needed, wrap the service call in a hook.
- Presentational components MUST NOT import services, `database`, query helpers,
  or business logic. They render shaped props and callbacks only.
- Known architecture debt and ESLint allowlists are exceptions to remove, not
  examples to copy.

| Need                                                           | Put It In                                     |
| -------------------------------------------------------------- | --------------------------------------------- |
| Shared pure formatter/calculation/parser                       | `packages/logic`                              |
| WatermelonDB write or platform workflow command                | `apps/mobile/services/*-service.ts`           |
| Scoped query, join, grouping, or screen read model             | `apps/mobile/services/*read-model-service.ts` |
| React subscription, loading/error state, cancellation, refetch | `apps/mobile/hooks`                           |
| Navigation, UI feedback, route composition                     | route/container component or hook             |
| Rendering already-shaped props                                 | presentational component                      |

## Monorepo Package Boundaries

Dependency direction: `apps/ → packages/logic → packages/db`. **Never reverse.**

- **`packages/db` (`@monyvi/db`)**: WatermelonDB models, schema, types, sync
  config. MUST NOT import from `apps/` or other packages. Models MUST NOT own
  presentation formatting or parsed helper state.
- **`packages/logic` (`@monyvi/logic`)**: Shared calculations and parsers (net
  worth, voice parser, currency utils). May import from `@monyvi/db` for types
  only. MUST NOT import from `apps/`.
- **`apps/mobile`**: React Native Expo app. May import from any package.

## Service-Layer Separation

- **`packages/logic/`**: Shared calculations used by both mobile and API. MUST
  NOT import from `apps/`.
- **`apps/mobile/services/` command services**: Mobile-specific service
  functions that interact with WatermelonDB, platform APIs, sync, auth, or
  external clients (e.g., `transaction-service.ts`). Plain async functions, NOT
  hooks.
- **`apps/mobile/services/` read-model services**: Scoped local queries, joins,
  grouping, and display/read aggregation that should be testable outside React.
- **Orchestrator/handler services** (e.g., live SMS handlers, notification
  action handlers) coordinate workflow only. They SHOULD NOT own raw
  WatermelonDB query details; delegate persistence and lookup logic to focused
  domain services or repositories so the handler remains easy to reason about
  and mock.
- **Hooks (`apps/mobile/hooks/`)**: Lifecycle and subscriptions ONLY — observing
  data, managing local UI state, triggering re-renders, and invoking services.
  MUST NOT contain database write logic or business calculations.
- Design hooks around UI data/lifecycle needs, not one hook per database
  function. Prefer cohesive hooks such as `useBudgets()` for list state,
  `useBudget(budgetId)` for detail state, and optional action hooks only when
  reusable UI command state is needed. Avoid god hooks that bundle unrelated
  queries, mutations, validation, calculations, and sync orchestration.
- **Route/container components**: May connect hooks/facades to UI and may call
  command services for simple user actions or explicit lifecycle orchestration.
  They MUST NOT construct WatermelonDB queries, subscribe directly to models, or
  shape business read models.
- **Presentational components**: Zero business logic. Receive already-shaped
  data via props and render UI. `Alert.alert()` and UI concerns stay in calling
  component/hook, never in services.

## Authenticated Runtime & User-Scoped Data

- Private route UI MUST NOT be visible or interactable until the auth state is
  resolved and the required startup account/profile state has settled. Use
  route/shell-level gates for this UX guarantee; do not rely on per-card loading
  guards as the primary way to protect private screens.
- Auth/session/profile gates are UX boundaries, not data security boundaries.
  Every WatermelonDB read/write for user-owned data MUST still be scoped to the
  current authenticated user through approved helper APIs or repositories (for
  example `getCurrentUserDataScope`, `queryOwned`, `findOwnedById`,
  `observeOwnedById`, or repository methods that wrap them).
- Components MUST NOT import the raw `database` object or construct WatermelonDB
  queries/subscriptions directly. Components receive data, loading, and error
  state from hooks or props. Hooks may observe data and derive UI state, while
  services/repositories own persistence and mutation logic.
- Logout MAY preserve local offline data. Therefore local rows from another
  account must never influence routing, visible UI state, sync payloads,
  financial calculations, or current-user queries.
- Profile and onboarding routing decisions MUST be based only on the scoped
  current-user profile. If the scoped profile is missing while sync/startup is
  still in progress, show the account loading or recovery state; never default
  to onboarding or use a foreign local profile row.
- Private providers that subscribe to user data MUST either mount only inside
  the authenticated private runtime or explicitly no-op and clear state while
  auth is resolving or signed out. Prefer one private runtime boundary over
  scattering auth guards across leaf components.
- User-owned child tables that do not store `user_id` directly MUST be scoped
  through an owned parent record for reads, writes, push, and delete sync. A
  soft-deleted owned parent still counts as owned when pushing child deletions.
- Shared/system tables with mixed visibility, such as system categories
  (`user_id IS NULL`) plus current-user custom categories, MUST use explicit
  accessible-scope helpers. Do not use unqualified full-table reads in
  authenticated UI.

## Sync Correctness

- WatermelonDB remains the user-facing source of truth, but sync correctness is
  part of data safety. Pull and push failures MUST fail the sync operation; do
  not convert remote errors into empty successful changes.
- Failed pull operations MUST NOT advance WatermelonDB sync metadata as if the
  pull succeeded. Failed push operations MUST NOT allow local dirty changes to
  be marked synced.
- Sync pull/push queries MUST be scoped to the authenticated user and to
  explicitly allowed shared/system data only. RLS is required on Supabase, but
  client-side sync code must still avoid requesting or applying data outside the
  current user's scope.
- Startup UX should block only what is required to make a safe routing decision
  (auth plus scoped profile/account state). After routing is safe, prefer
  screen-level skeletons over a global blocking sync overlay.

## Live SMS Detection & Notifications

- Live SMS detection has three delivery modes: foreground JS listener,
  background native event, and killed-app HeadlessJS. Validate fixes across the
  path being changed; do not assume a foreground-only fix covers killed-app
  behavior.
- Every SMS-created transaction or transfer MUST persist `smsFingerprint`. This
  is the deduplication invariant across batch scan, foreground live detection,
  background live detection, and notification action handling.
- Before saving a live-detected SMS transaction/transfer, check for an existing
  non-deleted `sms_fingerprint` in both `transactions` and `transfers`.
- Confirm/Discard notification actions MUST dismiss the delivered notification
  and be idempotent. A repeated Confirm action must not create a second
  transaction or apply a second balance/net-worth update.
- Discard notification actions must not write financial records. They should
  only clear/dismiss the notification and leave the SMS uncommitted.
- Prefer stable notification identifiers derived from `smsFingerprint` for
  SMS-transaction notifications so repeated scheduling/action delivery can be
  correlated safely.
- On Android, schedule SMS notifications with the Expo notification channel via
  the trigger/channel API, not legacy private fields.

## TypeScript & React Native

- Write concise, technical TypeScript with strict mode. Prefer interfaces over
  types. Avoid enums — use maps.
- Use functional components with hooks. No class components.
- Use `function Component(props: Props)` for better type inference. Use
  `React.FC<Props>` only when you need `children`.
- Narrow `unknown` in catch blocks (`if (error instanceof Error)`). Never use
  `any`.
- All functions MUST have explicit return type annotations.
- Use `import type` for type-only imports to reduce transpilation overhead.
- Never use `console.log` in production code — use a structured logger.
- Use descriptive names with auxiliary verbs: `isLoading`, `hasError`,
  `isFetchingData`.
- Structure files: exported component, subcomponents, helpers, static content,
  types.
- Use lowercase-hyphenated directories (`components/auth-wizard`). Favor named
  exports.
- Avoid logic in JSX — move business logic to `packages/logic` (if shared) or
  the appropriate mobile folder.
- Use `FlatList` (not manual `.map()`) for long lists with `keyExtractor`. Use
  `useMemo`/`useCallback` for perf-critical components.
- Clean up side effects in `useEffect` return function.
- Long-running animations, subscriptions, timers, and retry loops MUST be
  cancelled or unsubscribed during cleanup. This includes Reanimated infinite
  animations via `cancelAnimation` where applicable.
- Use `react-native-safe-area-context`, `KeyboardAvoidingView`, and
  `SafeAreaProvider` for safe areas. No hardcoded safe area padding.
  `SafeAreaProvider` at the root MUST pass
  `initialMetrics={initialWindowMetrics}` so the very first render has the
  correct top inset (otherwise `expo-router` / `react-native-screens` shadow the
  context and `useSafeAreaInsets()` returns `top: 0` on render 1, causing
  cold-start scroll-jump). Apply the inset exactly once per screen — do not nest
  a `SafeAreaView` inside a subtree that already sits under a parent that
  applied `paddingTop`.
- Any bottom-anchored mobile UI, including fixed CTAs, bottom sheets, prompts,
  and modals, MUST account for `useSafeAreaInsets().bottom` or an equivalent
  `SafeAreaView` bottom edge. Do not rely on fixed `pb-*`, `bottom`, or spacer
  values alone. When touching these surfaces, add or update a focused test that
  proves the bottom inset is included so Android gesture and 3-button navigation
  bars cannot overlap the action area.
- Use `react-navigation` and `expo-router` for file-based routing.
- Use Zod for runtime validation. Derive types with `z.infer<typeof schema>` —
  don't duplicate type definitions.
- Use Expo managed workflow, EAS Build, and `expo-updates` for OTA updates.
- **i18n**: In functional components, use the `useTranslation` hook
  (`const { t } = useTranslation("namespace")`). In class components or
  non-component files, use the named import `import { t } from "i18next"` —
  never `i18next.t()`.
- Translate only user-visible strings. Internal-only checks, sentinel values,
  error-code comparisons, and control-flow decisions MUST stay language-neutral
  (for example booleans, enums, or stable English codes), then translate only
  the message that is actually rendered to the user.

## User-Facing Copy & UX Writing

- All messages shown to users in the app MUST be simple, friendly, and easy to
  understand. Avoid technical terms, platform jargon, implementation details,
  and blame-focused wording. Assume the user may not know how permissions, sync,
  background services, or device settings work. Explain what happened in plain
  language, why it matters only when helpful, and what the user can do next.
  Prefer short, actionable copy over long explanations.
- Permission flows MUST use Monyvi custom explanatory/recovery UI before
  triggering any native permission request. Do not use Android native rationale
  dialogs or `Alert.alert()` as the app-level explanation. The OS permission
  sheet is allowed only after the user taps the Monyvi custom modal action.

# Strict Null Semantics for Entity IDs

When managing entity IDs (such as `accountId`, `categoryId`, etc.) across the
UI, state hooks, and validation layers in Monyvi, you must adhere strictly to
the true domain model.

## Core Directives

1. **Never use `""` (empty string) as a fallback for missing IDs.**
   - An empty string is not a valid identifier.
   - If an ID is functionally missing, unselected, or pending, its type MUST be
     `string | null` in the state and the validation payload.
2. **Embrace `null` at the validation boundary.**
   - Do not alter or hack validation signatures to accept generic strings just
     so you can pass `id ?? ""` from the client to trigger a `.min(1)` failure.
   - If an ID can technically be unselected in a form, write your validation
     logic/schema to accept `string | null` natively.
3. **Respect strict domain constraints.**
   - If an upstream domain entity (like a voice parsed transaction) guarantees
     that a field (e.g. `categoryId`) is _always_ present, do NOT type your
     React state as `string | null`.
   - Trust the domain constraint. Initialize state strictly (e.g.,
     `useState<string>(transaction.categoryId)`) instead of unnecessarily
     widening types.

# Skeleton Loading States

- All loading states in the app MUST use the `<Skeleton>` component from
  `components/ui/Skeleton.tsx`. **Never use `ActivityIndicator`** for content
  loading.

## Styling Rules

- For GitHub sprint issues that affect visible UI or design, follow the visual
  mockup approval gate in `.agent/workflows/sprint-issue.md` before coding.
- **NativeWind classes only**: Use `className` for ALL styling. Do NOT use
  `StyleSheet.create()` or inline `style` unless there is no NativeWind
  equivalent (e.g., dynamic computed values like `` width: `${percent}%` ``).
- **Colors via Tailwind config**: All palette colors are registered in
  `tailwind.config.js`. Use NativeWind classes (`bg-slate-800`,
  `text-nileGreen-500`, `border-slate-300`) — never use inline
  `style={{ color: palette.xxx }}` when a class exists. Use `palette` imports
  only for component props that don't accept `className` (e.g.,
  `<Icon color={palette.nileGreen[500]} />`).
- **Opacity modifier**: Use the `/opacity` syntax for semi-transparent colors
  (e.g., `bg-nileGreen-500/20`, `border-slate-300/25`). This works on `View` and
  `Text`. See the NativeWind v4 crash exception below for
  `TouchableOpacity`/`Pressable`.
- **Dark mode**: Use `dark:` variant. NEVER use `isDark` ternary conditionals if
  a Tailwind class works. **Exception**: `isDark` MAY be used for component
  props that accept color values (e.g.,
  `<Switch trackColor={{ false: isDark ? ... : ... }} />`) since `className`
  doesn't work on those props.
- **Theme text colors**: Use `text-text-primary`, `text-text-secondary`,
  `text-text-muted` classes (defined in `tailwind.config.js`) instead of
  `style={{ color: theme.text.primary }}`.
- `palette.slate[25]` is the standard light-mode white for backgrounds/text.
- **NativeWind v4 crash**: `shadow-*`, `opacity-*`, and `bg-color/opacity`
  classes on `TouchableOpacity`/`Pressable` cause a crash. Use inline `style`
  for these specific cases on these specific components only.
- **Reusable class compounds**: When the same combination of classes repeats
  across multiple components, extract it to `global.css` using `@apply` (e.g.,
  `.subtitle-text`, `.body-small`, `.caption-text`).
- Use unified `PageHeader` component for all screen headers (manages drawer
  state internally).
- Use `TextField` for text inputs, `Dropdown` for selections, `OptionalSection`
  for expandable optional fields.

## Database Migrations

All schema changes MUST go through local SQL migration files in
`supabase/migrations/`, never through Supabase MCP or dashboard directly.

- Workflow: Write SQL migration → `npm run db:migrate` → commit both migration
  and generated schema.
- Naming: follow the existing sequential numeric prefix used by this repo:
  `supabase/migrations/023_descriptive_name.sql`. If the Supabase CLI creates a
  timestamp-prefixed file, rename it to the next available numeric prefix before
  running or committing the migration.
- When bringing existing Supabase tables into WatermelonDB: manually add
  `createTable` to `packages/db/src/migrations.ts` and bump schema version
  (auto-gen can't detect this).
- WatermelonDB has no `dropColumn` — removed columns stay in local SQLite but
  are ignored.

## Coding Style

- Immutability: ALWAYS create new objects, NEVER mutate existing ones.
- Many small files > few large files. 200-400 lines typical, 800 max. Functions
  < 50 lines.
- Handle errors explicitly at every level. Never silently swallow errors.
- Validate at system boundaries (user input, external APIs). Fail fast with
  clear messages.

## Git Workflow

Commit format: `<type>: <description>` — Types: feat, fix, refactor, docs, test,
chore, perf, ci.

- For GitHub sprint issue branches, follow the branch base selection rules in
  `.agent/workflows/sprint-issue.md`.

## Pull Request Review Comments

- During PR code review, first look for the matching feature folder under
  `specs/`. If no matching spec folder exists, fetch and read the GitHub issue
  linked to the PR before reviewing code. Treat that issue as the feature
  requirements source of truth and the business-logic source of truth for the
  review, subject to the constitution and `docs/business/business-decisions.md`.
- If both a spec folder and linked issue exist, review against both. Treat them
  together as the feature source of truth, verify the implementation satisfies
  everything in both artifacts, and call out any gaps or contradictions between
  the spec and issue as review findings before approving.
- Before addressing a PR review comment, verify it against the current branch
  and current code. Treat outdated, already-resolved, duplicated, or no-longer
  applicable comments as non-actionable, and state why instead of changing code.
- Classify each still-valid comment before fixing it. Technical correctness,
  type-safety, test stability, CI reliability, and code-style comments may be
  fixed directly when the change is minimal and clearly within the PR scope.
- Do not implement review comments that require a product/business decision
  without first returning to Mohamed for direction. This includes changes to how
  a feature should behave, what the user experience should be, how financial
  data should be interpreted, or which user journey is preferred.
- Do not implement review comments that request database schema changes,
  migrations, data backfills, sync-contract changes, or mutations to existing
  business data without first returning to Mohamed for approval.
- If a comment mixes a valid technical issue with a product or schema decision,
  fix only the clearly technical part if it can be separated safely; otherwise
  stop and ask for the decision explicitly.
- If a still-valid review finding is deferred, create a GitHub issue for it
  before final handoff. The issue must describe the deferred work, why it was
  deferred, the source PR/review context, and clear acceptance criteria. Apply
  suitable existing labels such as `tech-debt`, `refactor`, `code-quality`,
  `testing`, `performance`, `database`, or the relevant `area:*` label so the
  work can be found and prioritized later.
- Keep PR-review fixes surgical. Do not bundle unrelated cleanup, do not use
  review comments as permission to redesign the feature, and validate every fix
  with the smallest reliable check that would catch the reviewed issue.

## Security

- No hardcoded secrets. Use environment variables or secret manager.
- Validate all user inputs. Parameterized queries for SQL. Sanitize HTML for
  XSS.
- CSRF protection, rate limiting on endpoints. Error messages don't leak
  sensitive data.

## Testing

- TDD is mandatory and strict: before writing production code for a task, write
  the unit tests and E2E tests that describe the expected behavior. Run them and
  confirm they fail for the right reason, then implement the minimum production
  logic needed to make them pass. Refactor only after the tests are green.
- Unit tests (Jest + React Native Testing Library), integration tests, and E2E
  tests (Detox/Maestro) are the safety net for every feature. Cover every
  possible flow, journey, scenario, and edge case that belongs to the task,
  including unhappy paths, denied/blocked permissions, cancellations, retries,
  duplicate/idempotency behavior, app restart/resume, revoked permissions, and
  any native/background/headless path touched by the change.
- E2E tests must validate the complete user-visible path of a feature. They
  should answer: "Does the feature actually work as expected in every realistic
  way the user can use it?" E2E tests should not depend on implementation
  details, private function calls, or internal state unless there is no honest
  user-level signal available.
- Pull requests MUST include a complete manual test plan for the changed
  behavior before final handoff. Treat the manual plan as the source list of
  scenarios to automate.
- Convert the manual test plan into automated coverage: unit/integration tests
  for every deterministic branch and Maestro E2E flows for every complete user
  journey that can be reliably driven on an emulator. Do not claim E2E coverage
  for behavior the runner cannot honestly control; document those cases as
  manual-only or blocked by a missing test harness, with the reason.
- For high-risk mobile flows, use the available testing specialists and skills
  during implementation: `tdd-guide` or `source-command-tdd` for unit coverage,
  `qa-auditor` for test-plan/coverage audits, `source-command-e2e`,
  `source-command-e2e-runner`, or `source-command-maestro` for Maestro flows,
  and `test-android-apps:android-emulator-qa` for emulator validation. If none
  of the available agents or skills fits a recurring testing need, propose a new
  specialized agent or skill before proceeding.
- PR descriptions should include a coverage matrix that maps each manual test
  scenario to its unit/integration test, E2E test, or manual-only validation.
  Missing automation must be explicit, not implied.
- For hook tests, use `@testing-library/react-native`'s `renderHook`. Do not add
  new `react-test-renderer` shims; replace deprecated `react-test-renderer`
  usage when touching affected tests.
- Fix implementation, not tests (unless tests are wrong).

## Tooling Guardrails

- **Windows shell/runtime issues**: If a system runtime or shell behavior is
  broken, fix or route around it durably instead of repeating the same
  workaround. Prefer the bundled Codex runtime paths from
  `load_workspace_dependencies` (especially Python) when the system `python`
  launcher is broken or points to a missing install. For Python scripts that
  call GitHub/plugin tooling on Windows, set `$env:PYTHONUTF8='1'` or otherwise
  force UTF-8 subprocess decoding so GitHub responses with Unicode do not fail
  under the Windows codepage. In PowerShell, use PowerShell-native command
  sequencing and syntax; do not rely on bash/cmd-only separators such as `&&`.
- **Secondary worktree dependencies**: Never run `npm install`, `npm ci`, or
  package-manager install commands inside a secondary git worktree. Secondary
  worktrees must reuse the main checkout dependency tree through a Windows
  directory junction to the main workspace `node_modules`.
- To link a secondary worktree, run
  `powershell -ExecutionPolicy Bypass -File scripts/link-worktree-node-modules.ps1 -RootWorkspace "<main checkout path>"`
  from the secondary worktree. If a partial `node_modules` exists there from an
  accidental install, rerun the script with `-ReplaceExisting` only after
  confirming the resolved path is inside that secondary worktree.
- If the junction cannot be created or tooling does not work through the
  junction, switch the task to the main checkout instead of downloading another
  dependency tree.
- When adding architectural ESLint rules or custom static-analysis guardrails,
  wire every lint entry point consistently: package scripts, Nx targets,
  lint-staged, VSCode/IDE settings, CI, and any scripts that invoke ESLint
  directly.
- Custom rules should push developers toward approved scoped helper APIs and
  repositories, not merely ban one raw query pattern while leaving equivalent
  unsafe access paths open.

## Android Emulator & Metro Debugging

- When testing Android behavior, first look for available Android debugging
  MCPs/skills (e.g., Droidrun or Test Android Apps). If unavailable or blocked,
  use `adb` directly.
- For Pixel emulator SMS testing, use:
  `adb -s emulator-5554 emu sms send <sender> "<message>"`.
- Before judging app behavior in an Expo dev-client emulator, confirm Metro is
  reachable: run `adb -s emulator-5554 reverse tcp:8081 tcp:8081`, verify the
  app focus with `adb -s emulator-5554 shell dumpsys window`, and inspect Metro
  output/logcat for bundle or React errors.
- To open the local Expo dev-client after reversing Metro, use the known-good
  loopback URL:
  `adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d "monyvi://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" com.monyvi.app`.
- If the Expo dev client shows a blank native root or Development Launcher after
  emulator restart, treat it as a dev-client/Metro connection issue first. Check
  `adb reverse`, launch URL, Metro logs, and logcat before changing product
  code.
- For notification QA, inspect the notification shade with
  `adb shell cmd statusbar expand-notifications` and UIAutomator dumps, then use
  logcat/Metro logs to confirm action callbacks and dismissal behavior.

## Auto-Detect Rules

During conversations, if you notice instructions/guidelines specific to this
project not covered in AGENTS.md, suggest adding them. Example: if told to move
mapping logic from component to model, suggest a rule update with location.

## Prohibited Patterns

- Static colors (`#FFFFFF`, `rgb(0,0,0)`)
- `isDark` ternary logic for background/text colors
- `StyleSheet.create()` or inline `style` when a NativeWind class exists
- `style={{ color: palette.xxx }}` on `Text`/`View` when a Tailwind class exists
  (e.g., use `text-nileGreen-500` not
  `style={{ color: palette.nileGreen[500] }}`)
- Custom header implementations (use `PageHeader`)
- `withObservables` HOC for simple data fetching (use hooks like `useAccounts`)
- NativeWind `shadow-*`, `opacity-*`, `bg-color/opacity` on
  `TouchableOpacity`/`Pressable`
- `i18next.t()` — use `{ t } from "i18next"` or `useTranslation` hook instead

# monyvi Guidelines

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 1.1. Debug Before Fixing

**Do not patch from a hypothesis. Prove the root cause first.**

For bug fixes and regressions:

- Reproduce or observe the failure using the best available signal: tests, logs,
  debugger output, device/emulator behavior, database inspection, or targeted
  instrumentation.
- Separate hypotheses from confirmed facts. A hypothesis can guide debugging,
  but it is not enough justification for a code change.
- Identify the exact failing branch, thrown error, invalid state, query result,
  or data mismatch before changing production code.
- If the available environment cannot prove the root cause, add temporary
  diagnostic logging or ask the user for specific logs/screenshots instead of
  guessing.
- Review the fix against nearby logic and existing architecture before applying
  it. Confirm it does not weaken offline-first behavior, privacy scoping,
  routing correctness, sync semantics, or other existing guarantees.
- Verify with focused tests or manual checks that would have caught the original
  failure, plus any relevant regression checks for adjacent behavior.

### No Assumption-Based Fixes

- Do not write production code from an unverified assumption. A suspected cause
  must be confirmed by code reading, a failing test, logs, debugger output,
  device behavior, or another concrete signal before implementation.
- Do not hide uncertainty inside state flags, timing delays, retries, broad
  guards, or extra abstraction. If the code depends on a condition, prove that
  condition exists and name it in the implementation or test.
- Do not ship workaround logic that only masks a symptom. The fix must address
  the failing branch, stale state transition, race, invalid data, or missing
  lifecycle event that actually causes the bug.
- Before editing, ask whether the proposed code is a real model of the product
  behavior or just a patch around the current failure. If it is a workaround,
  stop and redesign the fix or ask for direction.
- Regression tests must describe the user-visible failure or invariant being
  protected, not incidental implementation details.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.
