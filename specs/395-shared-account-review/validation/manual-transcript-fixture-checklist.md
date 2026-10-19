# Manual Review-Transcript Fixture Checklist (#395)

Status: **manual acceptance pending Mohamed's run** (owner: Mohamed). Automated
status is tracked in the PR checks; see "Automated coverage" below for the
current reference point.

Scope: the dev-only "Voice transcript fixtures" page under Settings →
Development tools. It opens the **existing, unchanged** `/voice-review` route
with fixed spoken transcripts, so the real guarded Save path runs. No provider
request, microphone, or Gemini call is made.

## Safety note (owner-approved)

- Every mapped note and counterparty is prefixed `[TEST]`, suggested accounts
  begin `TEST`, and setup-created accounts are labeled `TEST …` so QA rows are
  obvious in the transactions list.
- **A real Save writes real rows to the current owner's WatermelonDB.** If you
  pick an ordinary owned account (or the global default via an absent-evidence
  row), its balance and net worth change. Always review the account chip before
  saving; use the `TEST` accounts for repeatable checks.

## Prepare

1. Run a development build (`__DEV__` true, `NODE_ENV !== "production"`).
2. Settings → Development tools → Voice transcript fixtures.
3. Tap **Prepare test accounts** once. Expected roles:
   - `TEST Bank` — BANK / EGP, provider `QNB`
   - `TEST Card Bank` — BANK / EGP, provider `TEST Card Bank`, card `1234`
   - `TEST Wallet` — DIGITAL_WALLET / USD, provider `TEST Wallet`
   - `TEST Shared` — BANK / EGP, provider `TEST Shared`, card `1111`
   - `TEST Shared 2` — BANK / EGP, provider `TEST Shared`, card `2222`
   - An eligible existing owned BANK/EGP account with provider `QNB` is
     **reused** instead of always creating `TEST Bank`, so that role may report
     "already exists" on a normal account.
   - With zero accounts: blocked with "add an account first"; nothing created.
   - Second run: all roles reported "already exists"; no duplicates.
   - New accounts open at balance `0`, `defaultIntent: false`; default and
     preferred currency are untouched.

## Fixture map (19)

| Fixture                           | Case                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `voice-bank-expense-egp`          | Exact `TEST Bank`, EGP                                                                                         |
| `voice-wallet-expense-usd`        | Exact `TEST Wallet`, USD                                                                                       |
| `voice-bank-card-expense-egp`     | Card isolation: card `1234` → `TEST Card Bank`, never `TEST Bank`                                              |
| `voice-cash-expense-egp`          | Explicit Cash evidence, account unresolved                                                                     |
| `voice-preferred-omission-egp`    | Omitted currency → preferred currency                                                                          |
| `voice-absent-evidence-default`   | No account evidence → global default only                                                                      |
| `voice-mixed-uncertain`           | Ready row + low-confidence row + ambiguous-currency row                                                        |
| `voice-ambiguous-currency`        | Unconfirmed (`ambiguous`)                                                                                      |
| `voice-unsupported-xyz`           | `XYZ` literally mentioned, unconfirmed (`unsupported`)                                                         |
| `voice-arabic-junaih-groceries`   | 3 Arabic rows, explicit `جنيه`, all known EGP                                                                  |
| `voice-arabic-junaih-salary-rent` | Arabic INCOME + EXPENSE, explicit `جنيه`                                                                       |
| `voice-arabic-junaih-fuel-mobile` | 3 Arabic rows, explicit `جنيه`                                                                                 |
| `voice-en-mixed-expense-income`   | 4 EN rows, 2 INCOME + 2 EXPENSE                                                                                |
| `voice-bulk-long-decimals`        | 9 rows, 2-decimal amounts, scroll/long list                                                                    |
| `voice-shared-drafts-qnb-cib`     | Combined states, 6 rows: 3 share `TEST NEW QNB`, 1 `TEST CIB`, 1 absent-evidence default, 1 ambiguous currency |
| `voice-split-currency`            | Same provider (QNB) EGP exact, QNB USD unresolved, wallet USD exact                                            |
| `voice-shared-bank-ambiguous`     | Two safe prerequisite banks, same provider, distinct suffixes → ambiguous candidates                           |
| `voice-wallet-draft`              | Independent wallet draft suggestion                                                                            |
| `voice-draft-identity-split`      | Same-named `TEST NEW CARD` split into 3 groups by card `1111`, card `2222`, and USD currency                   |

