# Monyvi Business Decisions

**Status:** Active product source of truth **Last updated:** 2026-07-08
**Scope:** Business and product rules confirmed by the current codebase and
implementation history.

This document defines what Monyvi is trying to achieve and the product rules
that technical work must preserve. It is intentionally grounded in the current
implementation. When this file and the code disagree, investigate the code,
update this file, and call out any product decision that needs owner input.

## 1. Product Definition

Monyvi is an authenticated, offline-first personal finance companion for users
who want a low-friction way to understand their money across cash, bank
accounts, digital wallets, transactions, budgets, recurring obligations, and
physical metal holdings. The product also gives users live gold, silver, and
currency-rate context plus inflation-rate tracking and guidance.

The app is built especially for Egyptian users, where money often moves across
cash, banks, InstaPay, telecom wallets, foreign currencies, and gold or other
precious metals. The product exists because traditional finance apps ask users
to do boring manual entry, while real users already speak, receive SMS alerts,
and think in mixed Arabic/English financial language.

### Core Problem

Manual money tracking breaks down because it is slow, repetitive, and easy to
forget. Egyptian users also need support for:

- Cash plus bank and wallet accounts.
- SMS-based bank and wallet transaction confirmations.
- Arabic, English, and code-switched voice input.
- EGP-centered daily life with foreign currencies and metal holdings.
- Live gold/silver rates, approximately 35 currency rates, and inflation context
  for decisions in a changing economy.
- Offline use when network access is unreliable.

### Target Users

- Individuals in Egypt who track spending, income, cash, bank balances, and
  wallet balances.
- Users who receive bank, wallet, or InstaPay SMS alerts and want to convert
  those messages into records.
- Users who store savings in USD or precious metals and want net-worth context.
- Users who prefer Arabic, English, or mixed language entry.

### Primary Value

- Capture financial activity faster through voice and SMS import.
- Keep data usable offline by writing to the local database first.
- Give a single view of spendable balances, spending trends, budgets, and net
  worth.
- Help users interpret market and inflation movement through live rates and
  contextual guidance.
- Preserve user trust through mandatory authentication, user-scoped local data,
  soft deletes, and background sync.

## 2. Product Principles

### Offline-First Trust

WatermelonDB is the source of truth for user-facing data. Network calls should
not block normal finance workflows after the authenticated startup decision is
safe. Supabase sync is background replication, not the interactive data source.

### Automation With Review

Automation should reduce entry effort without silently corrupting financial
records. Voice and SMS parsing produce reviewable transactions unless the user
has explicitly opted into an auto-confirm mode.

### AI Processing Consent

AI transaction suggestions are controlled by one global consent setting. The
setting covers every feature that sends user content to the AI provider for
transaction suggestions: voice entry, batch SMS import, live SMS detection, and
live SMS auto-confirm.

Business rules:

- Voice recordings and matching financial SMS content must not be sent to the AI
  provider unless the current user's AI processing consent is active.
- The mobile client must gate entry into voice recording, SMS import, and live
  SMS detection before invoking AI parsing.
- The `parse-voice` and `parse-sms` Edge Functions must also enforce active
  consent server-side. Client-side consent state is a UX gate, not the final
  privacy boundary.
- Consent is stored on `profiles.ai_processing_consent` as versioned JSON with
  `version`, `consentedAt`, and `revokedAt` fields. The current active version
  is `2026-07-ai-processing-v1`.
- Consent is active only when the JSON shape is valid for the current version,
  `consentedAt` is present, and `revokedAt` is `null`.
- Revoking consent is local-first and privacy-sensitive. The local profile must
  keep the revoked state even if the remote update fails; normal sync can retry
  the remote write later.
- If a server-side AI parse returns "consent required" while local state still
  appears consented, the app must treat local state as stale, return the user to
  the consent flow, and avoid retrying the same AI request until consent is
  granted again.
- Disabling AI transaction suggestions also makes AI-dependent entry points
  unavailable. Live SMS detection and auto-confirm must be disabled or prevented
  from running when consent is not active.

### Authenticated By Default

Monyvi does not support anonymous or guest finance tracking. Users must sign up
or sign in before private app features are visible. This keeps financial data
tied to a recoverable identity and prevents local rows from another account from
influencing the current account.

### Local Data Is Still User-Scoped

