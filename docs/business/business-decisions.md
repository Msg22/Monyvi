# Monyvi Business Decisions

**Status:** Active product source of truth **Last updated:** 2026-08-18
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

AI-parsed review screens may pre-select only low-risk transactions: confidence
greater than 0.8, a resolved account match, and not an ATM withdrawal. Any row
with lower confidence, no account match, ATM-withdrawal transfer behavior, or
missing required information must stay unchecked until the user explicitly
reviews or selects it. "Select all" remains an explicit user action, and when a
focused review filter is active it should select only the shown rows.

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
- For phase 1 of the local parser, deterministic local transaction parsing
  follows the same AI transaction suggestions setting even though local parsing
  does not send content to an external provider. This avoids changing feature
  access and consent semantics while the dev/test local parser is introduced.

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

- A current global budget is unique per user and period.
- A current category budget is unique per user, category, and period.
- Expired custom budgets remain historical and do not occupy the uniqueness slot
  for creating their replacement; another non-expired custom budget still does.
- Category budgets include spending in the selected category and descendants.
- Custom-period budgets require both start and end dates.
- Paused budgets track pause intervals and exclude paused time from spending
  calculations.
- Custom budgets can auto-pause when their period expires.
- Alert levels are reset on period rollover.
- Budget dashboard lifecycle classification is derived and mutually exclusive:
  an expired custom budget is `EXPIRED` even when its persisted status is
  `ACTIVE` or `PAUSED`; otherwise a persisted paused budget is `PAUSED`;
  otherwise warning and danger spending states are active near-limit and
  over-budget presentation states; remaining active budgets are healthy.
- Renewing an expired custom budget creates a new prefilled budget and leaves
  the expired historical budget unchanged.
- The dashboard uses one unified budget list. Scope tabs (`All`, `Category`,
  `Global`), period filters (`All`, `Weekly`, `Monthly`, `Custom`), and status
  filters (`All`, `Active`, `Paused`, `Expired`) combine using AND semantics.
  Defaults are `All` scope, `All` period, and `Active` status.
- Dashboard selections persist while the dashboard remains in the current
  signed-in app session and reset to their defaults after a fresh app launch or
  authenticated-user change.
- Active results sort by spending priority: over budget, near limit, then
  healthy. When all statuses are selected, expired budgets come first and paused
  budgets appear after attention-required active budgets and before healthy
  budgets. Within each priority group, budgets sort by trimmed display name
  using the active English or Arabic locale with numeric,
  case/diacritic-insensitive comparison; equal names use stable budget ID as the
  final tie-break, and spend-only changes never affect order inside a group.
- Every budget uses the same compact dashboard row pattern. Active rows show
  percentage and progress. Paused and expired rows show neither percentage nor
  progress, but keep explicit status, context, and direct Resume or Renew
  actions.
- Budget Detail uses direct Edit, eligible Pause/Resume, and isolated Delete
  actions; Pause, Resume, and Delete require confirmation and suppress duplicate
  pending submission. Delete removes only the budget and keeps transactions.
- Budget Detail preserves the existing daily-average-spent calculation and
  labels it `Daily average spent`; it is not presented as `Safe to spend`.
- The active Budget Detail pace insight compares eligible cumulative spending
  with the budget allowance elapsed by today over inclusive local calendar days.
  Values equal at displayed currency precision are on pace. Weekly dashed pace
  values allocate the unchanged limit proportionally by each bucket's inclusive
  day count, including partial first or final weeks.
- Paused and expired Budget Detail screens retain historical spending,
  percentage, and progress, but do not show an active below/on/above pace
  insight.
- Applicable empty Category breakdown and Recent transactions sections remain
  visible with compact explanations. Global budgets omit Category breakdown.
- Long custom-period weekly charts retain every chronological week through
  horizontal scrolling with consistent readable column widths.
- Global budget detail uses the wallet/overall-spending icon. A historical
  category budget whose category was deleted uses a neutral category fallback.