Notes:

- The combined-shared fixture must show **exactly two** pending draft groups;
  `TEST NEW QNB` links exactly three rows, `TEST CIB` exactly one. Its
  absent-evidence row auto-links the global default **only when the default is a
  compatible EGP account**; otherwise it stays unresolved (`account_needed`).
  Its ambiguous row stays unresolved (`currency_confirmation_needed`).
- The identity-split fixture must show **three** pending groups, one linked row
  each, and currencies EGP, EGP, USD with no invented account IDs.
- Arabic rows must show known **EGP** with grounded `جنيه` spans, not an
  unconfirmed currency.
- `voice-split-currency` row 2 must stay unresolved: QNB evidence is EGP-only,
  so a USD QNB row has no eligible account.

## Currency/preferred-default dependency

- Omitted-currency and absent-account fixtures follow the **current** preferred
  currency and the **current** global default. Outcomes change if those change.
- If no default exists (or defaults are inconsistent), absent-evidence rows stay
  unresolved (`account_needed`) instead of picking an account.

## Per-fixture steps

1. Tap **Open in review**.
2. Confirm the existing voice review screen opens (no new screen) with `[TEST]`
   notes/counterparties.
3. Check row count/type/amount, currency state, account chip, and highlighted
   transcript spans; confirm Arabic rows are RTL.
4. For `TEST` targets only, Save and verify the transaction lands on the
   expected account and only that balance/net worth moves.
5. Back, reopen a fixture, and confirm a freshly saved `TEST` draft account is
   now matched as an existing account on relaunch (the hook reloads context
   before launch).
6. The screen itself makes no provider call. For a quota-free relaunch, return
   to the catalogue without tapping the real Review "Try again", which opens the
   actual recorder.

## Automated coverage

- Final local validation passed: 11 suites / 252 tests, including launcher,
  catalog, Settings, and both recorder suites; whole-mobile TypeScript, affected
  lint (zero errors), formatting, whitespace, and generated Edge parity all
  passed. Exact-head CI awaits publication; manual/device acceptance remains
  pending. No emulator testing was performed.
- `__tests__/services/review-transcript-fixtures-launcher.test.ts`: scenario
  grounding over all fixtures with the real normalizer/resolver, `[TEST]`
  labels, fresh request keys/session per launch, global in-flight and
  owner-change refusal, dev/prod gate, card-suffix role matching, setup
  idempotence and blocked outcomes.
- `__tests__/app/review-transcript-fixtures.test.tsx`: dev-only route gate,
  catalog launch delegation, `/voice-review` handoff payload via a real
  canonical session helper.
- `__tests__/components/settings/DevelopmentToolsSettingsSection.test.tsx`:
  dev-only link visibility and callback.
- No unit test covers device rendering, RTL layout, or the native Save write.

## Manual-only

- SMS, provider, and microphone behavior are manual-only; this catalog neither
  calls a provider nor opens the mic.
- Voice transfers are unsupported by ordinary Voice review.
- Save effects, balance moves, and prepared-account idempotence in a real
  database remain manual sign-off items.

## Sign-off

- [ ] Entry hidden outside a dev build
- [ ] Prepare idempotent, no duplicates, refuses on empty profile, blocks while
      a launch is in flight
- [ ] All 19 fixtures open the existing voice review route
- [ ] Arabic known-EGP, currency/card isolation, mixed currencies, 9-row bulk,
      exact shared-draft membership, and the 3-group identity split match this
      guide
- [ ] Save writes only to the expected account with correct balances