Auth gates are UX boundaries, not data isolation by themselves. Because local
offline data may remain on device after logout, every current-user read/write
must be scoped to the authenticated user or to explicitly shared system data.

## 3. Authentication And Onboarding

### Authentication Methods

| Method          | Current status | Notes                                                           |
| --------------- | -------------- | --------------------------------------------------------------- |
| Email/password  | Enabled        | Email verification is required before sign-in succeeds.         |
| Google OAuth    | Enabled        | Uses Supabase OAuth and the `monyvi://auth-callback` redirect.  |
| Apple OAuth     | Deferred       | Supported in service types but not treated as production-ready. |
| Facebook OAuth  | Deferred       | Supported in service types but not treated as production-ready. |
| Phone OTP       | Not planned    | No current implementation.                                      |
| Anonymous/guest | Removed        | Do not reintroduce.                                             |

### Public And Private Journey

1. First launch reads a device-local intro flag.
2. If the user is signed out and intro slides were not completed on this device,
   route to the pitch carousel.
3. If signed out and intro was completed, route to auth.
4. If signed in, route into the authenticated startup gate.
5. The private runtime mounts only after auth has resolved.
6. Startup waits for enough sync/profile state to make a safe routing decision.
7. A missing current-user profile after sync failure or timeout shows recovery,
   not onboarding.

### Onboarding Decision

Post-auth onboarding is a single required currency step.

On confirmation, the app performs one atomic local write:

- Create or find a cash account in the selected currency.
- Set `profiles.preferred_currency`.
- Set `profiles.preferred_language` to the current runtime language.
- Set `profiles.onboarding_completed = true`.

`profiles.onboarding_completed` is the routing signal. Do not use
`preferred_currency` for routing because it is always populated and cannot
distinguish a new user from a user who deliberately chose EGP.

### Device-Scoped Intro State

The pitch carousel is pre-auth and device-scoped. It is tracked in AsyncStorage,
not in the profile row:

- `intro:seen`: completed when the user taps skip or finishes the carousel.
- `intro:locale_override`: set when the user explicitly changes language before
  auth.

## 4. Financial Domains

### Accounts

Accounts represent spendable money containers.

| Type             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `CASH`           | Physical cash balance.                                                  |
| `BANK`           | Bank account or card-backed account, optionally linked to bank details. |
| `DIGITAL_WALLET` | Wallet balance such as telecom wallets or similar services.             |

Business rules:

- One account has exactly one currency.
- Supported account currencies come from the generated `CurrencyType` enum and
  current market-rate support, not only EGP/USD/EUR.
- For accounts without a known provider identity, account names must be unique
  per user and currency, case-insensitive.
- For accounts with a known provider identity, account names must be unique per
  user, currency, and provider identity (`institution_id`), case-insensitive.
- `accounts.name` is the user's account nickname. Bank or wallet provider
  display text is separate account metadata (`provider_display_name`) and known
  providers also store the stable registry identity (`institution_id`).
- The first active account created for a user is marked default.
- At most one active account per user should be default.
- Users may intentionally have active accounts with no default account. The
  default flag is a convenience fallback, not a required invariant.
- Account type and currency are read-only after creation.
- Default cash accounts are seeded with the user's current preferred UI
  language: English stores `Cash`, Arabic stores `كاش`. The stored account name
  remains user-editable and syncs as normal account data; UI type labels are
  still localized independently from the saved nickname.
- Editing a balance may be silent or may create an internal balance-adjustment
  transaction.
- Deleting an account soft-deletes related local financial records, including
  bank details, transactions, transfers, debts, and recurring payments.
- Deleting the default account clears the default flag; another account is not
  automatically promoted.
- When no default account exists, manual transaction entry leaves the account
  unselected and asks the user to choose. Voice and SMS matching may still use
  exact account evidence, but if no confident account match exists they must
  return no match for user review instead of guessing.

### Bank Details And SMS Senders

Bank details are child rows owned through an account. They store only bank-
specific metadata used by SMS account resolution:

- Nullable card last four digits, stored as an integer in `card_last_4`.
- Optional account number.

Provider display names belong on the account so both bank and digital-wallet
accounts can use the same provider model. SMS sender names belong in dedicated
account sender rows so one bank or wallet account can store multiple sender
aliases.