- Recent Budget Detail transaction rows open the existing Edit Transaction
  journey. Category breakdown rows are noninteractive, and Recent transactions
  has no `View all` action until a budget-scoped destination exists.

### Recurring Payments

Recurring payments describe expected future money movement.

Business rules:

- A recurring payment has a type, amount, account, category, currency,
  frequency, next due date, optional end date, status, and action.
- Supported actions are `AUTO_CREATE` and `NOTIFY`, but current production UI is
  primarily centered on displaying upcoming payments and manual "pay now"
  handling.
- When a recurring payment creates a transaction, the created transaction should
  link back through `linked_recurring_id`.
- Any future scheduler must preserve local-first writes and idempotency.
- End date is optional and inclusive: an occurrence due exactly on it is eligible.
- An unpaid final occurrence remains active and overdue after End date. Passing the
  boundary never proves that it was paid.
- Pay Now may record an overdue final occurrence. Its successful local batch must
  create the transaction, apply the balance effect, advance the schedule, and set
  the recurring payment to `COMPLETED` together.
- Editing a completed recurring payment, including extending or clearing End date,
  never changes its status. Reactivation is always an explicit user decision.
- Users can reactivate a completed series from My Bills after a confirmation, or
  select "Reactivate after saving" while editing it. Reactivation is allowed only
  when the calculated next due payment is eligible under the selected End date.
- A Due payment after End date is invalid. A schedule with one eligible Due payment
  and no later eligible recurrence is valid and explains that no further payments
  will be due.

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
- Voice review uses the shared AI-parsed transaction review selection rule: only
  high-confidence rows with a resolved account match are pre-selected.

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
- Batch SMS review uses the shared AI-parsed transaction review selection rule:
  high-confidence matched rows may be pre-selected, but ATM withdrawals and rows
  needing account/category/user review must remain unchecked.
- Live detection has foreground/background JS paths and killed-app HeadlessJS
  paths on Android.
- If the SMS review page is active, live-detected messages are queued and
  flushed after review is dismissed.

### Local SMS Parser

Monyvi may use a deterministic local SMS parser for supported financial SMS
templates. Phase 1 is a development/testing capability only; production fallback
and trusted real-message promotion are deferred to a later issue.

Business rules:

- Phase 1 local parser behavior is dev/test-only. It may use fixture, synthetic,
  internet, or unknown-source SMS examples, but those patterns must be
  explicitly marked as development/testing data and must not be treated as
  trusted production parsing rules.
- The local parser is a declared-template parser, not a broad financial-keyword
  parser. Keywords may help filter candidates or match inside a declared
  provider/template rule, but keywords alone must never create a transaction
  suggestion.
- Every local parser pattern must include runtime scope, source type, source
  confidence, sanitized example shape, expected outcome, review expectation,
  auto-select policy, promotion eligibility, and edge cases.
- Dev/test-only patterns must not be marked production-trusted or production
  auto-selectable.
- Future production-supported local parser templates must come from trusted
  real-message sources, such as sanitized QA-device SMS, sanitized consented
  user SMS, provider-published examples, or controlled small-value real
  transactions. Raw real user SMS must not be committed to source control.
- Negative classification must run before extraction. OTPs, promotions, offers,
  activation notices, failed transactions, reminders, and informational-only SMS
  must be ignored even when they contain words such as card, wallet, transfer,
  balance, cashback, amount, or currency.
- In phase 1, production/default behavior remains AI-primary. Local fallback
  must not run in production.
- Phase 2 must re-specify and approve production fallback trigger rules, trusted
  provenance requirements, real SMS consent/sanitization flow, and any
  production auto-selection rules before production fallback is enabled.
- ATM withdrawals, low-confidence matches, partial template matches, missing
  account/category context, ambiguous amounts, unsupported templates, and
  non-exact templates must require review or produce no suggestion.
- Parser source labels such as local parser, AI parser, or fixture parser are
  diagnostics-only and must not be shown in the regular transaction review UI.
- Local audio transcription and voice-flow integration are out of scope for the
  first local-parser release. Future reuse may handle already-transcribed text
  only after a separate product decision.

