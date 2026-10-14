# Feature Specification: Shared account review for Voice and SMS

**Feature Branch**: `codex/395-shared-account-review`

**Created**: 2026-10-14

**Status**: Specified and clarified; final visual bindings pending

**Issue**: [#395](https://github.com/Msg22/Monyvi/issues/395)

**Base**: Targets `main`, pinned at `7838df64eb9b3828c6e8f1a02f590b008d5435fd`,
after [PR #383](https://github.com/Msg22/Monyvi/pull/383) merged. Initially
stacked on its head `c1e6a198422385a59f7e1bf4e5de3191b353e865`; reference images
preserve that provenance.

**Input**: Implement the agreed shared-account confirmation, default-account
assignment and compact review mockups in a separate stacked PR. Add the existing
Edit Account Default control to Add Account. Reuse the existing currency modal
with transaction context. Stop generating mockups and use the existing approved
references and documented adjustments.

## Context and scope

A suggested default account can currently appear on a transaction while
account-review logic still blocks saving. Named accounts that do not exist need
safe, reusable suggestions instead of repeated account creation or confirmation.
Multiple matches and currency uncertainty need explicit choices. Voice and SMS
share the review rules while retaining their source-specific eligibility and
recovery behavior.

The constitution and `docs/business/business-decisions.md` remain governing
sources. This issue changes account review and the explicitly approved Add/Edit
helper/control scope. It does not absorb PR #383's recorder, usage policy or
infrastructure work, #391 silence detection, live-SMS auto-confirm, Voice draft
recovery, account-form migration #393, or unrelated form redesign.

## Clarifications

### Session 2026-10-14

- Q: Should account count limit default fallback? → A: No. Use an eligible
  default when the account is not mentioned and the known currency matches,
  regardless of account count.
- Q: What if currency was not mentioned? → A: Use preferred currency.
  Ambiguous/conflicting currency requires confirmation and prevents automatic
  account assignment until resolved.
- Q: Can accounts be shared across suggested transactions? → A: Yes, with
  compatible explicit account evidence and the same currency; incompatible
  identities/cards/types remain separate.
- Q: Must all suggestions be confirmed together? → A: No. Each draft supports
  independent confirmation/edit/replacement/removal.
- Q: Should Add Account only gain helper copy? → A: No. Add the same Default
  account flag as Edit Account.
- Q: Should Choose another currency introduce a new modal? → A: No. Reuse the
  existing currency modal and retain contextual sub-label such as “For Lunch at
  Talabat.”
- Q: Should more mockups be generated? → A: No. Preserve current images and
  document refinements.
- Q: Where should delivery live? → A: A separate issue, branch and PR stacked on
  `389-voice-usage-limits`, with mockups under this spec folder.
- Q: What changes after #383 merges? → A: Target main and update the new branch
  from latest origin/main before publication.

These record answers already supplied by the owner; no additional questions were
invented or asked by the clarification pass.

## User Scenarios & Testing

### User Story 1 — Accept an eligible default without repetitive review (Priority: P1)

When a Voice or SMS entry does not identify an account, use the user's eligible
default and explain that choice without making every transaction require account
confirmation.

**Why this priority**: Removes the contradictory visible-account/missing-account
experience.

**Independent Test**: Review a batch with no named account, a known matching
currency and an eligible default; save valid selected entries without
account-only warnings.

**Acceptance Scenarios**:

1. **Given** several active accounts and one eligible same-currency default,
   **when** no account is mentioned, **then** assign that default, show the
   neutral disclosure and remove only the account blocker.
2. **Given** an unmatched explicit account, ambiguous currency, a
   different-currency default or no eligible default, **when** review opens,
   **then** require the relevant choice instead of guessing.
3. **Given** Cash is default, **when** an ordinary SMS needs a source account,
   **then** exclude Cash; Voice and eligible ATM destinations retain their
   separate rules.
4. **Given** the user explicitly changes an account, **when** filtering or
   refreshing review data, **then** preserve that choice and update default-use
   counts.

### User Story 2 — Confirm one shared draft independently (Priority: P1)

Suggest one draft account for compatible transactions and let the user confirm
it once, independently of other suggestions.

**Why this priority**: Avoids duplicate accounts and repetitive confirmation
without hiding financial identity conflicts.

**Independent Test**: QNB links three transactions and CIB links one; confirm
QNB once and select/save only one QNB transaction while CIB remains pending.

**Acceptance Scenarios**:

1. **Given** three compatible QNB/EGP entries, **when** QNB is confirmed,
   **then** all three account assignments become confirmed, selections stay
   unchanged and no real account is created yet.
2. **Given** a pending QNB group with visible disclosure, **when** one eligible
   transaction is selected, **then** confirm QNB for its linked group and select
   only the clicked transaction; preserve unrelated review reasons.
3. **Given** multiple suggestions, **when** one is edited/replaced/removed,
   **then** affect only that group, preserving other drafts and all retained
   transactions.
4. **Given** selected rows depend on a removed suggestion, **when** it is
   removed, **then** clear invalid selection, retain account-choice recovery and
   offer Undo without overwriting later user edits.
5. **Given** different currencies, card identities or incompatible account
   types, **when** suggestions have similar names, **then** keep them separate;
   do not silently merge them.

### User Story 3 — Resolve matching and currency uncertainty (Priority: P1)

Choose between matching accounts or confirm a currency without unexpected
group-wide changes.

**Why this priority**: Prevents amounts being saved against the wrong financial
account or currency.

**Independent Test**: Open account choices for one row, cancel without changes,
then confirm a different currency using the existing currency modal.

**Acceptance Scenarios**:

1. **Given** multiple compatible matches, **when** account choice opens,
   **then** show meaningful distinguishing names/currency/provider/card details
   and require explicit selection.
2. **Given** choice opened on one transaction, **when** an account is chosen,
   **then** update only that row; group-menu replacement must instead disclose
   its linked count and affect that group.
3. **Given** EGP and USD are conflicting suggestions, **when** neither is
   correct, **then** Choose another currency opens the existing modal with
   transaction context and no implied confirmation.
4. **Given** one row changes currency, **when** confirmed, **then** preserve its
   numeric amount, detach/regroup that row and leave other transactions and
   persisted account currencies unchanged.
5. **Given** a chooser is cancelled or its account becomes invalid, **when**
   returning to review, **then** retain unresolved state rather than invent a
   choice.

### User Story 4 — Review all conditional states without crowded banners (Priority: P2)

See suggestions and actionable missing details together, with compact default
disclosure and truthful selection counts.

**Why this priority**: Supports the above decisions without making review feel
longer or noisier.

**Independent Test**: Inspect combined, default-only, issues-only,
all-confirmed, clean and empty-filter states.

**Acceptance Scenarios**:

1. **Given** suggestions, missing details and default assignments coexist,
   **when** review renders, **then** use one compact section with independent
   actions and a quiet default note.
2. **Given** default assignment only, **then** show a compact note without an
   empty section heading; **given** none of those conditions, **then** omit the
   section.
3. **Given** many drafts, **when** View all is used, **then** every suggestion
   has independent status/actions in a scrollable list.
4. **Given** actual selection differs from automatic eligibility, **when**
   Selected is filtered, **then** show actual checked rows and matching
   counters.
5. **Given** an empty filter, **then** provide filter-specific recovery, not the
   recorder's no-transactions result state.
6. **Given** bulk-ready selection, **then** select only eligible rows in the
   current filter and preserve unconfirmed groups and unresolved fields.

### User Story 5 — Set the default while adding an account (Priority: P2)

Use the same Default account control on Add and Edit, with clear
source/type-aware explanation.

**Why this priority**: Makes the convenience rule discoverable at account
creation.

**Independent Test**: Create the first account and then a later account with the
default flag off/on; cancel an unsaved toggle change.

**Acceptance Scenarios**:

1. **Given** no active accounts, **when** Add opens, **then** show the
   first-account-default rule; the proposed switch is on and disabled to
   preserve the existing creation rule.
2. **Given** active accounts, **when** a new account's default flag is off,
   **then** preserve the current default or absence of default.
3. **Given** the flag is enabled, **when** Save succeeds, **then** make the new
   account the sole active default and explain which prior default it replaces
   when one exists.
4. **Given** an unsaved form or failed save, **then** toggling/cancelling must
   not change the persisted default.
5. **Given** Cash versus Bank/Wallet, **then** helper copy reflects the SMS
   source exclusion without technical wording.

### User Story 6 — Save and recover safely (Priority: P1)

Create accounts and financial records only for valid selected entries; preserve
review choices after failures.

**Why this priority**: Account suggestions must not introduce duplicate or
partial financial effects.

**Independent Test**: Fail and retry a selected batch; recover an SMS review and
verify account/transaction counts.

**Acceptance Scenarios**:

1. **Given** confirmed but unselected groups, **when** another selected group is
   saved, **then** do not create unused accounts.
2. **Given** valid selected entries and other unresolved unselected entries,
   **when** saving, **then** save the selected entries without forcing every
   suggestion to be confirmed.
3. **Given** a selected write fails, **then** commit no partial selected batch,
   retain choices and expose retry; repeat Save must not create duplicates.
4. **Given** an SMS review restored after restart, **then** preserve its
   approved choices/removals and offer Review later; Voice remains session-only.
5. **Given** ownership, deletion, identity or currency changes, **when** Save
   revalidates, **then** prevent invalid financial writes and surface specific
   recovery.

### Edge Cases

- No default is supported; inconsistent multiple defaults never justify
  arbitrary fallback.
- Account name means nickname; provider identity and card evidence must remain
  distinct. Similar nicknames alone cannot establish identity.
- A merchant is not an account. Unknown/incompatible account type requires
  review, not fabricated metadata.
- Explicit account evidence with no match cannot become the default silently.
  Clearly scoped shared speech context may supply evidence for a group.
- Currency omission differs from ambiguity/conflict; unsupported returned
  currency is not omission.
- ATM bank source and Cash destination resolve independently. Use same-currency
  default Cash or sole same-currency Cash for destination; otherwise ask.
  Ordinary transfer sides remain empty absent reliable endpoint evidence or user
  choice.
- Filtering and individually detaching rows update group counts without changing
  unrelated confirmation or selection.
- Undo cannot override an intervening account/currency edit. A removed
  suggestion must not immediately reappear from unchanged evidence.
- A material draft identity change requires reconfirmation; a currency
  correction cannot inherit a different group's confirmation merely through a
  matching nickname.
- Restored SMS reviews and repeated/chunked results must reconcile shared
  identities and fingerprints; no cross-user draft reuse.
- Preserve existing balance/opening-balance behavior; no AI-inferred bank
  balance or automatic conversion is introduced.
- Small phones, enlarged fonts, RTL, long names, long lists and keyboard-open
  editing must retain accessible reachable actions and runtime safe-area space.

## Requirements

### Functional Requirements

- **FR-001**: Default assignment MUST require no explicit account evidence, an
  eligible active owned account and a known matching currency; account count
  must not restrict it.
- **FR-002**: Accepted default assignments MUST remove the account-only blocker,
  preserve other review reasons and show a neutral disclosure plus editable
  per-row account label.
- **FR-003**: Ordinary SMS source matching MUST exclude Cash; no-default,
  inconsistent-default and incompatible-default cases must remain unassigned
  absent confident matching evidence.
- **FR-004**: Omitted currency MUST use preferred currency;
  ambiguous/conflicting/unsupported currency MUST require confirmation before
  automatic account assignment.
- **FR-005**: Shared suggestions MUST group only compatible explicit
  identity/type evidence with the same confirmed currency, separating
  conflicting cards/accounts.
- **FR-006**: Every suggestion MUST support independent confirm, edit,
  replacement and removal; no mandatory batch confirmation.
- **FR-007**: Group confirmation MUST affect linked account assignment only, not
  select other transactions or create a real account.
- **FR-008**: Direct eligible-row selection MAY confirm its group only with
  visible shared-effect disclosure and feedback; only that row is checked and
  other review reasons remain.
- **FR-009**: Suggestion removal MUST retain transactions, clear invalid
  assignments/selections, avoid implicit default fallback/regeneration and
  provide reversible Undo consistent with later user edits.
- **FR-010**: Account choices MUST distinguish per-row and group scope, show
  only compatible owned active choices, and commit nothing on cancel.
- **FR-011**: Choose another currency MUST reuse the existing currency modal
  with transaction context; no parallel picker/modal. Explicit confirmation
  changes currency interpretation without converting the amount.
- **FR-012**: A row's currency/account override MUST detach/regroup only
  affected rows and preserve unrelated choices; material draft identity edits
  require reconfirmation.
- **FR-013**: One compact review section MUST cover combined suggestions/issues,
  with default-only and clean variants omitting unnecessary containers.
- **FR-014**: Every suggested group MUST be reachable in a complete scrollable
  list with independent actions and persistent readable confirmation status.
- **FR-015**: Filters/counts MUST reflect actual transactions, review reasons
  and checked selections, with distinct filter-empty recovery and ready-only
  bulk selection.
- **FR-016**: Add Account MUST expose the same Default flag pattern as Edit and
  friendly type-aware helper; preserve first-active-account default and at most
  one active default on successful Save.
- **FR-017**: Unsaved flag edits, cancel and failures MUST leave persisted
  defaults unchanged; a later account with flag off preserves any existing
  default or no-default state.
- **FR-018**: Save MUST create only referenced selected draft accounts and
  selected financial records atomically, preserve established financial rules,
  revalidate references and avoid duplicates on retry.
- **FR-019**: SMS durable review, user overrides, fingerprints and Review later
  MUST survive the changed account UI; Voice recovery and live-SMS auto-confirm
  are outside scope.
- **FR-020**: Suggestions and transaction references MUST arrive within the
  original parsing request; confirmation/editing/currency choice MUST not
  trigger an additional parsing call or usage charge.
- **FR-021**: All returned account/group references MUST be validated against
  owned eligible data and evidence; AI grouping alone cannot authorize creation
  or merging.
- **FR-022**: EN/AR, themes, RTL, enlarged text, responsive sizes and
  accessibility MUST preserve approved composition and shared component
  patterns, including bottom inset and keyboard reachability.
- **FR-023**: Existing provider/SMS fields, read-only persisted type/currency
  and balance actions MUST remain; this feature does not redesign unrelated
  account form fields.
- **FR-024**: The feature MUST reside in its own branch/PR/spec based on latest
  main after #383 merged, preserve image bytes and scope-specific approvals, and
  complete Speckit analysis plus approved bindings before implementation
  assignments.

### Key Entities

- **Review transaction**: Parsed entry with stable source identity, currency
  certainty, account evidence/assignment, review reasons and independent
  selection.
- **Shared suggested account**: Temporary identity with name, type, currency,
  provider/card evidence, linked transaction references and confirmation/removal
  state; not a persisted financial account until Save.
- **Account assignment**: Existing match, eligible default, shared draft or
  unresolved choice, retaining origin and explicit user override.
- **Review session**: Collection of entries, groups, filter/selection state and
  source-specific recovery; durable for SMS and session-only for Voice.
- **Default-account intent**: Unsaved account-form choice applied only on
  successful account creation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A compatible group of three transactions requires one account
  confirmation, while selecting one checks exactly one transaction.
- **SC-002**: Each
  combined/default-only/issues-only/confirmed/clean/filter-empty fixture shows
  exactly the required sections and accurate total/review/selected counts.
- **SC-003**: Default assignment cases with one or several accounts save without
  account-only review, and every ineligible/uncertain/evidence-conflict case
  remains protected.
- **SC-004**: Confirm/edit/remove/replace/currency actions cause zero additional
  parsing requests or usage charges.
- **SC-005**: Repeated Save and failed selected batches create zero duplicate
  accounts/transactions and zero partial failed-batch financial effects.
- **SC-006**: First/later/off/on/cancel/failed account-creation scenarios
  preserve the documented default invariant and unsaved-state boundary.
- **SC-007**: All changed deterministic branches have authored unit/integration
  coverage and controllable user journeys have authored E2E coverage; unexecuted
  device/visual/accessibility checks remain explicitly owner-run.
- **SC-008**: Every in-scope visual state has a reference, documented approved
  adjustment or explicit outstanding binding; no worker treats unapproved
  proposals as final authority.

## Assumptions and dependencies

- This feature depends on PR #383's merged behavior and now targets main per the
  owner's later instruction. Refresh/pin main and the feature head again before
  future implementation dispatch.
- New R3 illustrations are awaiting owner approval; earlier R1 retained
  scopes/R2 approval and Arabic wording remain recorded separately. The owner's
  existing-currency-modal instruction overrides R3-04's illustrative picker
  design without image regeneration.
- Planning/branch/issue/PR publication is authorized. Production implementation
  and worker assignments remain gated by final bindings, plan/tasks/analyze and
  the user's requested pre-implementation review.
- No new detector/provider, hosted migration, deployment, main merge or
  automatic account balance inference is included.
- PR #393 independently changes account forms; reconcile its applicable
  shared-field contracts and ownership before touching Add/Edit. Do not copy a
  second dependency tree or silently absorb that PR.
- Existing currency modal may need additive context/unselected-confirmation
  support; that is existing-component adaptation, not permission to build
  another modal.
- Exact response and SMS persistence contracts are technical planning work. Any
  necessary schema/backfill or new financial policy returns to owner approval
  before execution.