An account may have at most one active bank details row. A different card
identity can be represented as a separate account when needed.

SMS account matching should prefer sender plus card-last-four matches for bank
accounts, then sender-only matches for bank or wallet accounts, then the user's
default account.

### Transactions

Transactions represent money in or money out from one account.

Business rules:

- Amounts are stored as positive numbers.
- `EXPENSE` subtracts from account balance.
- `INCOME` adds to account balance.
- Create, update, delete, and conversion operations must adjust balances inside
  the same WatermelonDB write.
- Deleting a transaction is a soft delete and reverses its balance effect.
- Transaction source is one of `MANUAL`, `VOICE`, `SMS`, or `RECURRING`.
- SMS-created transactions must store `sms_fingerprint`.
- The app supports converting transactions to transfers and transfers to
  transactions by reverting the old balance effect, soft-deleting the original
  row, creating the new row, and applying the new balance effect atomically.
- Moving a transaction to an account with another currency keeps the same
  numeric amount in the new account currency. No automatic conversion is
  currently applied during that edit.

### Transfers

Transfers move money between two accounts.

Business rules:

- Transfers debit `from_account_id` and credit `to_account_id`.
- Same-currency transfers may use `amount` only.
- Cross-currency transfers may use `converted_amount` and `exchange_rate`.
- Transfers do not affect net worth, because money is moving between owned
  accounts.
- SMS ATM withdrawals are modeled as bank-to-cash transfers when detected.
- SMS-created transfers must store `sms_fingerprint`.

### Categories

Categories are hierarchical and may be system-defined or user-defined.

Business rules:

- System categories are shared (`user_id` is null).
- Custom categories are user-owned.
- Authenticated UI must query categories through accessible-scope helpers that
  include system categories plus the current user's categories.
- Internal categories, such as balance adjustments and asset purchase/sale
  categories, should not appear in normal user pickers.
- AI parsers must return known category system names, not invented labels.

### Budgets

Budgets help users control spending.

| Field  | Decision                                                  |
| ------ | --------------------------------------------------------- |
| Type   | `GLOBAL` or `CATEGORY`.                                   |
| Period | `WEEKLY`, `MONTHLY`, or `CUSTOM`.                         |
| Status | `ACTIVE` or `PAUSED`.                                     |
| Alerts | Warning/danger levels are tracked by `alert_fired_level`. |

Business rules:

- A global budget is unique per user and period.
- A category budget is unique per user, category, and period.
- Category budgets include spending in the selected category and descendants.
- Custom-period budgets require both start and end dates.
- Paused budgets track pause intervals and exclude paused time from spending
  calculations.
- Custom budgets can auto-pause when their period expires.
- Alert levels are reset on period rollover.

### Recurring Payments

Recurring payments describe expected future money movement.

Business rules:

- A recurring payment has a type, amount, account, category, currency,
  frequency, next due date, status, and action.
- Supported actions are `AUTO_CREATE` and `NOTIFY`, but current production UI is
  primarily centered on displaying upcoming payments and manual "pay now"
  handling.
- When a recurring payment creates a transaction, the created transaction should
  link back through `linked_recurring_id`.
- Any future scheduler must preserve local-first writes and idempotency.

### Debts

Debts track money lent or borrowed.

Business rules:

- `LENT` and `BORROWED` debts are user-owned.
- Debt status may be active, partially paid, settled, or written off.
- Debt-linked transactions should preserve their link even if later converted or
  soft-deleted, so the record remains auditable.

### Assets And Metals

Assets represent non-spendable wealth holdings. The implemented subtype is metal
holdings.

Business rules:

- Parent `assets` rows store owner, name, type, purchase price, purchase date,
  purchase currency, liquidity flag, notes, and sync columns.
- `asset_metals` child rows store `metal_type`, `weight_grams`,
  `purity_fraction`, and optional item form.
- Supported metal types are `GOLD`, `SILVER`, `PLATINUM`, and `PALLADIUM`.
- `purity_fraction` is the canonical purity field. Do not document or implement
  new flows against the old `purity_karat` field.
- Current value is calculated, not stored:
  `weight_grams * purity_fraction * metal_usd_per_gram`, converted for display
  as needed.
- If a metal purchase is deducted from an account in a future flow, it should
  create an internal asset-purchase transaction and link it to the asset.