#### Phase 2A: Trusted QA SMS Pattern Intake

Phase 2A builds review-only template evidence from real QNB messages on
Mohamed's explicitly authorized QA device. It does not enable production local
parsing or collect messages from general users.

Business rules:

- The QA intake tool is available only in an explicitly enabled Android
  development build. It must remain unavailable in release builds and ordinary
  development sessions.
- The operator must authorize a bounded QA session before QNB inbox messages are
  listed. Only messages the operator explicitly selects may be sanitized or
  exported.
- Phase 2A inbox access is allowlisted to the verified QNB sender aliases `QNB`,
  `QNB EGYPT`, and `QNB ALAHLI`. The tool merges and deduplicates those bounded
  results, sorts them newest first, and never scans arbitrary senders to infer
  provider support. New aliases or providers require explicit verification and
  an approved scope update.
- Authorization copy remains provider-neutral so the safety promise stays
  accurate as verified providers are added later. The selection state must show
  the currently verified provider and a retryable empty state when that bounded
  provider query returns no messages.
- Raw sender/body values, native message IDs, source timestamps, account/card
  values, amounts, balances, references, merchant/person names, phone numbers,
  and app SMS fingerprints must remain in memory only. They must never enter
  logs, analytics, AsyncStorage, WatermelonDB, Supabase, test snapshots, issues,
  PRs, source control, clipboard, share sheets, or exported artifacts.
- Sanitized templates use structured fixed-text segments and the canonical
  placeholders `AMOUNT`, `BALANCE`, `LAST4`, `ACCOUNT`, `REFERENCE`, `MERCHANT`,
  `PERSON`, `PHONE`, `DATE`, `TIME`, `PERCENTAGE`, and `URL`.
- Canonical tokens may carry narrower semantic roles. Contextually labeled
  four-to-eight-digit OTP, verification-code, security-code, or PIN values use
  `REFERENCE` with role `otp_code`. Contextually labeled four-to-seven-digit
  provider call, contact, or hotline numbers use `PHONE` with role
  `provider_hotline`; raw hotline numbers are not allowlisted into fixed text.
  Unlabeled short numeric values remain blocked and require operator review.
- Changing public promotion values are not user-private values. Offer amounts,
  rates, campaign years, public URLs, and public references use explicit
  `promotional_amount`, `promotional_rate`, `campaign_year`, `public_url`, or
  `public_reference` roles so they are variable without being mislabeled as a
  person, account, or transaction value.
- Automatic sanitization is fail-closed. The operator may correct placeholder
  boundaries and types locally, but every correction invalidates prior approval
  and requires complete privacy revalidation.
- Placeholder corrections are cumulative within the in-memory intake session.
  Correcting a different non-overlapping range must preserve earlier
  corrections; correcting the same raw range replaces only that correction.
  Partially overlapping ranges are rejected so the operator must resolve the
  ambiguous boundary explicitly. Correction history contains offsets and
  placeholder roles only, never raw values, and is cleared with the sensitive
  workflow state.
- The placeholder editor may stage several non-overlapping corrections before
  applying them once. The live sanitized preview and pending list remain local,
  the batch applies atomically, and one invalid or overlapping range must not
  partially commit other pending changes.
- Missing-placeholder validation names the missing semantic role with safe,
  actionable copy and never includes the raw value. IPN transfer candidates
  require a transaction amount only; balance and counterparty placeholders are
  optional because valid provider templates may omit them. Transfer account
  resolution remains required later when a runtime transaction is reviewed.
- A bank-account suffix in a reviewed IPN template is sanitized as `ACCOUNT`
  with role `source_account_suffix`, distinct from the card `LAST4` role. Phase
  2A does not persist or use the raw suffix. Runtime storage and account
  matching are deferred to issue #759.
- A QA-operator-confirmed QNB debit-card template may delimit the merchant with
  `@` and compact the available balance as `available bal.<currency><amount>`.
  The intake sanitizer must emit separate `MERCHANT` and `BALANCE` placeholders
  for this reviewed structure. Repository tests must use synthetic values and
  must not copy the raw reviewed message.
