# Maestro E2E Tests

End-to-end tests for the Monyvi mobile app using
[Maestro](https://maestro.mobile.dev/).

## What Runs Locally

The local E2E environment uses:

- local Supabase for auth, database, and Edge Function URLs
- an Android emulator with a Monyvi development build installed
- Metro running in E2E fixture mode
- deterministic seeded data and fixture SMS parsing
- Maestro for driving the app UI

Run commands from the repository root. Commands that call mobile package scripts
directly use `-w @monyvi/mobile`.

## Prerequisites

- Docker Desktop running
- Android emulator running and visible to `adb devices`
- a Monyvi development build installed on the emulator; Expo Go is not enough
- Maestro installed, or `MAESTRO_BIN` set to the Maestro executable
- root dependencies installed with `npm install`

The local runner derives safe local Supabase keys automatically from
`npx supabase status`, so normal local runs should not require hand-written
Supabase keys.

## Start The Local E2E Environment

```powershell
# 1. Start local Supabase from the repo root
npm run supabase:start:local

# 2. Start the emulator if it is not already running
adb devices

# 3. Start Metro in E2E fixture mode (separate terminal)
npm run mobile:e2e-fixture
```

`mobile:e2e-fixture` points Android at local Supabase and enables deterministic
fixture parsing for SMS/AI flows. Keep that terminal open while tests run.

## Run All E2E Suites

```powershell
npm run e2e:local -w @monyvi/mobile
```

This runs the same local CI-style path as `scripts/run-ci-e2e.js`:

1. seed local E2E data
2. bootstrap the authenticated test user in the app
3. run transaction flows
4. run SMS sync flows
5. run live SMS journeys `01` through `14` plus `16`

Journey `15` is excluded from the default local/dev-client run because it covers
killed-app HeadlessJS and needs a release or preview APK with embedded JS.

## Run A Specific Suite

Use `E2E_CI_SUITES` to select one or more CI-style suites.

```powershell
# Bash/Git Bash
E2E_CI_SUITES=transactions npm run e2e:local -w @monyvi/mobile
E2E_CI_SUITES=sms-sync npm run e2e:local -w @monyvi/mobile
E2E_CI_SUITES=live-sms npm run e2e:local -w @monyvi/mobile
E2E_CI_SUITES=transactions,sms-sync npm run e2e:local -w @monyvi/mobile
```

PowerShell:

```powershell
$env:E2E_CI_SUITES = "live-sms"
npm run e2e:local -w @monyvi/mobile
Remove-Item Env:E2E_CI_SUITES
```

Valid suite names:

| Suite          | What it runs                                                        |
| -------------- | ------------------------------------------------------------------- |
| `transactions` | Create, edit, quick-edit, swap account, change type, search, delete |
| `sms-sync`     | SMS sync permission flow plus fixture batch scan/rescan journeys    |
| `live-sms`     | Live SMS enable/permission/background/action journeys               |

Use `E2E_CI_SUITES=skip` to verify the runner wiring without launching any
Maestro flows.

## Run One Maestro Flow

Use this when you are debugging a single YAML flow.

```powershell
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/transactions/create-transaction.yaml
```

The `e2e:flow:local` wrapper runs Android preflight before Maestro starts: it
checks Metro, reverses port `8081`, opens or recovers the Monyvi dev client, and
waits until the app reaches a recognized loaded screen. Maestro YAML flows
should not launch the app themselves; they should take over only after preflight
has opened a ready app screen.

## Run Focused SMS Suites

SMS sync:

```powershell
npm run e2e:sms-sync:local -w @monyvi/mobile
```

SMS sync with the local parser on a connected Android device:

```powershell
# Terminal 1: starts Metro, sets local-parser E2E mode, and reverses 8081/54321
npm run mobile:e2e-local-parser:device

# Terminal 2: runs the SMS sync local-parser journeys against that device
npm run e2e:sms-sync:local-parser:device

# Optional: pass one or more journey numbers to run a focused subset
npm run e2e:sms-sync:local-parser:device -- 01
npm run e2e:sms-sync:local-parser:device -- 01 02
```

When no journey number is provided, the SMS sync runner executes the full
local-parser SMS sync journey set. Journey numbers are simple pass-through
arguments to `scripts/run-sms-sync-journeys.js`.

In local-parser mode the fake SMS inbox is populated from a saveable subset of
the synthetic dev/test corpus, limited to providers represented by the E2E seed
accounts. The full 100+ corpus remains covered by parser/unit tests. The older
`fixture` parser mode remains the narrow exact fixture harness for legacy
fixture-parser checks.

The device wrapper automatically:

- uses `ANDROID_SERIAL`, `DEVICE`, or `MAESTRO_DEVICE_ID` when one is set
- otherwise uses the only online device from `adb devices`
- fails with a clear message when no device or multiple devices are connected
- runs `adb reverse tcp:8081 tcp:8081` for Metro
- runs `adb reverse tcp:54321 tcp:54321` for local Supabase
- sets `EXPO_PUBLIC_AI_SMS_PARSER_MODE=local`
- sets `E2E_AUTH_DEEPLINK_BOOTSTRAP=1` for the SMS sync runner

If more than one Android device is connected, choose one explicitly:

```powershell
$env:ANDROID_SERIAL = "RZCWA1KBNVL"
npm run mobile:e2e-local-parser:device
```

Live SMS, all default dev-client journeys:

```powershell
npm run e2e:live-sms:local -w @monyvi/mobile
```

Live SMS, specific journeys:

```powershell
npm run e2e:live-sms:local -w @monyvi/mobile -- 16
npm run e2e:live-sms:local -w @monyvi/mobile -- 09 10
```

Release-only killed-app journey:

```powershell
npm run e2e:live-sms:release -w @monyvi/mobile
```

Use the release runner only after installing a release or preview APK. Journey
`15` validates killed-app HeadlessJS and should not be trusted from a dev-client
Metro-only run.

## Auth Bootstrap Only

To verify the local seeded auth path only:

```powershell
npm run e2e:auth:local -w @monyvi/mobile
```

That command clears app state, seeds the local E2E user, opens the dev client,
checks the signed-out auth controls and keyboard reachability, signs in, and
handles first-run prompts.

## Target A Specific Emulator Or Device

```powershell
$env:DEVICE = "emulator-5554"
npm run e2e:device -w @monyvi/mobile -- e2e/maestro/transactions/create-transaction.yaml
Remove-Item Env:DEVICE
```

Equivalent explicit flag:

```powershell
npm run e2e:device -w @monyvi/mobile -- --device emulator-5554 e2e/maestro/transactions/create-transaction.yaml
```

## Manual Seed And Flow Loop

If you want to control seeding manually:

```powershell
# Seed deterministic E2E data
npm run e2e:seed -w @monyvi/mobile

# Run a test through the wrapper
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/transactions/create-transaction.yaml
```

To reset seeded local data:

```powershell
npm run e2e:reset -w @monyvi/mobile
```

## Manual QA App Loop

Use this loop when you want to test the app by hand without touching the E2E
test account.

```powershell
# Use a local-only password. Do not commit it.
$env:MANUAL_QA_PASSWORD="<your-local-password>"

# Recreate the local manual QA user and deterministic starter data
npm run manual:seed-user -w @monyvi/mobile

# Make the emulator reach Metro on the host
adb -s emulator-5554 reverse tcp:8081 tcp:8081

# Open the Monyvi dev client against local Metro
adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d "monyvi://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" com.monyvi.app
```

Manual local credentials:

| Field    | Value                             |
| -------- | --------------------------------- |
| Email    | `manual-qa@monyvi.test`           |
| Password | The value of `MANUAL_QA_PASSWORD` |

After a local Supabase reset, run `npm run manual:seed-user -w @monyvi/mobile`
again to recover the same manual account.

## CI

GitHub Actions runs the Android E2E suite with:

```powershell
npm run e2e:ci -w @monyvi/mobile
```

The CI job uses local Supabase, a seeded test user, and the fixture SMS AI
parser by default. The runner starts Supabase locally, seeds the user and stable
financial data, then runs Maestro. To reproduce the same path locally:

```powershell
npm run e2e:local -w @monyvi/mobile
```

Remote Supabase is still available as a temporary fallback by setting
`E2E_SUPABASE_MODE=remote` plus explicit Supabase, service-role, and Maestro
credentials.

| Variable                         | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `E2E_SUPABASE_MODE`              | `local` by default, `remote` fallback when needed  |
| `EXPO_PUBLIC_MONYVI_TEST_MODE`   | Set to `e2e` for deterministic app test behavior   |
| `EXPO_PUBLIC_AI_SMS_PARSER_MODE` | Set to `fixture` to avoid live AI parsing in E2E   |
| `MAESTRO_E2E_EMAIL`              | Seeded E2E test account email                      |
| `MAESTRO_E2E_PASSWORD`           | Seeded E2E test account password                   |
| `E2E_LOCAL_JWT_SECRET`           | Optional fallback for generated local keys         |
| `SUPABASE_SERVICE_ROLE_KEY`      | Seed/reset access; local mode has a safe local key |

By default the CI suite runs live SMS journeys `01` through `14` plus `16`.
Journey `15` needs a release/preview APK with an embedded JS bundle, so keep it
in the release-specific path until that build is reliable in CI. Override the
set with `E2E_CI_LIVE_SMS_JOURNEYS=01,02,...` when debugging a smaller slice.

## Test Layout

| Folder                | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `helpers/`            | Shared setup and visible navigation helpers |
| `auth/`               | Signed-out authentication journeys          |
| `transactions/`       | Transaction create/edit/delete/search flows |
| `sms-sync/`           | SMS sync permission and recovery flows      |
| `live-sms-detection/` | Live SMS detection journeys and helpers     |

## Transaction Flows

| Flow                                    | Description                           | Preconditions            |
| --------------------------------------- | ------------------------------------- | ------------------------ |
| `helpers/setup.yaml`                    | Shared: ready app -> Transactions tab | -                        |
| `transactions/create-transaction.yaml`  | Create expense via FAB                | Account exists           |
| `transactions/edit-transaction.yaml`    | Edit transaction amount               | Transaction exists       |
| `transactions/edit-category-quick.yaml` | Quick-edit category from card         | Transaction exists       |
| `transactions/edit-amount-quick.yaml`   | Quick-edit amount from card           | Transaction exists       |
| `transactions/swap-account.yaml`        | Change account on edit screen         | 2+ accounts, transaction |
| `transactions/change-type.yaml`         | Change type Expense -> Income         | Expense exists           |
| `transactions/delete-transaction.yaml`  | Delete with confirmation              | Transaction exists       |
| `transactions/search-filter.yaml`       | Search + type filter                  | Multiple transactions    |

## testID Reference

| testID                     | Component                           |
| -------------------------- | ----------------------------------- |
| `auth-mode-sign-in`        | Sign-in mode segment                |
| `auth-mode-sign-up`        | Sign-up mode segment                |
| `auth-google-button`       | Google authentication action        |
| `auth-email-input`         | Email input                         |
| `auth-password-input`      | Password input                      |
| `auth-password-visibility` | Password visibility action          |
| `auth-forgot-password`     | Password recovery action            |
| `auth-submit-button`       | Email authentication CTA            |
| `fab-button`               | Main FAB button                     |
| `fab-transaction`          | "Add Transaction" action            |
| `transaction-card-{id}`    | Transaction card                    |
| `card-category-{id}`       | Category icon on card               |
| `card-amount-{id}`         | Amount area on card                 |
| `type-tab-{VALUE}`         | Type tabs (EXPENSE/INCOME/TRANSFER) |
| `header-save`              | Save button                         |
| `header-delete`            | Delete button                       |
| `header-back`              | Back button                         |
| `modal-confirm`            | Confirm button                      |
| `modal-cancel`             | Cancel button                       |
| `search-input`             | Search input                        |
| `filter-period`            | Period filter                       |
| `filter-type`              | Type filter                         |

## Live SMS Permission Flows

| Flow                                                                             | Description                                                       | Preconditions                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| `helpers/open-settings.yaml`                                                     | Shared helper: opens Settings from the loaded app shell           | Authenticated/onboarded user |
| `sms-sync/sms-sync-permission-requestable.yaml`                                  | SMS sync custom permission modal before the OS prompt             | Authenticated/onboarded user |
| `sms-sync/sms-sync-batch-duplicates-atm.yaml`                                    | Batch scan saves repeated identical SMS and an ATM withdrawal     | E2E fixture inbox            |
| `sms-sync/sms-sync-rescan-skips-saved.yaml`                                      | Batch rescan skips saved SMS fingerprints                         | Previous SMS sync journey    |
| `live-sms-detection/live-sms-detection-sms-permission-requestable.yaml`          | Live SMS custom SMS permission modal                              | Authenticated/onboarded user |
| `live-sms-detection/live-sms-detection-notification-permission-requestable.yaml` | Live SMS notification permission modal                            | Authenticated/onboarded user |
| `live-sms-detection/live-sms-detection-enable-disable.yaml`                      | Enable/disable live SMS when permissions are granted              | Authenticated/onboarded user |
| `live-sms-detection/live-sms-detection-auto-disable-revoked-notifications.yaml`  | Auto-disable live SMS after notification permission is revoked    | Authenticated/onboarded user |
| `live-sms-detection/live-sms-journey-14-background-confirm-real-sms.yaml`        | Real SMS while app is backgrounded, Confirm notification action   | Authenticated/onboarded user |
| `live-sms-detection/live-sms-journey-15-killed-app-confirm-real-sms.yaml`        | Real SMS after app process is killed, Confirm notification action | Authenticated/onboarded user |
| `live-sms-detection/live-sms-journey-16-foreground-real-sms.yaml`                | Real SMS while the app is foregrounded                            | Authenticated/onboarded user |

Additional live SMS testIDs:

| testID                      | Component                                |
| --------------------------- | ---------------------------------------- |
| `live-sms-detection-switch` | Settings live SMS detection switch       |
| `permission-modal-primary`  | Permission recovery modal primary action |
| `permission-modal-cancel`   | Permission recovery modal cancel action  |