## 5. Market Rates And Net Worth

### Market Rates

Market rates are stored in `market_rates` as append-only-ish rows of USD-based
rates:

- Currency columns store the USD value of one unit of that currency, for example
  `egp_usd`.
- Metal columns store USD per gram, for example `gold_usd_per_gram`.
- The mobile app syncs recent market-rate rows into WatermelonDB.
- The current implementation treats rates older than 24 hours as stale.
- `market_rates_history` is not part of the current WatermelonDB schema and
  should not be referenced as the active app data source.

### Net Worth

Net worth is calculated locally from WatermelonDB:

- Account balances are converted to USD using local market rates.
- Asset values are calculated from metal holdings and local market rates.
- Display values are converted from USD into the user's preferred currency.
- Transfers do not change net worth.
- Daily snapshot tables support historical trend display. Current local schema
  stores USD-based totals for account and asset snapshots.

The old `v_user_net_worth` view/API-first approach is not the current product
architecture.

## 6. Voice Entry

Voice entry is a primary friction-reduction feature.

Business rules:

- Voice supports Arabic, English, and code-switching.
- Voice recordings are sent to the `parse-voice` Supabase Edge Function.
- The edge function uses Gemini 2.5 Flash-Lite with structured JSON output.
- The mobile client validates the edge-function response with Zod.
- The AI may return multiple transactions from one recording.
- The AI should never invent transactions; ambiguous or non-financial speech
  should return no transactions.
- The client resolves category IDs, account IDs, dates, currencies, and
  confidence before review.
- Users review parsed transactions before saving.

## 7. SMS Import And Live Detection

SMS import has two product modes:

- Batch inbox scan.
- Live SMS detection on Android.

Business rules:

- Live SMS detection is opt-in and off by default.
- Auto-confirm is opt-in and off by default.
- Without auto-confirm, detected transactions show a notification with Confirm
  and Discard actions.
- Discard must not write financial records.
- Confirm must be idempotent.
- Every SMS-created transaction or transfer must persist `sms_fingerprint`.
- `sms_fingerprint` is generated from the normalized sender, normalized SMS
  body, and received timestamp in milliseconds. Do not use the device SMS
  message ID as the business deduplication key.
- Deduplication must check both `transactions.sms_fingerprint` and
  `transfers.sms_fingerprint`.
- ATM withdrawals should be saved as transfers when an account can be resolved.
- Live detection has foreground/background JS paths and killed-app HeadlessJS
  paths on Android.
- If the SMS review page is active, live-detected messages are queued and
  flushed after review is dismissed.

## 8. Notifications

Current notification scope:

| Type                         | Status                             | Notes                                          |
| ---------------------------- | ---------------------------------- | ---------------------------------------------- |
| SMS transaction confirmation | Implemented                        | Used by live SMS detection.                    |
| Budget alerts                | Implemented in local alert service | Avoid duplicate alert levels per period.       |
| Recurring reminders          | Intended                           | Keep local-first and idempotent when expanded. |
| Low balance warning          | Future                             | Not MVP.                                       |

Local notifications are enough for current product scope. Push notifications are
not required for MVP.

## 9. Localization And Preferences

Business rules:

- Supported UI languages are English and Arabic.
- Device locale is used as the first hint.
- A pre-auth language override is device-scoped.
- The authenticated profile stores `preferred_language`.
- Settings can change language after sign-in.
- Theme preference is `LIGHT`, `DARK`, or `SYSTEM`.
- Preferred currency affects display conversion and defaults.

## 10. Data Safety And Sync

Business rules:

- All user-owned syncable rows must include `created_at`, `updated_at`,
  `deleted`, and `user_id`, except child rows whose ownership is inherited from
  an owned parent.
- Server-generated pull-only tables may omit `deleted` and may use specialized
  pull behavior.
- Sync pull/push failures must fail sync, not silently advance sync metadata.
- Push must refuse local rows that do not belong to the authenticated user.
- Supabase RLS is required but is not a substitute for client-side scoping.
- Logout may preserve local rows, so routing, calculations, and visible UI must
  never read foreign local data.

## 11. Current Known Product And Documentation Gaps

These are documented so future contributors keep product behavior aligned with
the current implementation:

- `parse-transaction` was removed. Active AI parsing is `parse-sms` and
  `parse-voice`.