- A normalized QNB sender alias may be preserved only after the operator
  verifies it as provider-controlled metadata. Personal phone-number senders and
  unverified aliases must be removed.
- The initial scope is QNB messages in EGP and USD: card purchases, ATM
  withdrawals, incoming IPN transfers, outgoing IPN transfers, refunds or
  reversals, failed transactions, OTP messages, informational messages, and
  promotional messages, plus EGP bank-account-to-wallet transfers.
  Bank-account-to-wallet messages are a distinct review-only transfer family;
  they require source and destination account resolution and are never
  auto-selected. InstaPay-related transfers in this scope are messages sent by
  QNB, not messages sent by InstaPay.
- EGP and USD examples may share a family only when fixed wording, placeholder
  roles, transaction direction, and meaning are identical. Each supported
  currency still requires its own evidence and positive, near-match, and
  negative validation cases.
- One sanitized sample remains candidate-only. At least three matching,
  non-duplicate samples, human approval, and passing positive, near-match, and
  negative tests are required for `review_ready`.
- Repetition from the current QA device is not independent production
  corroboration. Production trust additionally requires evidence governed by
  Phase 2B or Phase 2C.
- Evidence duplicate detection uses a domain-separated digest protected by a
  device-local secret. The secret and the app's `smsFingerprint` must never be
  exported.
- The candidate catalog and coverage manifest are physically separate from
  `LOCAL_SMS_PATTERNS`. Candidate records always use `runtimeScope: candidate`
  and `autoSelectPolicy: never`, and no Phase 2A API may execute them.
- Every required family/currency combination must be candidate-backed or
  explicitly recorded as unavailable in the QA dataset before Phase 2A is
  complete. Pending coverage blocks final acceptance.
- Selection filters may use only literal EGP/USD content and selected/unselected
  state. Message family and transaction type remain unknown until explicit
  operator classification and must not be inferred for filtering.
- The selection screen shows the bounded loaded count and selected count. A bulk
  action fills remaining selection capacity with the newest currently matching
  messages, never exceeding 50 and never clearing existing selections.
- Inbox merge deduplication removes repeated native records with the same device
  message ID only. Distinct device messages remain available even when their
  content or sanitized structure is similar; duplicate evidence digests do not
  increase independent evidence.
- A blocked sanitized candidate must show privacy-safe validation reasons and
  offer correction or discard. Discard affects only the in-memory QA candidate
  and selection, never the SMS stored on the device.
- Phase 2A header navigation moves to the previous workflow step before exiting
  the tool. Candidate arrows paginate within sanitized review only.
- The full-screen placeholder-correction header applies the Android top inset
  exactly once, and sanitized-review pagination/actions use the same
  fallback-aware bottom inset as other Phase 2A fixed actions.
- Coverage may be summarized as nine compact expandable groups, including one
  visual OTP/informational group, only while all ten semantic families and every
  required currency scope remain independent and directly editable.
- The final coverage step may mark all currently pending scopes unavailable in
  one action. The operation must not modify candidate-backed or previously
  resolved declarations.
- Approved candidates leave the device only as a validated local JSON artifact
  written through the Android document picker. The operator inspects and
  manually transfers the file; there is no clipboard, share sheet, or automatic
  upload path.
- ATM names, terminal descriptors, and terminal identifiers are sanitized as
  `ATM_TERMINAL` with `atm_terminal` semantics, never as a merchant. This
  semantic placeholder does not infer the ATM-withdrawal family and is not
  persisted as a transaction merchant.
- Transferred bundles must be placed under the ignored `.local/qa-sms-intake/`
  staging directory. Only importer-validated candidate outputs may enter
  `packages/logic` source control.
- Repository ingestion may be orchestrated through one explicit host command
  that validates the selected export before staging, performs dry-run and atomic
  import, updates coverage, and runs privacy/governance checks. The mobile app
  must not write repository files or automatically transfer the artifact to the
  host.
