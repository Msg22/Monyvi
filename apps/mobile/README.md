# Maleem Mobile App

Expo React Native app for Maleem (مليم). Existing `monyvi` package and platform identifiers remain unchanged for compatibility; logo assets await owner approval.

All dependencies are managed from the root workspace. Run commands from the
repository root unless noted otherwise.

## Running The App

For full setup instructions, local Supabase, Google auth, E2E, database, and
runtime scripts, use the root [README](../../README.md). For E2E specifically,
use the local walkthrough in [e2e/maestro/README.md](e2e/maestro/README.md). For
day-to-day local backend development, start from this root flow:

```bash
npm run supabase:start:local
npm run supabase:runtime:setup-local
npm run mobile:local-supabase
```

For Android SMS testing, use a development build rather than Expo Go because the
app relies on native SMS permissions and the generated SMS broadcast receiver.

## Tech Stack

- Expo SDK 55
- React Native 0.83
- Expo Router
- NativeWind
- WatermelonDB
- Supabase Auth, sync tables, and Edge Functions
- Gemini-powered voice and SMS parsing
- Sentry
- i18next with English and Arabic resources

## Feature Areas

- Public pitch and mandatory auth flow
- Authenticated startup gate and onboarding currency step
- Dashboard, accounts, transactions, stats, and metals tabs
- Live rates for gold, silver, and roughly 35 currencies
- Inflation rate tracking and guidance
- Manual transaction and transfer entry
- Voice transaction review flow
- SMS batch scan, live detection, notifications, and review
- Budgets and recurring payments
- Settings for language, theme, currency, SMS detection, and logout

## Important Docs

- [Business decisions](../../docs/business/business-decisions.md)
- [Technical architecture](../../docs/architecture/technical-architecture.md)
- [Design system](../../docs/design/design-system.md)
- [Local E2E walkthrough](e2e/maestro/README.md)
- [Constitution](../../.specify/memory/constitution.md)
