# Monyvi Project

Monyvi is an offline-first personal finance companion for the Egyptian market.
It tracks cash, bank accounts, digital wallets, transactions, budgets, recurring
payments, metal holdings, live gold/silver and currency rates, and inflation
rate guidance, with low-friction entry through voice and SMS.

## Current Status

The active product is the Expo mobile app in `apps/mobile`.

- Expo Router mobile app with mandatory Supabase authentication.
- WatermelonDB local database as the user-facing source of truth.
- Supabase sync, RLS, and Edge Functions.
- Gemini-powered `parse-voice` and `parse-sms` functions.
- metals.dev-backed live rates for gold, silver, and roughly 35 currencies.
- Inflation rate tracking and guidance for contextual money decisions.

## Project Structure

```text
/monyvi
  /apps/mobile - Expo app
  /packages
    /logic - Shared calculations, parsers, and utilities
    /db - WatermelonDB schema, models, migrations, and Supabase types
  /supabase
    /functions - Supabase Edge Functions
    /migrations - Local SQL migrations
  /docs - Business, architecture, design, process, and audit docs
  /specs - Feature specs, plans, contracts, and mockups
```

## Prerequisites

- **Node.js 22 LTS** and npm
- **Docker Desktop** running. Local Supabase runs in Docker containers.
- **Supabase CLI** available through `npx supabase` or installed globally. It is
  required for `db:*`, `supabase:*`, and `fn:deploy:*` scripts.
- **Android Studio + an Android emulator** for Android development.
- A **development build** of the mobile app installed on the emulator/device.
  Expo Go is not enough for SMS/native-permission work.

Verify Supabase CLI with:

```bash
npx supabase --version
```

## Quick Start

```bash
# Install dependencies
npm install

# Start Expo dev server
npm run mobile

# Run mobile tests
npm test -w @monyvi/mobile

# Run lint
npm run lint
```

## Local Development Environment

Use this path when you want the mobile app to run against the local Supabase
database, auth server, Edge Functions, triggers, and cron setup.

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase
npm run supabase:start:local

# 3. Apply pending local migrations, if any
npx supabase migration up --local

# 4. Configure local runtime-only jobs
npm run supabase:runtime:setup-local

# 5. Optional but recommended: copy global market rates from remote to local
npm run supabase:market-rates:import-local

# 6. Start the mobile app against local Supabase
npm run mobile:local-supabase
```

`mobile:local-supabase` reads the local anon key from
`npx supabase status -o env`, uses loopback plus `adb reverse` so local Google
sign-in is available by default on emulators and USB-connected Android devices,
and keeps test-only fixture behavior off. Use `mobile:e2e-fixture` only when you
want the deterministic E2E fixture parser and seeded test flow.

### Verify Local Setup

Check that the Supabase containers are running:

```bash
npx supabase status
```

Check the local API URL and local anon key:

```bash
npx supabase status -o env
```

Check that local market rates have data:

```bash
npx supabase db query --local "select count(*) as count, max(created_at) as newest from public.market_rates;"
```

Check that the local market-rates cron job is scheduled:

```bash
npx supabase db query --local "select jobname, schedule, active from cron.job where jobname = 'fetch-metal-rates';"
```

Check recent local cron runs:

```bash
npx supabase db query --local "select status, return_message, start_time, end_time from cron.job_run_details order by start_time desc limit 5;"
```

### When To Rerun Local Runtime Setup

Run `npm run supabase:runtime:setup-local` after:

- starting from a fresh local Supabase stack
- `npx supabase db reset`
- recreating local containers
- changing local Edge Function or cron setup
- noticing that `fetch-metal-rates` is missing from `cron.job`

You do not need to run it every time you start the mobile app.

## Local E2E Tests

The mobile E2E suite uses Maestro, a local Supabase stack, seeded test data, and
the deterministic SMS parser fixture. The full walkthrough lives in
[apps/mobile/e2e/maestro/README.md](apps/mobile/e2e/maestro/README.md).

Minimum local loop:

```bash
# Terminal 1: start local Supabase
npm run supabase:start:local