- Every bundle includes a SHA-256 digest over canonical sanitized content, and
  export, staging validation, and import recompute it. This is tamper evidence
  for accidental or stale edits, not proof of authenticity or authorship.
- Candidate templates may be matched only inside an isolated QA validation
  evaluator. That evaluator is not exported through application runtime barrels,
  cannot return app transaction contracts, and must remain unreachable from
  batch scan, live SMS, AI fallback, review, and save workflows.
- Transaction candidate metadata includes a numeric `confidenceCeiling` and a
  review reason from a closed, versioned candidate-review reason set.
- Structural family revisions preserve the complete prior evidence, expected
  outcome, review decision, validation coverage, runtime policy, invalidation
  time, and superseding version in immutable history.
- SMS permission denial, blocking, and runtime revocation reuse the existing
  Monyvi custom permission explanation/recovery flow and must clear raw intake
  state before recovery.
- Evidence-secret read loss or corruption blocks export. Starting a new evidence
  domain requires explicit operator acknowledgment and manual duplicate review
  against the existing candidate catalog.
- The intake tool lists at most 3,000 messages and accepts at most 50 selections
  per session. The synthetic 50-message sanitizer/validator benchmark target is
  one second.
- The QA privacy scanner is a required root verification, pre-push, and CI gate.
- The approved dev-tool layout is stored under
  `specs/029-trusted-qa-sms-patterns/mockups/`. Implementation must preserve its
  information architecture and interaction sequence while using Monyvi's
  existing theme colors, typography, safe areas, and light/dark behavior.

#### Phase 2C: Trusted Hybrid Local-First SMS Parsing

- SMS bodies containing any of these Arabic phrases are hard-excluded before
  fingerprinting, trusted-template matching, category enrichment, or full AI
  parsing, even when the sender is trusted: `اكسب`, `حجز`, `ادفع`, `اتبرع`,
  `كاش باك`, `موعد`, `كهرباء`, `غاز`, and `مياه`. Matching ignores Arabic
  diacritics, tatweel, common alef variants, and repeated whitespace. This
  intentionally favors excluding promotional/action-oriented messages over
  recall; a legitimate transaction containing one of these phrases, including an
  authorization-hold message that uses `حجز`, will also be excluded.
- Every eligible candidate is evaluated against active `trusted_production`
  templates first. Exact unambiguous local matches never send their raw SMS or
  financial payload to the full AI parser; only unresolved, disabled, malformed,
  unsupported, or ambiguous candidates may use full AI parsing under the
  existing AI transaction-feature consent gate.
- One explicitly reviewer-approved real sanitized candidate is enough for
  promotion, but only for that exact structure. Promotion requires an immutable
  privacy-safe record and passing schema, privacy, positive, near-match,
  negative, ambiguity, and integrity validation.
- Near-match and negative approval is backed by executable, candidate-bound
  checks rather than source-authored status flags alone.
- Sender aliases normalize trim and case only. Bodies normalize line breaks and
  repeated whitespace only. Fixed wording, case, punctuation, and segment order
  remain exact; fuzzy or keyword-only production matching is prohibited.
- The initial QNB allowlist includes exact approved card-purchase, ATM,
  incoming/outgoing IPN, refund/reversal, OTP, informational, and promotional
  structures. ATM remains the existing review-required transfer-on-save path;
  IPN maps to external-counterparty income/expense.
- `bank_to_wallet_transfer` remains AI-only even when Phase 2A evidence exists.
  The current parsed-SMS result cannot safely represent both owned account
  endpoints; changing that behavior requires a separate approved decision.
- Placeholder semantics follow
  `specs/030-hybrid-sms-parser/contracts/placeholder-role-contract.md`. Unknown
  roles block promotion. Account suffixes remain match-only until issue #759.
- Production local suggestions are review-required by default. The only initial
  auto-selection exception is an exact trusted card purchase with accepted
  category enrichment, a strong resolved account match, and zero reasons from
  the authoritative transaction-review selection service. Existing amount,
  currency, ATM destination, save, and fingerprint validation remain
  authoritative.
