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

## Newly approved feedback cases — expected behavior; owner QA pending

These are **owner-approved expected behaviors for manual acceptance**, not
assertions of implemented or passed behavior. Consult final PR #396 verification
for the current automated results and owner/device acceptance status; the fixed
Voice catalog does not automatically produce every prerequisite. The 19 fixed
Voice cases remain unchanged. Use an appropriate disposable **TEST**
owner/account context when eligibility matters; if a case is unreachable with
current owned accounts, report the missing prerequisite. **Never delete personal
accounts, change a real default, or reset financial data just to force an empty
account list.**

- [ ] **Existing-account chooser / current eligibility** — Open
      `voice-bank-card-expense-egp` or `voice-shared-bank-ambiguous`; use
      **Change account**. Preselect the previously chosen existing account
      **only if** it remains owned, eligible for this endpoint and consistent
      with the row's currently confirmed currency; never guess the first account
      or preselect a stale/foreign/incompatible account. The chooser may list
      current owned endpoint-eligible accounts **of all currencies** for
      deliberate selection. Choosing a different currency requires explicit
      combined account-and-currency confirmation; cancel retains both original
      choices. Automatic/default matching still requires a **known, matching**
      currency. Actual candidates depend on current owned accounts.
- [ ] **No eligible account / manual row draft** — Use `voice-split-currency`
      (unmatched QNB USD) or `voice-mixed-uncertain` to enter the real account
      chooser; for the _empty same-currency candidate_ branch, use a TEST owner
      genuinely lacking such an eligible account. Other-currency owned choices
      may still appear for explicit combined confirmation, not automatic
      matching. Explicitly prepare a **row-scoped account draft**; preparation
      must not create a persisted account or change any balance. A real account
      can be created only if the draft is confirmed/referenced by a **selected
      Save**. If replacing an already prepared/edited draft while the eligible
      existing-account list is empty, keep that draft editable rather than
      losing it. Cancel must preserve the prior choice/draft. Fixture names
      alone do not guarantee the empty-candidate precondition.
- [ ] **Account first when currency is uncertain or conflicts** — On
      `voice-ambiguous-currency`, `voice-unsupported-xyz`, or
      `voice-split-currency`, choose the account _before_ confirming an
      unconfirmed currency, or choose an account whose currency conflicts with a
      currently known row currency. Require **one explicit combined
      confirmation** displaying the chosen account, currency and proposed
      change. Accept only that confirmed account/currency change; preserve the
      original numeric amount, **do not apply FX**, and retain other independent
      review reasons. Cancel changes neither account nor currency; no silent
      account-first bypass of currency confirmation. Show current owned
      endpoint-eligible accounts across currencies even before currency is
      confirmed; selecting one requires this explicit combined acceptance.
      Eligibility and available currency choices remain current-owner-dependent.
- [ ] **SMS ATM with missing same-currency Cash destination** — **Actual SMS
      Review manual path only, NOT the Voice catalog.** With a genuine eligible
      Bank/Wallet source and no owned eligible Cash destination in the ATM
      currency, prepare a **row-scoped Cash draft**. Confirmation alone creates
      neither Cash nor a transfer. Save only a selected, fully confirmed ATM
      transfer through the existing guarded writer; expected effect is one debit
      from the source and one credit to Cash, with no duplicate effect on
      same-intent retry. If an eligible Cash already exists, this missing-Cash
      branch is not reachable on that profile; report the prerequisite instead
      of deleting or modifying personal data. This fixture guide does **not**
      synthesize SMS, create an SMS namespace, or prove transfer Save.
- [ ] **Owner device responsive acceptance** — On `voice-shared-drafts-qnb-cib`
      and `voice-draft-identity-split`, inspect Confirm/Change/Remove/Undo
      button grouping and accessible touch targets; on
      `voice-absent-evidence-default`, check default-account explanation; on
      `voice-bulk-long-decimals`, scroll **all nine rows**, long labels, partial
      selection and bottom controls; on `voice-arabic-junaih-salary-rent`, check
      Arabic RTL. Repeat with large font, keyboard visible, narrow/wide device,
      light/dark theme and bottom navigation inset. Device screenshots, keyboard
      reachability and owner acceptance require separate owner sign-off; consult
      final PR #396 verification for their current status. A static Voice
      fixture is not device proof.

General own-account transfers in Voice are **deferred**, tracked by
[issue #404](https://github.com/Msg22/Monyvi/issues/404); this checklist adds no
Voice transfer or fabricated SMS fixture. These checks cover post-parsing Review
interactions only where the prerequisites are genuinely present, **not fully
automatic coverage of all possible owner/account states**.

## Automated coverage

- **Historical cd8 baseline only (not the new feedback checks):** Local
  validation previously passed **11 suites / 252 tests**, including launcher,
  catalog, Settings, and both recorder suites; whole-mobile TypeScript, affected
  lint (zero errors), formatting, whitespace, and generated Edge parity also
  passed. That baseline reported no emulator testing and did not establish
  owner/device acceptance. For the **new feedback implementation and checks**,
  consult [final PR #396 verification](https://github.com/Msg22/Monyvi/pull/396)
  rather than treating this historical count as the current result. No new pass
  count or sign-off is asserted here.
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