# Terminal 2: start the mobile app in E2E fixture mode
npm run mobile:e2e-fixture

# Terminal 3: run all local E2E suites
npm run e2e:local -w @monyvi/mobile
```

Run one CI-style suite:

```bash
E2E_CI_SUITES=transactions npm run e2e:local -w @monyvi/mobile
E2E_CI_SUITES=sms-sync npm run e2e:local -w @monyvi/mobile
E2E_CI_SUITES=live-sms npm run e2e:local -w @monyvi/mobile
```

Run one Maestro flow:

```bash
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/transactions/create-transaction.yaml
```

Run a focused live SMS journey:

```bash
npm run e2e:live-sms:local -w @monyvi/mobile -- 16
```

On PowerShell, set one-off environment variables with `$env:NAME = "value"` in
the current terminal before running the command.

### Local Google Sign-In

Local Supabase can use Google sign-in for normal development. Add your local
Google OAuth credentials to the ignored root `.env` file:

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
```

In Google Cloud Console, add this authorized redirect URI for the local Supabase
callback:

```text
http://127.0.0.1:54321/auth/v1/callback
```

Then restart the local stack and run the app in local mode:

```bash
npm run supabase:start:local
npm run mobile:local-supabase
```

`mobile:local-supabase` points ADB-reachable Android devices at
`http://127.0.0.1:54321` and runs `adb reverse tcp:54321 tcp:54321` so the
browser-based OAuth callback can reach local Supabase.

If Google sign-in fails after opening the browser, verify the reverse exists:

```bash
adb reverse --list
```

You should see:

```text
tcp:54321 tcp:54321
```

For a physical Android device that is not connected to the computer through ADB,
expose local Supabase through an HTTPS tunnel or another device-reachable HTTPS
URL, add this callback to Google Cloud Console, and pass that URL to the local
script:

```text
https://your-local-supabase-url/auth/v1/callback
```

PowerShell example:

```powershell
$env:MONYVI_LOCAL_SUPABASE_DEVICE_URL = "https://your-local-supabase-url"
npm run mobile:local-supabase
```

For non-OAuth debugging only, you can opt out of loopback and use the emulator
host URL with `MONYVI_LOCAL_SUPABASE_LOOPBACK=0`.

### Local Wireless Device Mode

For a wireless physical Android device, let the same local script start local
Supabase, seed the manual QA user, start ngrok, read the ngrok HTTPS URL, and
start Metro with `MONYVI_LOCAL_SUPABASE_DEVICE_URL` set:

```powershell
npm run mobile:local-supabase:wireless-device
```

For normal development with the local SMS parser, use one of these explicit
commands instead of passing parser and inbox flags manually:

| Purpose                                                               | Command                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| Dev app + local Supabase + local parser + deterministic fixture SMS   | `npm run mobile:dev:local-parser:fixture-sms`           |
| Dev app + local Supabase + local parser + the device's real SMS inbox | `npm run mobile:dev:local-parser:device-sms`            |
| E2E Metro for a physical device + local parser                        | `npm run mobile:e2e:local-parser:metro:physical-device` |
| Run the SMS-sync E2E journey on a physical device + local parser      | `npm run e2e:sms-sync:local-parser:physical-device`     |

The `dev` commands keep `EXPO_PUBLIC_MONYVI_TEST_MODE=off`. The `e2e` commands
prepare the test harness and may reset or replace app state, so do not use them
for ordinary manual development.

Both quick dev commands pass Expo's `--lan` option. This makes Metro advertise
the computer's local Wi-Fi address in the development-client QR code so a phone
on the same network can reach it. It does not expose Metro to the public
internet. The wireless local Supabase script separately uses ngrok for the
Supabase endpoint.