- The first release uses a versioned bundled catalog. Failed OTA/app activation
  retains the prior installed valid bundle. Runtime-invalid installed catalogs
  activate no local patterns and route candidates to AI. The activation
  interface remains replaceable by a future cached remote manifest.
- Partial AI failures preserve successful local/AI results. Review shows the
  approved inline unresolved-count notice and retries only retryable unresolved
  candidates. Consent revocation and cancellation use their existing flows.
- Raw unresolved candidates and retry context are memory-only and are cleared on
  save, discard, reset, review Back, abandonment route replacement, logout, and
  private-runtime unmount.
- User-contributed template collection (#751), remote manifest fetching,
  auto-selection for any family other than the approved enriched card-purchase
  exception, voice changes, and database schema changes remain out of scope.

##### Trusted Purchase Category Enrichment

- A trusted local card purchase with a non-empty merchant may use a dedicated
  consent-gated AI enrichment request because a generic `other` category is not
  sufficient production review quality. The trusted parser's merchant remains
  authoritative and is not normalized by AI.
- The enrichment request is not a second full parse. It may contain only an
  opaque per-merchant ID, locally extracted merchant text, transaction
  direction, and trusted message family. The server owns the immutable safe
  system-category allowlist; the client cannot expand it.
- Raw SMS body, sender/provider, amount, balance, currency, card/account data,
  reference, phone, date/time, fingerprint, transcript, custom category names,
  and unrelated messages are forbidden from the enrichment payload and logs.
- The AI response may supply only the category and category confidence after
  strict validation. Merchant, amount, currency, direction, date, card/account
  hints, transfer semantics, fingerprint, and trusted provenance remain locally
  authoritative. Local code may deterministically recompute confidence and
  review metadata only through the exact enriched-card gate below.
- Equal merchant inputs are deduplicated within one parse session. Valid results
  may update all correlated trusted purchases without creating duplicate review
  items. If the provider returns multiple entries for one opaque merchant ID,
  all entries for that ID are rejected, including malformed siblings.
- ATM withdrawals, IPN/person transfers, trusted rejections, refunds/reversals,
  merchant-free results, and locally unresolved candidates do not use this
  enrichment endpoint in the first release.
- Exact trusted card purchases use a fixed local extraction confidence of
  `0.98`. An allowed category result is accepted at confidence `0.50` or
  greater. Accepted results below `0.80` remain review-required with a
  category-specific reason; `0.80` is included in the auto-selection confidence
  range. Generic fallback categories such as `other` and `uncategorized` are
  never accepted as enrichment outcomes even if the provider reports high
  confidence. After acceptance, auto-selection still requires a resolved account
  and zero remaining reasons from the existing transaction-review selection
  service. Account evidence follows the exact-card or unique-sender rule below;
  ambiguous matches remain review-required.
- ATM withdrawals, transfers, unresolved templates, uncertain categories, and
  failed enrichment remain review-required regardless of local confidence.
- Missing, malformed, low-confidence, invented-category, timeout, cancellation,
  offline, consent, and server failures preserve the original trusted local
  suggestion and direction-correct fallback category. A failed enrichment must
  never send the trusted SMS to the full parser.
- Category enrichment sends at most 20 unique merchants per request, permits no
  more than two requests in flight, and shares one 20-second total client
  deadline per parse operation. Expiry stops remaining enrichment while
  preserving trusted local suggestions and already accepted outcomes.
- Malformed, duplicated, or invalid enrichment outcomes invalidate only their
  opaque merchant identity. Unrelated valid merchant outcomes remain usable;
  only a malformed response envelope invalidates the complete response.
- When an SMS contains an explicit card-last-four value, account matching first
  resolves exactly one accessible sender-plus-card match. If no exact card match
  exists, it may use sender-only evidence only when that sender identifies one
  accessible account. Duplicate exact matches, duplicate sender matches, and
  registry/default fallbacks remain unresolved for card-bearing SMS.
- Live SMS parsing and saving are pinned to the authenticated user who started
  the operation. A user change before notification or the final
  fingerprint-guarded write discards the stale result without creating a
  financial record.
- Persistent merchant/category history and automatic learning are deferred until
  reviewed production history can demonstrate useful precision and coverage. The
  mobile enrichment boundary remains replaceable so that strategy can be added
  later without changing trusted extraction.
- One manually approved exact `QNB EGYPT` online-banking transfer-request
  structure is included in catalog version 2. It emits an `EXPENSE` transaction
  suggestion in the `outgoing_bank_transfer` family with category `other`, no
  invented counterparty, conservative confidence, and mandatory review. It is
  not modeled as an owned-account Transfer. The full AI prompt contains the same
  narrow sanitized exception and must not generalize it to other pending or
  requested-transfer wording.

#### Launch SMS Scan Safeguards

- Initial scans and deliberate history rescans consider only messages received
  during the inclusive rolling 30 days before one immutable scan-start instant.
  The cutoff applies before local exclusion, trusted-template matching,
  enrichment, or full AI parsing. Launch users cannot select a custom range and
  do not see subscription or paywall UI.
- Ordinary `Sync new SMS` operations use an installation-local, user-scoped,
  policy-versioned safe checkpoint with a five-minute overlap. The existing
  canonical SMS fingerprint remains authoritative for deduplication. The
  checkpoint advances only over one contiguous prefix of durably classified work
  and never over memory-only suggestions, quota-deferred candidates,
  cancellation, malformed responses, or other unresolved work.
- Full SMS parsing accepts at most 50 unresolved candidates per request, 200 per
  scan session, and 200 per authenticated user in a rolling 24-hour period. One
  request is also limited to 128 KiB, a conservative 32,000 input-token
  estimate, and 30 provider-starting requests per rolling minute.
- Category enrichment has an independent allowance: at most 20 normalized unique
  merchants per request, 100 merchant attempts per authenticated user in a
  rolling 24-hour period, and 30 provider-starting requests per rolling minute.
  Enrichment refusal never sends a trusted local message to the full parser.
- A deliberate `Rescan recent messages` operation has a 24-hour cooldown that
  starts only when its first full-parser provider request actually begins.
  Local-only rescans do not start the cooldown, and cooldown never blocks
  ordinary incremental sync.
- Edge Functions independently enforce authentication, active AI consent,
  candidate/request shape, payload/token boundaries, per-session and rolling
  allowances, burst limits, terminal negative outcomes, and request idempotency.
  Capacity is reserved atomically and consumed exactly once at provider start. A
  request that never reaches the provider releases its reservation; failures
  after provider start remain consumed.
- AI usage ledgers are server-only and contain aggregate identity/accounting
  metadata, never message or financial content. A server-authored AI-negative
  outcome stores only user scope, canonical fingerprint, original received
  timestamp, strike metadata, and sync metadata; mobile may pull but never push
  these rows.
- A complete, identity-valid AI response may add one non-transaction strike for
  an explicitly untrusted or omitted candidate. Ordinary scans suppress the
  first and second strike while the message remains in the rolling window;
  deliberate history rescans may produce the next strike. Strike three
  permanently blocks further full-AI submission for that user, including after
  reinstall. Failed, cancelled, malformed, truncated, safety-stopped, or
  identity-invalid responses add no strike. An exact active trusted local
  template may still produce a local review result without clearing the terminal
  AI block.
- Capacity, cooldown, or oversized-input failures preserve all accepted local
  and earlier AI suggestions and keep Save available. Guidance is aggregate,
  friendly, and may show one localized absolute availability time. It does not
  create a retry modal, mandatory decision, raw retry queue, or persistent
  draft.
- Deterministic safeguard QA uses named fixture/provider/policy profiles with a
  fixed clock and isolated reset namespace. Client-owned boundaries may use a
  pure preflight, but server-owned profiles must execute the local Supabase Edge
  handler and real safeguard RPCs; only the fixture inbox and Gemini provider
  may be substituted. Routine QA must prove zero production Gemini calls and
  zero production allowance consumption. Any selected-model count-token
  calibration is a separately named explicit opt-in operation and never
  generates content.
- These safeguards are SMS-specific. Voice consent, parsing, request contracts,
  and usage accounting remain unchanged. Persistent review drafts and dismissed
  fingerprints remain owned by issue #770.

#### Resumable SMS Review Suggestions

Successful SMS parsing results use one resumable, device-local review queue per
authenticated user so paid parsing work is not lost when review is left or the
app restarts.

Business rules:

- Accepted trusted-local and AI suggestions become durable automatically only
  after pinned-user and stale-session validation. Failed, cancelled, malformed,
  quota-deferred, oversized, or otherwise unresolved candidates do not create
  review items.
- The queue is stored in WatermelonDB as installation-local user data and is
  excluded from Supabase synchronization. Another local account must never see,
  count, edit, save, discard, or merge a different user's queue.
- One user has at most one active queue. New unique successful results merge
  into it by canonical SMS fingerprint without replacing confirmed edits or
  explicit selection overrides. Saved financial records, active review items,
  and dismissed fingerprints are excluded before paid parsing.
- The durable review payload preserves the original SMS only while its item is
  active, plus parsed values, parser provenance, confidence, review reasons,
  account/category references, fingerprint, confirmed edits, and an optional
  explicit selection override. Original SMS and complete payloads never enter
  final financial records, sync, notifications, logs, diagnostics, analytics,
  crash context, or category enrichment.
- Active unresolved items expire 30 days after parsing. Saving, discarding, or
  expiry removes the complete payload and original SMS. A temporarily undoable
  individual discard may retain the edited item only in volatile memory until
  Undo closes, expires, is replaced, or the process ends.
- SMS import with an active queue shows `Continue reviewing N transactions` as
  the primary action and `Check for new messages` separately. `Review later`
  exits the complete scan/review flow in one tap while preserving every item.
- Untouched items derive selection from current review metadata. Explicit user
  selection or deselection survives navigation and restart. Hard-invalid items
  remain unselected; selecting an unresolved hard-invalid item blocks the full
  atomic selected batch. Unselected hard-invalid items and soft warnings do not
  block other valid selected items. Deliberately selecting a structurally valid
  soft-warning item confirms it.
- A successful atomic save removes only the saved selected items, preserves
  every unselected item, navigates to Transactions, and reports only the saved
  count. A failed batch writes no financial records and leaves the complete
  queue recoverable.
- The approved edit experience is a compact bounded bottom sheet that keeps the
  review header and filters visible. It preserves the provider identity block
  and colorful field icons, includes Currency, edits Amount and Merchant inline
  one field at a time with keyboard-aware internal scrolling, and opens existing
  selector sheets for Category, Account, and editable Currency. SMS suggestion
  direction/type is read-only: Expense and Income tabs are absent. Individual
  discard is absent from the edit sheet.
- Each card has one compact circular top-right `X` action with an accessible
  label and touch target. One tap discards that suggestion without an individual
  confirmation, writes no financial record, and records a user-scoped dismissed
  fingerprint so that SMS is not offered or billed again on that installation.
- Successful individual discard uses a restrained single fade-and-collapse;
  neighboring cards settle once. The named Undo banner restores only the latest
  discarded item to the same position with its edits and selection, using a
  restrained expand-and-fade. Motion has no bounce, overshoot, or repeated
  layout movement and respects reduced-motion preferences. Failed durable
  discard or restore leaves or restores the card with friendly recovery
  feedback.
- Closing or replacing the Undo banner, letting it expire, or ending the process
  finalizes that individual discard. Only the latest individual discard is
  undoable.
- `Discard all` remains visually secondary and requires confirmation. Copy uses
  `suggestions`, states the affected count, permanent removal, that the action
  cannot be undone, and that those SMS messages will not be suggested again on
  this device. Confirmed bulk discard has no Undo.
- The full disclosure page is titled `Privacy details` and separates AI
  processing from temporary device-local SMS review storage. It states that the
  original SMS is retained for resumable review for no more than 30 days without
  claiming unverified local encryption.

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