By default, the script preserves the password when the manual QA user already
exists. If the local Auth user is missing, it creates the user with the
local-only default password. Sign in with:

```text
Email: manual-qa@monyvi.test
Password: 123456 (unless you previously set a custom password)
```

To create or update the manual QA user with a custom password, pass it once:

```powershell
npm run mobile:local-supabase:wireless-device -- --password "LocalOnlyPassword123!"
```

Passing a password as a CLI argument is convenient, but it can remain in shell
history. To avoid that, set the environment variable instead:

```powershell
$env:MANUAL_QA_PASSWORD = "LocalOnlyPassword123!"
npm run mobile:local-supabase:wireless-device
```

Wireless device mode expects `ngrok` to be installed and authenticated on your
machine. If you use a custom ngrok executable, set `NGROK_COMMAND` before
running it.

Setup output from Supabase, manual QA seeding, and ngrok is hidden by default so
Metro remains readable. To debug setup commands, enable verbose setup output:

```powershell
$env:MONYVI_LOCAL_SUPABASE_VERBOSE_SETUP = "1"
npm run mobile:local-supabase:wireless-device
```

### Local Supabase Runtime Data

Local migrations create the schema, triggers, functions, and cron extension
setup. They do not copy production data. To copy the global market-rate rows
from the linked remote database into local Supabase:

```bash
npm run supabase:market-rates:import-local
```

To align local runtime jobs with the linked environment, run:

```bash
npm run supabase:runtime:setup-local
```

This schedules the local `fetch-metal-rates` cron job against the local Edge
Function endpoint. Schema-level functions and triggers are kept in migrations.

For local Edge Functions that call external services, add these ignored root
`.env` values before restarting Supabase:

```bash
METALS_DEV_API_KEY=your-metals-dev-key
GEMINI_API_KEY=your-gemini-key
```

After changing local Edge Function secrets, restart the stack:

```bash
npx supabase stop
npm run supabase:start:local
npm run supabase:runtime:setup-local
```

### Common Local Issues

- If Metro starts but npm exits with an error, make sure no old Metro process is
  occupying port `8081`.
- If the app opens Expo Go instead of Monyvi, install or launch the development
  build, not Expo Go.
- If local Google sign-in cannot reach the callback on an emulator or
  USB-connected Android device, run `adb reverse tcp:54321 tcp:54321`.
- If local Google sign-in cannot reach the callback on a wireless physical
  device, set `MONYVI_LOCAL_SUPABASE_DEVICE_URL` to an HTTPS URL that the phone
  can reach and add its `/auth/v1/callback` URL to Google Cloud Console.
- If `market_rates` is empty, run `npm run supabase:market-rates:import-local`.
- If Edge Functions that call external services fail, check that the required
  ignored root `.env` secrets are set and restart local Supabase.

## Tech Stack

- **Mobile:** React Native + Expo
- **Navigation:** Expo Router
- **Local database:** WatermelonDB
- **Cloud:** Supabase Auth, PostgreSQL, RLS, Edge Functions
- **Styling:** NativeWind
- **Voice:** expo-speech-recognition + Gemini Edge Function parsing
- **SMS:** Android SMS reader/listener + Gemini Edge Function parsing
- **Observability:** Sentry
- **Monorepo:** npm workspaces + Nx

## Key Documentation

- [Business decisions](docs/business/business-decisions.md)
- [Technical architecture](docs/architecture/technical-architecture.md)
- [Design system](docs/design/design-system.md)
- [Local E2E walkthrough](apps/mobile/e2e/maestro/README.md)
- [Constitution](.specify/memory/constitution.md)

## Shared Packages

### `@monyvi/logic`

- Currency and amount helpers
- Metal and net-worth calculations
- Budget utilities
- Analytics helpers
- SMS parser/filter/hash utilities
- AI parser mapping utilities

### `@monyvi/db`

- WatermelonDB schema
- WatermelonDB models
- Local migrations
- Generated Supabase types

## License

Proprietary - All rights reserved
