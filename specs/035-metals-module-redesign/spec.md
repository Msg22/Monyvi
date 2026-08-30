# Feature Specification: Metals Module Redesign

**Feature Branch**: `codex/035-metals-module-redesign`
**Created**: 2026-08-25
**Status**: Approved V1 product contract; all eight normal-flow visual candidates approved and promoted; Slice 2 implementation is partially complete, with T013, T015, and T017 still implementation-pending; later slices remain planned only
**Input**: User description: "Redesign Metals V1 as a connected, trustworthy, offline-capable experience spanning Home, portfolio, rates, holding details, lifecycle actions, permanent history, and transparent profit/loss."

## Clarifications

### Session 2026-08-25

- Q: When two devices submit incompatible financial actions? → A: V1 uses a server-authoritative first-complete-valid-server-accepted guard, never client timestamps or LWW. A stable action_id plus expected financial revision enters an atomic server CAS; repeat delivery is idempotent. The winning complete action applies once; a losing optimistic action and linked account effect are reversed exactly once, affect no financial reporting, and are not normal History. Lock financial actions while reconciliation is incomplete.
- Q: Approve the complete ten-item checklist decision package and the associated calculation, synchronization, net-worth, correction-warning, and accessibility contracts? → A: Approved all as specified: hidden non-effective Delete evidence; classified Other disposal; dirty-form protection; state-based action priority; canonical formulas and precision; same-currency fees; incomplete reconciliation gating; honest active-holding counts; blocked dismissal during local submission; and the authorized trust, sync, net-worth, and accessibility outcomes.
- Q: After normal currency display rounding, how may authoritative combined P/L differ from the sum of individually displayed attribution components? → A: Option B — preserve full internal precision, sum before rounding, and half-even rounding; use normal currency display precision; allow at most two minor units of difference solely from rounding; show a visible understandable explanation; and never add a hidden balancing component.

### Session 2026-08-28

- Q: Which Home wealth-breakdown concept is approved? → A: Concept C. Add an isolated pair of equal-width Accounts and Metals summary tiles below the existing net-worth total, titled `Where your money is`. Each tile shows an explicit share of net worth; a compact nested footer shows Gold and Silver as explicit shares of Metals. Rates remain separate and excluded from wealth. Preserve equivalent light and dark versions.

### Session 2026-08-29

- Q: What metals are in V1? → A: V1 supports and displays Gold and Silver only. The app is not in production and has no existing Platinum or Palladium user data. Do not define compatibility, migration, read-only, aggregate, filter, card, state, copy, or acceptance behavior for other metals.
- Q: What Home illustration is canonical after narrowing the scope? → A: Accounts are EGP 1,062,237.75 (85.4% of net worth); Gold is EGP 162,317.87 (89.5% of Metals); Silver is EGP 19,108.30 (10.5% of Metals); Metals are EGP 181,426.17 (14.6% of net worth); net worth is EGP 1,243,663.92.
- Q: Is the corrected 02 My Metals proof approved? → A: Yes. My Metals is fully approved with the Gold/Silver-only data, corrected values, Variant B portfolio hierarchy, Variant A holding-card/list treatment, Monyvi-supplied realistic holding visuals, plain rates wording, and no retired-metal behavior.
- Q: Is 04 Live Rates an approved redesign target? → A: No. 04 is rejected, retired, and noncanonical. Preserve the existing `/live-rates` route, visual appearance, layout, and visual patterns. Limit Live Rates work to Gold/Silver/currency scope reconciliation and truthful fresh, stale-over-24-hours, offline-cached, refreshing, and refresh-error-with-cache behavior and copy; retain the Home entry point, source disclosure, and real refresh behavior.
- Q: Is the 2026-08-29 section-level Correct-details activation model still valid? → A: No. It is superseded by one lower-friction `Edit holding` form: every active field is immediately editable except visible locked Metal type. No separate purchase entity or journey exists.
- Q: What happens in the final lower-friction Edit holding form? → A: Compare edits with persisted original values. Name/notes-only changes use `Save changes` directly with no correction reason or intermediate step. Any material-field difference shows its persisted and current values inline, reveals required Correction reason, and shows a compact live `What will change` summary of only affected facts and consequences. `Save changes` is the one primary action and atomically commits all metadata and material corrections from the same form. Restoring every material field to its original value removes the previous-value cues, summary, and reason requirement while preserving metadata changes. Wrong metal remains `Delete holding` then Add the correct holding. Delete and Undo retain their focused confirmation sheets. Sell and No Longer use live consequence disclosure with direct commit actions. Reconciliation is automatic and has no user-choice review.
- Q: What is the late-flow approval state? → A: 12 direct No Longer and 14 Delete are approved; 13 is retired/superseded/noncanonical. Corrected proofs 15 History, 16 Sold detail, 17 Disposed detail, and 18 Restore holding are approved. Screen 19 remains backlog/noncanonical and defines no V1 behavior or implementation.

### Session 2026-08-30

- Q: Is the active V1 normal-flow visual approval phase complete? → A: Yes. The approved candidates are Home Concept C proportional summary, 02 My Metals, 03 Active holding detail, 05 Add holding live-preview form, 08 Edit holding live-preview form, 14 Delete holding confirmation, 15 History, and 17 Disposed holding detail. Their canonical files are promoted. Screen 19 remains backlog/noncanonical. Deferred responsive, accessibility, localization, loading, empty, error, offline, stale-rate, synchronization, and recovery-state proofs remain deferred in their recorded scope.
- Q: What synchronization policy is approved for V1? → A: Retain multi-device access. Ordinary independently replaceable metadata may use WatermelonDB LWW. Add, material correction, Sell, No Longer, Delete, Undo, and linked account effects use a stable action_id, expected financial revision, one idempotent atomic local action group, and one atomic server CAS/RPC. The first complete valid server-accepted action wins; rejected optimistic effects reconcile exactly once. Client time and LWW never choose competing grouped financial actions.
- Q: What exact-arithmetic implementation is approved? → A: Metals is the first adopter of one shared `@monyvi/logic` Decimal.js primitive configured for 50 significant digits and half-even rounding. Canonical decimal strings, WatermelonDB text, PostgreSQL numeric, and currency minor units form the storage/posting contract. Issue #241 owns broader app audit and staged migration; feature 035 does not perform a big-bang conversion.
- Q: What purity catalog is approved? → A: Use versioned Gold/Silver catalog version 1 recorded in `docs/business/business-decisions.md`. Each holding stores a stable catalog code, catalog version, and exact factor snapshot. A bare `24K = 1.0` option is forbidden.
- Q: Are single-device sessions or broader authentication hardening part of Metals V1? → A: No. Multi-device access remains. App lock, MFA or step-up, device/session management, sign-in notifications, and SecureStore logout hardening are deferred to issue #240.
- Q: Is Zakat part of Metals V1? → A: No. Zakat remains a separate future module and no pending Zakat decision blocks feature 035.
- Q: What prerequisite applies to optional sale account credit? → A: Issue #242 is mandatory for sale account credit, Undo of an actually credited sale, and account compensation/replacement credit. Those capabilities remain disabled until #242 passes its revision/CAS, writer-guard, sync, cutover, and regression contract. Sale without credit, uncredited Undo, and unrelated Metals work continue.
- Q: What is the approved Add Holding flow? → A: Use one focused full-screen form with Gold/Silver selection; required name, weight, purity, total purchase price, purchase currency, and purchase date; visible optional physical form and notes; a compact live preview; and direct `Add holding`. Add holding commits from the same form after validation and required acknowledgment.
- Q: How do Add and Edit holding stay consistent? → A: Use the same field order, spacing, standard form colors, and responsive packing. Weight and Purity share a row when space permits; fields that need more room stay full width. Both forms keep the complete form visible and update a compact live preview without forcing another step.
- Q: What is the current Add/Edit visual status? → A: Approved and canonical. Add uses one full form with compact live preview and direct `Add holding`. Edit uses the same full form order with locked Metal, conditional Correction reason, live `What will change`, and direct `Save changes`.
- Q: What is the current status of the six purity-consistency candidates? → A: Approved and canonical. Home Concept C, 02, 03, 14, 15, and 17 use exact `24K · 999` identity and reconciled values.
- Q: What action/outbox architecture is approved? → A: Use one generic owner-scoped financial-action root/outbox and generic immutable account-effect protocol for transactions, transfers, recurring payments, SMS, and Metals. Metals keeps holding-specific lifecycle/rate evidence linked by the same stable action_id; it MUST NOT introduce a competing Metals-only account outbox.
- Q: What is the exact #242 gate? → A: #242 is a separate immediate prerequisite lane. Only sale account credit, Undo of an actually credited sale, and account compensation or replacement credit are gated. Sale without credit, uncredited Undo, and unrelated Metals work continue in parallel.
- Q: How does the mixed-version account cutover work? → A: Fail closed. Direct authenticated writes to account balance and financial revision are protected. Legacy unsynced financial rows are drained, migrated, or explicitly quarantined before enforcement; a client without action ID, payload hash, and expected revision cannot overwrite protected fields. Existing accounts backfill revision 0 without fabricated historical actions. Because the app is not in production, verification uses safe test/developer fixtures and makes no production-user assumption.
- Q: What delivery topology is approved? → A: Planning; exact Metals domain; #242 prerequisite; Metals persistence/reconciliation; portfolio surfaces; holding experience; Add/Edit; terminal lifecycle; integration/quality. The 2026-08-31 clarification authorizes isolated local branches/worktrees and one stable local foundation commit after Slice 2 reviews; it never authorizes a Metals push, pull request, or GitHub mutation.

### Session 2026-08-31

- Q: What immutable rate-reference contract applies to Metals V1? → A: Use discriminated observed references with role and kind. Gold/Silver only use `metal:GOLD`/`metal:SILVER`; approved ISO currencies use `currency:<MetalsIsoCurrencyCode>`; BTC is excluded. Roles, unit/orientation matrix, USD identity, raw-provenance retention, one-time canonical normalization, freshness semantics, and stable unavailable-reason codes are defined in [`rate-reference-contract.md`](./contracts/rate-reference-contract.md). Future `068_metals_domain` CHECK constraints enforce that matrix; no unavailable-reason column is approved.
- Q: How is lifecycle ownership reduced? → A: A pure DB-neutral reducer returns the last safe projection or `null`, accepted immutable events, and rejected immutable events with stable reason codes. It validates structural causality for `effective`, `ineffective`, and `incomplete` evidence; only one valid causal chain owns a holding. Valid reversal references must both identify the current Sold/Disposed head. Equal-time causality never yields to ID-based CAS selection. Details and recovery exclusion rules are defined in [`reconciliation-contract.md`](./contracts/reconciliation-contract.md).
- Q: What local Git activity is authorized? → A: After Slice 2 reviews, one stable local foundation commit and isolated local branches/worktrees are authorized. No Metals push, pull request, or other GitHub mutation is authorized.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understand Metals and Rates at a Glance (Priority: P1)

As a user, I want Home, the Metals portfolio, and Live Rates to form one connected experience so I can understand the value of my metal savings, the rates behind it, and where to go next without confusing portfolio ownership with market information.

**Why this priority**: This is the primary daily-use journey and establishes whether every financial value can be trusted.

**Independent Test**: Populate fresh, stale, missing-rate, empty, and mixed-metal states, then verify that Home provides separate portfolio and full-rate entry points and that each destination preserves the same facts and trust state.

**Acceptance Scenarios**:

1. **Given** Home opens, **When** current net worth is available, **Then** its existing header, greeting, net-worth hero, sections, cards, bottom navigation, tokens, spacing language, and theme behavior remain intact, with one compact nested breakdown added directly below the existing net-worth total. The breakdown shows Accounts and Metals as shares and amounts of total net worth; Metals is subdivided into Gold and Silver. The breakdown and a separate compact Rates section remain distinct.
2. **Given** the user selects an Accounts or Metals breakdown row, **When** its destination opens, **Then** it navigates to that module; selecting See all rates opens Live Rates. Metals defaults to All holdings and presents current value, performance since purchase when trustworthy, profit or loss from sold metals when trustworthy, allocation, recent history, and rate freshness without presenting market rates as owned assets.
3. **Given** the user selects the rates action, **When** Live Rates opens, **Then** the user can inspect the complete supported Gold, Silver, and fiat-rate view and request a real refresh.
4. **Given** both Gold and Silver active holdings exist, **When** the user changes the portfolio filter, **Then** All, Gold, and Silver views show the corresponding holdings while All remains the initial state on each new visit.
5. **Given** no active holdings exist but terminal history does, **When** Metals opens, **Then** the screen offers Add Holding while preserving access to Sold and Disposed history.
6. **Given** the user owns only Gold or only Silver, **When** Home opens, **Then** the snapshot reports the owned metal's count and a zero count for the other metal without implying ownership from displayed market rates.
7. **Given** the same financial state is viewed in light and dark themes, **When** the user scans Home, Metals, Live Rates, detail, or history, **Then** financial hierarchy, trust state, and action priority remain equivalent with accessible contrast.

---

### User Story 2 - Add a Gold or Silver Holding (Priority: P1)

As a user, I want a focused full-screen flow for recording a physical Gold or Silver holding so its cost, physical facts, and later performance are accurate.

**Why this priority**: The portfolio has no value unless users can safely create trustworthy holdings.

**Independent Test**: Add Gold and Silver holdings with English, Arabic-Indic, and decimal-comma input while online and offline, then verify the saved facts, validation, live preview, direct submission, and resulting portfolio totals.

**Acceptance Scenarios**:

1. **Given** the user starts Add Holding, **When** they complete Name, Metal, Weight and Purity, total purchase price, purchase currency, purchase date, optional Physical form, and optional Notes, **Then** the same full form shows a compact live preview, local-first status, chosen catalog purity and normalized factor before direct `Add holding`.
2. **Given** the purchase included workmanship, dealer premium, or another purchase cost, **When** the user enters Purchase price, **Then** the flow explains that the value is the total amount paid, including those costs.
3. **Given** the user enters optional physical form or notes, **When** the holding is saved, **Then** those details appear on its detail screen without changing valuation rules.
4. **Given** an unusually large but supported weight or monetary amount, **When** the user submits the form, **Then** the same form shows an explicit unusual-value warning and requires acknowledgment rather than silently accepting it, applying a currency-blind hard cap, or opening a separate review route.
5. **Given** the device has no network connection, **When** valid holding facts are saved, **Then** the holding is immediately available locally, survives restart, and can synchronize later without blocking the user.
6. **Given** no valid rate is available, **When** the user saves a valid holding, **Then** the facts are preserved and any valuation or attribution that cannot be supported is shown as unavailable rather than invented.
7. **Given** the user enters weight, purity, money, or rate-supported values, **When** the live preview and final result are calculated, **Then** entered or posted money obeys currency minor units while derived valuation and attribution values preserve full internal decimal precision until final presentation.

---

### User Story 3 - Inspect a Holding and Its History (Priority: P1)

As a user, I want a detail view for every holding so I can understand its physical facts, acquisition cost, current or terminal status, valuation, profit/loss, and permanent lifecycle history.

**Why this priority**: Detail and history are the trust surface for every correction and terminal action.

**Independent Test**: Open Active, Sold, Disposed, and restored-Active holdings whose terminal events were reversed, then verify that each shows the correct facts, available attribution, actions, and immutable ordered history.

**Acceptance Scenarios**:

1. **Given** an active Gold or Silver holding, **When** its row is selected, **Then** detail shows identity, a Monyvi-supplied illustrative holding render plus text identity, physical facts, acquisition facts, current value when available, performance since purchase, rate age, and lifecycle history.
2. **Given** a Sold or Disposed holding, **When** its history row is selected, **Then** detail shows the terminal status and facts, excludes it from active value and performance since purchase, and retains its complete timeline.
3. **Given** lifecycle events exist, **When** the user opens History, **Then** All is selected by default and Sold and Disposed filters are available.
4. **Given** more lifecycle events exist than fit in the recent summary, **When** the user selects View all, **Then** the complete history is available in reverse chronological order.
5. **Given** a value has a detailed profit/loss explanation, **When** the user expands attribution, **Then** the relevant metal, currency, premium/cost, sale-difference, and fee components use normal currency display precision; their displayed sum may differ from authoritative combined P/L by at most two minor units solely because of rounding, with a visible understandable explanation and no balancing component.
6. **Given** an Active holding has no pending or unresolved conflict, **When** actions are announced or presented, **Then** Sell is the principal lifecycle action, Edit is ordinary, Dispose is consequential, and Delete is exceptional and destructive; for a Sold or Disposed holding, Undo is the primary recovery action and metadata Edit remains ordinary.

---

### User Story 4 - Edit a Holding or Correct Active Facts (Priority: P1)

As a user, I want harmless edits to be simple and material corrections to be deliberate so I can fix mistakes without silently rewriting financial history.

**Why this priority**: Incorrect cost or physical facts corrupt portfolio and profit/loss reporting, while unrestricted edits undermine auditability.

**Independent Test**: In one Edit holding form, edit each allowed active field without activation, combine metadata and material changes, restore every material field to original values, attempt a type change, and attempt terminal-fact edits; verify inline before/current facts, live consequences, dynamic direct-save behavior, atomic commit, locked-metal, and recovery paths.

**Acceptance Scenarios**:

1. **Given** any active or terminal holding, **When** the user opens Edit holding, **Then** Basic information exposes editable name and notes. For an active holding, weight, purity, physical form, total purchase price, purchase currency, and purchase date are immediately editable, while Metal type is visible and locked; no separate purchase entity or journey is presented.
2. **Given** the user changes only name or notes, **When** they save, **Then** `Save changes` commits the ordinary metadata edit directly with no correction reason or intermediate step.
3. **Given** an active holding has any material-field difference from its persisted original values, **When** Edit holding is displayed, **Then** each changed field shows its persisted previous value and current value inline, required Correction reason is revealed, and a compact live `What will change` summary contains only changed facts and their specific valuation, portfolio, profit/loss, reference, or snapshot consequences; there is no separate correction-review route or action.
4. **Given** every material field is restored to its persisted original value, **When** metadata changes remain or are edited, **Then** previous-value cues, `What will change`, and Correction reason are hidden and the ordinary `Save changes` action remains without discarding those metadata changes.
5. **Given** an active holding changes only physical form, **When** it remains in Edit holding, **Then** the live summary shows `Physical form: {{previousPhysicalForm}} → {{currentPhysicalForm}}`, `Current value stays {{amount}}.`, `Your {{profitOrLoss}} since purchase stays {{amount}}.`, `The holding image and description will update.`, and `This correction will appear in History.`
6. **Given** metadata and material changes are both present, **When** the user selects `Save changes`, **Then** all changes validate and commit atomically in one complete outcome, with corrected current calculations and a permanent correction entry.
7. **Given** the user edits a holding, **When** they inspect metal type, **Then** Gold/Silver identity is locked.
8. **Given** an active holding has the wrong metal type, **When** the user asks how to fix it, **Then** the experience directs them to Delete holding on the incorrect active record and Add the correct holding; V1 does not create a replacement state or linked replacement record.
9. **Given** a Sold or Disposed holding, **When** the user attempts to change physical, acquisition, sale, disposal, or reversal facts, **Then** those terminal financial facts remain immutable and the user is directed to Undo before making a new correct action.

---

### User Story 5 - Sell a Whole Holding (Priority: P1)

As a user, I want to record selling an entire holding, including fees and optional account credit, so ownership, proceeds, and realized performance remain accurate without treating principal as ordinary income.

**Why this priority**: A portfolio that cannot record an exit cannot provide truthful current ownership or lifetime performance.

**Independent Test**: Sell a complete holding with and without fees and same-currency account credit, online and offline, then verify active totals, history, attribution, account balance, analytics exclusion, and atomic failure behavior.

**Acceptance Scenarios**:

1. **Given** an active holding, **When** the user chooses Sell, **Then** the flow makes clear that V1 sells the whole holding and does not offer a partial weight.
2. **Given** the user enters sale date, sale amount, sale currency, optional fees, notes, and optional account credit, **When** any of those facts changes, **Then** the editable sale form updates its live `What will happen` summary with net proceeds, realized profit/loss, Sold status, exact account effect or no-account effect, exclusion from ordinary/budget income and earned cashflow, and the History entry; fees use sale currency without a separate currency choice.
3. **Given** an optional fee is entered, **When** realized performance is calculated, **Then** the fee is shown separately and deducted from realized performance.
4. **Given** trustworthy acquisition and sale references exist, **When** attribution is expanded, **Then** metal movement, currency movement, purchase premium/cost, difference between actual sale price and reference value, and fees reconcile to authoritative realized P/L under the approved normal-display-precision rounding contract.
5. **Given** a matching eligible default account exists, **When** the sale currency is selected, **Then** account credit is enabled and that account is preselected; the user can disable credit or choose another matching eligible account.
6. **Given** only accounts in another currency are available, **When** the user considers account credit, **Then** V1 does not perform an automatic conversion, clears any mismatched selection after a currency change, and allows the sale to be recorded without an account credit.
7. **Given** the sale succeeds locally while offline, **When** the user returns to Metals, **Then** the holding is Sold, no longer contributes active value, and remains in permanent history.
8. **Given** any part of the sale or linked account credit cannot be completed safely, **When** confirmation fails, **Then** neither the terminal transition nor the account balance effect is partially applied.
9. **Given** issue #242 is not merged and verified, **When** the user records a sale, **Then** optional account credit is unavailable while the sale remains recordable without it.

---

### User Story 6 - Dispose of a Whole Holding Without a Sale (Priority: P1)

As a user, I want to mark an entire holding as no longer owned for a non-sale reason so loss, damage, gifts, and donations are not misrepresented as sales.

**Why this priority**: Ownership and performance are wrong if non-sale exits are deleted or counted as sale proceeds.

**Independent Test**: Dispose active holdings under every category and verify active totals, history, write-off/external-transfer reporting, optional notes, and exclusion from realized sale P/L.

**Acceptance Scenarios**:

1. **Given** an active holding, **When** the user chooses Dispose, **Then** they must select Lost or stolen, Destroyed or damaged, Given away, Donated, or Other, may add notes, and must also select Record a loss or Record it as moved out when choosing Other.
2. **Given** a No Longer form is ready to submit, **When** its live `What will happen` summary is shown, **Then** it shows the selected reason and treatment, removal from active ownership, permanent History retention, no sale money or account effect, and no profit or loss from a sale before direct `Record change`.
3. **Given** the user selects Lost or stolen or Destroyed or damaged, **When** `Record change` completes, **Then** the holding leaves active ownership, its cost is reported as a separate write-off outcome, and it does not enter realized sale P/L.
4. **Given** the user selects Given away or Donated, **When** `Record change` completes, **Then** the holding leaves active ownership as an external transfer and does not enter realized sale P/L or ordinary income.
5. **Given** `Record change` completes offline, **When** the app restarts, **Then** the terminal state and history remain available and can synchronize later.
6. **Given** Other is selected, **When** the user has not selected Record a loss or Record it as moved out, **Then** `Record change` is blocked; once selected, the outcome uses that reporting meaning and still creates no proceeds, ordinary income, or realized sale P/L.

---

### User Story 7 - Delete an Incorrect Active Record (Priority: P1)

As a user, I want to delete a holding that should never have been recorded so I can remove a data-entry mistake without creating fake financial activity.

**Why this priority**: Delete, Sell, and Dispose have materially different financial meanings and must not be interchangeable.

**Independent Test**: Delete a fresh active mistake and attempt deletion in terminal states; verify confirmation, removal, totals, history, and prohibited paths.

**Acceptance Scenarios**:

1. **Given** an active holding was entered by mistake, **When** the user chooses Delete, **Then** confirmation states that the record will be removed and that Delete is not a sale or disposal.
2. **Given** deletion is confirmed, **When** Metals reloads, **Then** the record and its creation or correction timeline are absent from all user-visible portfolio, detail, and normal History views and create no proceeds, profit/loss, write-off, or external-transfer outcome, while hidden non-effective audit and synchronization evidence prevents the mistake from reappearing or affecting calculations.
3. **Given** a Sold or Disposed holding, **When** the user opens its actions, **Then** Delete is unavailable and Undo is the recovery path.

---

### User Story 8 - Undo a Sale or Disposal Without Erasing History (Priority: P1)

As a user, I want to reverse an incorrect terminal action so ownership can be restored while the original event remains auditable.

**Why this priority**: Terminal facts are immutable; reversal is the safe correction mechanism.

**Independent Test**: Undo sales with and without account credit and every disposal type after different elapsed times; verify restoration, linked balance reversal, permanent event history, and all-or-nothing failure behavior.

**Acceptance Scenarios**:

1. **Given** a Sold or Disposed holding, **When** the user selects Undo and confirms the consequence, **Then** a reversal event is appended, the original terminal event remains visible, and the same holding returns to Active.
2. **Given** the original sale credited an account, **When** the sale is reversed, **Then** the linked account effect is reversed in the same completed action and no ordinary-income analytics are created.
3. **Given** the terminal event occurred in the past, **When** the user opens history, **Then** Undo remains available without a time limit.
4. **Given** linked financial effects cannot be reversed safely, **When** Undo is attempted, **Then** ownership and account balance remain unchanged and the user receives a clear recovery explanation.
5. **Given** the user needs to correct immutable sale or disposal facts, **When** Undo completes, **Then** they may record a new correct terminal action from the restored active holding.

---

### User Story 9 - Keep Trust When Rates or Historical Data Are Incomplete (Priority: P1)

As a user, I want my actual holdings to remain visible when rates or historical references are stale or missing so the app never invents performance or mistakes unavailable valuation for an empty portfolio.

**Why this priority**: Silent zeroes, fabricated attribution, or disappearing holdings are unacceptable in a financial product.

**Independent Test**: Exercise fresh, more-than-24-hour stale, missing-current, missing-historical, refresh-failure, and restart states and verify visibility, warnings, acknowledgments, unavailable values, and preserved facts.

**Acceptance Scenarios**:

1. **Given** the latest valid cached rate is more than 24 hours old, **When** a financial screen opens, **Then** values remain available with the rate age and a clear stale warning.
2. **Given** stale rates contribute to values shown during a financial action, **When** the final consequence disclosure is shown, **Then** they explicitly acknowledge the stale-rate warning before submitting; factual metadata edits do not require that acknowledgment.
3. **Given** a refresh fails but a valid cached rate exists, **When** the screen settles, **Then** cached values remain visible, the failed refresh is communicated, and retry remains available.
4. **Given** no valid current rate exists, **When** Metals opens, **Then** holdings and recorded facts remain visible while current value, affected totals, trends, and profit/loss show unavailable rather than zero or empty.
5. **Given** a required acquisition or terminal reference is missing, **When** profit/loss is displayed, **Then** only a combined result that can be derived without assumptions is shown; unavailable attribution is explained and no current rate is substituted for historical data.
6. **Given** a sale or disposal changes current ownership, **When** dashboard history is viewed, **Then** previously recorded daily snapshots are not retroactively rewritten; current and future views reflect the lifecycle event.

---

### User Story 10 - Confirm Actions Once and Recover Safely (Priority: P1)

As a user, I want every Add, Edit, Sell, Dispose, Delete, and Undo submission to make progress and outcome clear so repeated taps, retries, or temporary failures cannot duplicate or lose financial facts.

**Why this priority**: Ambiguous submission state can create duplicate lifecycle events or make users abandon carefully reviewed financial data.

**Independent Test**: For each supported submission, delay completion, repeat confirmation, force a failure, and retry; verify progress, duplicate prevention, explicit outcome, retained facts, and one resulting action.

**Acceptance Scenarios**:

1. **Given** a valid Add, Edit, Sell, Dispose, Delete, or Undo is submitted, **When** completion is pending, **Then** visible progress is shown and another confirmation cannot start a duplicate action.
2. **Given** the same confirmation or retry is delivered more than once, **When** processing completes, **Then** the user sees one resulting holding change, lifecycle event, and account effect at most.
3. **Given** the submitted action succeeds, **When** completion is known, **Then** explicit success feedback identifies the completed outcome and the destination reflects it.
4. **Given** the submitted action fails, **When** recovery is offered, **Then** entered and reviewed facts remain available, the failure is explained in plain language, and retry does not require re-entering unchanged facts.
5. **Given** two devices submit incompatible financial actions, **When** the server accepts one complete valid action first, **Then** that canonical action appears once in History and the losing optimistic action plus linked account effect is safely reversed once without financial reporting or normal-History effect.
6. **Given** the user has changed an Add, Edit, Sell, or Dispose flow, **When** they attempt to leave it, **Then** they choose Keep editing or Discard changes; returning from review to the form preserves input, while an untouched flow exits immediately.
7. **Given** local financial submission is pending, **When** the user attempts Back, gesture dismissal, Cancel, or another confirmation, **Then** exit and duplicate submission are blocked and progress is visibly and accessibly announced until local success or failure.
8. **Given** an incomplete synchronized financial group affects a holding, **When** the user views it, **Then** the last complete state remains effective, the incomplete group is recovery-visible but financially ineffective, and new material or lifecycle actions remain unavailable until recovery completes.
9. **Given** concurrent material corrections, **When** reconciliation runs, **Then** server CAS selects one complete valid action and reverses the losing optimistic group once; no field merge or LWW occurs.
10. **Given** an action group remains incomplete after restart or repeated synchronization, **When** recovery is available, **Then** background and user-requested retry remain durable and idempotent, the group never silently expires, disappears, or becomes effective, and actionable recovery remains visible.
11. **Given** reconciliation is incomplete, **When** the user opens the holding, **Then** financial actions are locked and `Try sync again` remains available.
12. **Given** an action is locally complete but not yet synchronized, **When** its outcome is shown, **Then** the completed local result remains usable and is distinguished from synchronization status without being presented as failed or remotely complete.

### Edge Cases

- A current-rate record exists but one required metal or currency value is zero, negative, non-finite, or otherwise invalid; affected values are unavailable and the screen remains usable.
- Rates become stale while a screen or confirmation flow is already open; the freshness label updates and stale acknowledgment is required before a financial confirmation.
- A consumed metal or FX value has an unknown or unparseable provider observation time; its freshness is Unknown, never Fresh, and the financial review identifies the affected input.
- Purchase and sale use different currencies but one historical conversion reference is missing; the event facts persist while unsupported combined or detailed P/L remains unavailable.
- A holding has valid physical facts but its preferred display currency rate is missing; the holding stays visible in its recorded currency and converted totals are unavailable.
- Arabic-Indic digits, Arabic decimal marks, decimal commas, and supported thousands separators normalize to the same reviewed numeric value.
- A user-facing karat or fineness choice has no valid normalized purity factor in `(0, 1]`; confirmation is blocked and no valuation uses an inferred or free-text purity.
- Blank, zero, negative, non-finite, unsupported-precision, and out-of-safe-range values are rejected with field-specific recovery guidance.
- A fee is negative or greater than gross proceeds; submission is blocked until corrected or the user chooses No Longer when no sale money exists.
- A sale fee is entered in a different currency from proceeds; no separate fee-currency choice is available and the fee is interpreted and reviewed only in proceeds currency.
- Other is selected without Write-off or External transfer meaning; confirmation remains blocked while notes remain optional.
- A purchase, sale, or disposal date is in the future, or a terminal date precedes acquisition; submission is blocked with a clear explanation.
- Two devices change the same material facts while disconnected; server CAS accepts one complete valid action and reverses the losing optimistic group once, with no merge or LWW.
- An incomplete linked lifecycle, correction, or account-credit group arrives from synchronization; it remains recovery-visible and financially ineffective, and blocks new material and lifecycle actions until the complete group is safely available.
- An incomplete action group survives repeated retry or restart; it remains durable and recoverable, never silently expires, discards members, or becomes financially effective.
- Two offline devices submit competing financial actions; server CAS keeps one complete valid action canonical and reverses the losing optimistic group exactly once.
- An incomplete reconciliation group keeps financial actions locked and exposes Try sync again until validated.
- Synchronization pull or push fails; the failure remains visible, is never reported as empty success or completion, and advances no synchronization watermark or completion state.
- A linked sale converts metal ownership into same-currency account cash; global net worth counts the effective value once, never as both active metal and cash and never as ordinary income.
- A linked account is unavailable by the time Sale or Undo is confirmed; the complete action fails safely without a partial ownership or balance change.
- The user signs out or changes identity while a financial flow is open; no facts from one user appear in or are written for another user.
- The app closes during Add, correction, Sale, Dispose, Delete, or Undo; either the confirmed action is complete or no partial financial state is visible after restart.
- An unconfirmed Add, Edit, Sell, or Dispose flow is terminated by the operating system; V1 does not promise draft recovery after restart, while confirmed actions remain governed by all-or-nothing recovery.
- Confirmation is tapped repeatedly or retried after an uncertain response; only one user-visible outcome and one set of financial effects may result.
- Weight, purity, money, or rate inputs sit at their supported precision boundaries; calculations preserve all supported decimal digits, perform no intermediate rounding, sum before half-even rounding, and display normal currency precision. Individually displayed components may sum to at most two minor units above or below authoritative combined P/L solely because of rounding; the difference is explained visibly and understandably without a hidden balancing component.
- A consequential confirmation opens; focus stays within it, background content and actions are unavailable, initial focus avoids destructive confirmation, pre-submit dismissal restores the trigger, and an operational failure receives focus and announcement.
- A background refresh fails while the user works elsewhere; status updates without stealing focus. A user-requested refresh failure is announced and leaves retry reachable.
- Two history events share the same displayed time or arrive out of synchronization order; full event time, causal ordering, and a stable immutable tie-breaker produce the same newest-first order on every device.
- A holding has missing valuation facts; the state is partial or missing data, never partial ownership. Ownership remains Active, Sold, or Disposed according to the last effective lifecycle event.
- Large text, compact screens, tablets, landscape, RTL, and reduced-motion settings preserve readable facts, complete actions, and accessible destructive confirmations.
- Light and dark themes preserve equivalent financial hierarchy and meet accessible text and meaningful non-text contrast.

## Requirements _(mandatory)_

### Functional Requirements

#### Connected Experience and Navigation

- **FR-001**: Home MUST preserve its existing header, greeting, net-worth hero, existing sections/cards, bottom navigation, theme behavior, tokens, and spacing language. It MUST add approved Concept C directly below the existing net-worth total: an isolated pair of equal-width Accounts and Metals summary tiles titled `Where your money is`, based only on contributors in the authoritative current calculation. In the current product those contributors are Account balances and the current value of AssetMetal holdings. Source tiles MAY open Accounts and My Metals. The compact Rates section remains separate and its See all rates action MUST open Live Rates.
- **FR-002**: Concept C MUST show Accounts and Metals as both amounts and explicit `{{share}} of net worth` shares, distinguish them without double counting, and avoid duplicating full Accounts or Metals module content. A compact footer nested within Metals MUST show Gold and Silver as explicit `{{share}} of Metals` shares. Sale proceeds credited to an account remain part of Accounts only; P/L, sale proceeds reporting, budgets, transactions, write-offs, transfers, and daily snapshots MUST NOT appear as extra Home wealth sources. Market-rate information MUST remain outside the net-worth breakdown and never imply ownership.
- **FR-003**: The Metals landing screen MUST default to the All filter and offer Gold and Silver filters. Each filter MUST expose its selected state, accessible name, current result count, and explicit empty-result meaning.
- **FR-004**: The Metals landing screen MUST provide the Variant B open top portfolio summary with the Variant A holding-card/list treatment: active portfolio summary, available performance since purchase, profit or loss from sold metals, allocation, Add Holding, recent lifecycle history, and access to complete history.
- **FR-005**: Complete History MUST default to All and offer Sold and Disposed filters. Each filter MUST expose its selected state, accessible name, current result count, and explicit empty-result meaning; events MUST use the deterministic newest-first ordering contract.
- **FR-006**: Live Rates MUST preserve the existing `/live-rates` visual appearance, layout, route, and visual patterns while showing supported Gold, Silver, and fiat-rate information, its age, connectivity/refresh state, and a real refresh action. It MUST NOT implement the retired 04 visual redesign.
- **FR-007**: Navigation among Home, Metals, Live Rates, holding detail, and history MUST preserve consistent values, selected currency, and trust state for the same underlying facts.

#### Holding Creation, Display, and Validation

- **FR-008**: Users MUST be able to create Gold and Silver holdings in one focused full-screen form ordered as Name, Metal, Weight and Purity, total purchase price, purchase currency, purchase date, Physical form, Notes, compact live preview, local-first status, then direct `Add holding`. Weight and Purity MUST share a row when available width and text scale permit. Creation MUST NOT require or offer a separate review route.
- **FR-009**: Creation MUST require a name, metal type, positive weight, a supported user-facing purity choice expressed as karat or fineness as applicable, positive total purchase price, purchase currency, and non-future purchase date. The live preview and detail MUST show the chosen purity label and its normalized purity factor.
- **FR-010**: Purchase price MUST mean the total amount paid, including workmanship, dealer premium, and other purchase costs.
- **FR-011**: Physical form and notes MUST be optional, visible without expansion in both Add and active Edit holding, and MUST NOT change the valuation formula.
- **FR-012**: The product MUST accept and correctly normalize supported English and Arabic numeric notation while displaying the normalized value in the same form and its live preview.
- **FR-013**: Numeric validation MUST reject values that are blank, non-finite, non-positive where positivity is required, outside the safe supported range, or exceed three decimal places for weight, six decimal places for normalized purity factor `p`, the selected currency's minor-unit precision for entered or posted money, or the supplied precision of a rate reference.
- **FR-014**: Unusually large but supported weight or monetary values MUST trigger a deliberate in-form warning and acknowledgment before direct submission instead of an arbitrary currency-blind domain rejection or separate review route.
- **FR-015**: A confirmed local creation MUST be visible immediately, survive restart, and remain usable without waiting for network replication.
- **FR-016**: Every holding detail MUST use the approved Variant A composition and show its identity, status, Monyvi-supplied illustrative holding render plus text identity, physical facts, acquisition facts, available valuation, applicable performance, rate age, and ordered lifecycle history.
- **FR-017**: V1 MUST support and display Gold and Silver holdings only.

#### Editing and Corrections

- **FR-018**: V1 MUST provide one complete `Edit holding` form, not separate Edit Details or purchase-correction routes. It MUST preserve the Add form's field order, spacing, responsive packing, and standard form treatment; make name, notes, weight, purity, physical form, total purchase price, purchase currency, and purchase date immediately editable for an active holding; and keep Metal type visible and locked. Weight and Purity MUST share a row when available width and text scale allow, while fields needing more room remain full width; the layout MUST reflow without changing field order. For Sold or Disposed holdings, Edit holding remains limited to name and notes. There is no separate purchase entity or journey.
- **FR-019**: Edit holding MUST compare each editable field with its persisted original value. Name/notes-only edits MUST show ordinary `Save changes` with no Correction reason or intermediate step. Any material-field difference—weight, purity, physical form, total purchase price, purchase currency, or purchase date—MUST show the persisted previous and current values inline, reveal required Correction reason, and show a compact live `What will change` summary containing only changed facts and exact consequences. Financial-field edits MUST recalculate current value and since-purchase profit/loss consequences from trustworthy local facts and rates; stale, unknown, or unavailable references MUST remain explicit and MUST NOT invent a value. Physical-form-only summary MUST use `Physical form: {{previousPhysicalForm}} → {{currentPhysicalForm}}`, `Current value stays {{amount}}.`, `Your {{profitOrLoss}} since purchase stays {{amount}}.`, `The holding image and description will update.`, and `This correction will appear in History.`. If every material field returns to its persisted original value, the inline previous-value cues, summary, and Correction reason MUST hide while ordinary `Save changes` remains without discarding metadata edits. `Save changes` is the single primary commit action and MUST commit from the same form.
- **FR-020**: A material-dirty `Save changes` action MUST apply the same validation, unusual-value warning, stale/unknown-rate acknowledgment, dirty-exit, and locked-Metal rules as any prior preview path; prevent duplicate submission; atomically save all metadata and material corrections; preserve original and corrected facts as immutable history/audit evidence; update current results and append an immutable correction entry to the holding's history; apply all required valuation and linked-account consequences; and report accurate local-first success or failure. No intermediate Edit route may weaken these requirements. Separate confirmation sheets remain required only for Delete and Undo; Sell and No Longer commit from their live consequence summaries, and reconciliation is automatic with no user-choice review.
- **FR-021**: Metal type MUST be locked after creation.
- **FR-022**: Correcting the wrong metal identity in V1 MUST use Delete on the incorrect active record followed by Add of the correct holding; V1 MUST NOT create a replacement state or linked replacement record.
- **FR-023**: Physical, acquisition, sale, disposal, and reversal facts MUST be immutable after a holding becomes terminal.
- **FR-024**: Correcting terminal financial facts MUST require Undo followed by a new correct terminal action.

#### Whole-Holding Lifecycle

- **FR-025**: Sell and Dispose MUST apply to the whole active holding in V1; partial weights and partial ownership MUST NOT be offered.
- **FR-026**: Sell MUST provide one editable sale form requiring a non-future date that is not before acquisition, positive sale amount, and sale currency, while allowing optional fees, notes, and account credit. It MUST show a live `What will happen` summary when sale amount, currency, fee, or account choice changes.
- **FR-027**: Sale fees MUST use the proceeds currency with no separate fee-currency choice, be non-negative and no greater than gross proceeds, be displayed separately, and be deducted to produce net proceeds and realized P/L.
- **FR-028**: The live sale summary immediately above `Record sale` MUST show net proceeds, realized profit/loss, Sold status, exact selected-account net-credit effect or no account change, exclusion from ordinary income, budget income, and earned cashflow, and History effect. It is the complete pre-action consequence disclosure. After validation and required acknowledgments, `Record sale` MUST commit directly with no confirmation sheet, review route, or second confirmation.
- **FR-029**: A completed sale MUST remove the holding from active value and unrealized P/L, add it to permanent Sold history, and include it in lifetime realized sale P/L when trustworthy.
- **FR-030**: The `Receive money in` account credit is optional and may credit exact net sale proceeds only to an account whose currency matches sale currency. When an active eligible matching default account exists, it MUST be preselected with credit enabled; mismatched defaults MUST never be selected or auto-converted. Changing sale currency MUST revalidate and clear a mismatched selection and MAY preselect the eligible matching default. Sale account credit, Undo of a credited sale, and account compensation or replacement credit MUST remain disabled until issue #242 satisfies its revision/CAS, writer-guard, sync, cutover, and regression contract. Sale without credit and Undo of a sale that created no account effect MUST remain available.
- **FR-031**: An account credit MUST be linked to the sale, classified as asset-sale proceeds, and excluded from ordinary income, budget-income, and earned-cashflow analytics while still increasing the selected account balance.
- **FR-032**: Cross-currency automatic account credit MUST NOT be offered in V1; the sale MUST remain recordable without account credit.
- **FR-033**: No Longer MUST provide exactly `Lost or stolen`, `Destroyed or damaged`, `Given away`, `Donated`, and `Other`, with optional notes and valid date. Known loss/stolen/destroyed/damaged reasons auto-map to loss treatment; Given away/Donated auto-map to moved-out treatment. Only Other shows `Record a loss` / `Record it as moved out`; known reasons are not classified twice.
- **FR-034**: Loss treatment MUST say purchase cost is recorded as a loss, with no sale money or account credit; it removes active ownership and records the write-off internally.
- **FR-035**: Moved-out treatment MUST say the holding leaves active metals with no sale profit/loss or account change; it records external transfer internally without proceeds or ordinary income.
- **FR-036**: Live `What will happen` above direct `Record change` MUST show only affected treatment, ownership, sale-money/account, sale-profit/loss, and History consequences. After validation/acknowledgment, direct Record change is atomic, local-first, idempotent, history-preserving, and undoable with no Review route or second confirmation.
- **FR-037**: Delete MUST be available only for an incorrect Active record and MUST require confirmation that it creates no sale, disposal, proceeds, P/L, write-off, or transfer outcome. After confirmation, the record and its full creation, correction, and deletion timeline MUST be absent from all user-visible portfolio, detail, and normal History views, while that full timeline remains hidden non-effective audit and synchronization evidence and MUST never affect ownership, counts, allocation, net worth, P/L, or other financial reporting.
- **FR-038**: Delete MUST be unavailable for Sold and Disposed holdings.
- **FR-039**: Each locally confirmed Add, Edit, Sale, Dispose, Delete, Undo, and reconciliation outcome MUST be all-or-nothing; no partial local holding facts, ownership, history, proceeds, or balance effect may remain after local failure.

#### History and Reversal

- **FR-040**: Creation, Sold, Disposed, correction, and reversal events for retained holdings MUST be preserved permanently in an ordered user-visible holding timeline and MUST NOT be overwritten by later actions. Reversal is an event whose effective outcome restores the holding to Active; Reversed is not a holding state. Delete of an incorrect Active record is the sole V1 visibility exception: its full creation, correction, and deletion timeline becomes hidden non-effective audit and synchronization evidence rather than normal user-visible History.
- **FR-041**: Sold and Disposed holdings MUST remain accessible from history after they leave the active portfolio.
- **FR-042**: Undo MUST remain available for a Sold or Disposed holding without a time limit.
- **FR-043**: Undo MUST append a reversal event, preserve the original terminal event, restore the same holding to Active, and recompute current results from restored ownership.
- **FR-044**: Undo of a sale with account credit MUST reverse the linked account effect in the same completed action and MUST NOT create ordinary-income analytics.
- **FR-045**: If a linked effect cannot be reversed safely, Undo MUST leave both ownership and account balance unchanged and provide actionable recovery guidance.

#### Valuation, Profit/Loss, and Rate Trust

- **FR-046**: Metal rates MUST mean USD per pure gram, and each currency factor MUST mean the USD value of one unit of that currency, with USD equal to one. A supported user-facing karat or fineness choice MUST deterministically provide a normalized purity factor `p` in `(0, 1]`; for pure grams `q = weight × p`, metal rate `m_t`, and currency factor `x_{C,t}`, the metal reference value in currency `C` at time `t` MUST equal `q × m_t ÷ x_{C,t}`. Missing or invalid purity and rate inputs MUST NOT be inferred or treated as zero.
- **FR-047**: Active holdings MUST contribute to current value and unrealized P/L; Sold and Disposed holdings MUST NOT.
- **FR-048**: Trustworthy unrealized P/L MUST compare current market value with the total purchase price actually paid.
- **FR-049**: Trustworthy realized sale P/L MUST compare net sale proceeds after fees with the total purchase price actually paid.
- **FR-050**: The holding's purchase currency `P` MUST be the canonical calculation and reporting basis. With acquisition time `a`, current or terminal valuation time `v`, and all-in purchase cost `K`: acquisition reference `A = q × m_a ÷ x_{P,a}`; valuation reference `V = q × m_v ÷ x_{P,v}`; metal movement `= q × (m_v - m_a) ÷ x_{P,a}`; currency movement `= q × m_v × (1 ÷ x_{P,v} - 1 ÷ x_{P,a})`; and purchase-cost component `= A - K`. Unrealized P/L MUST equal those three additive components and therefore `V - K`. For a sale at time `s`, `v` MUST equal `s`; with gross proceeds `G`, fees `F`, and proceeds currency `S`, canonical gross proceeds `G_P = G × x_{S,s} ÷ x_{P,s}`, canonical fees `F_P = F × x_{S,s} ÷ x_{P,s}`, sale-difference component `= G_P - V`, and fee component `= -F_P`; realized P/L MUST equal metal movement plus currency movement plus purchase-cost component plus sale-difference component plus fee component and therefore `G_P - F_P - K`.
- **FR-051**: Preferred-currency presentation MUST convert every canonical purchase-currency combined value and attribution component at current display time `d`. For preferred currency `D`, a canonical amount `Y_P` MUST display as `Y_P × x_{P,d} ÷ x_{D,d}` using the same current observed FX basis for the combined result and all components, without changing canonical historical facts.
- **FR-052**: Attribution MUST be collapsed by default and expandable on demand without hiding the combined result or its trust state.
- **FR-053**: A valid cached rate MAY be used for current display regardless of network connectivity.
- **FR-054**: Freshness for every consumed metal and FX input MUST be measured from that provider value's observation timestamp. A value older than 24 hours MUST be labeled stale with its age; local fetch, storage, or synchronization time MUST NOT make it fresh.
- **FR-055**: When stale or unknown-freshness rates contribute to values shown in a financial action, the final consequence disclosure before submission MUST require explicit acknowledgment identifying the affected inputs; purely factual metadata edits MUST NOT require it.
- **FR-056**: A failed refresh with valid cached data MUST retain that data, communicate the failure, and offer retry.
- **FR-057**: Missing or invalid current rates MUST preserve holdings and recorded facts while marking affected values, totals, trends, and P/L unavailable rather than zero, empty, or crashed.
- **FR-058**: Missing historical acquisition or terminal references MUST never be replaced with current rates, invented snapshots, or a later value retroactively presented as a historical observation.
- **FR-059**: When detailed attribution is unavailable, the product MUST show a combined result only if it can be derived from recorded facts without assumptions and MUST explain that the breakdown is unavailable.
- **FR-060**: Recording a lifecycle event MUST affect current and future portfolio views without retroactively rewriting previously recorded daily dashboard snapshots.

#### Offline, Identity, Accessibility, and Responsive Quality

- **FR-061**: Home, Metals, Live Rates, detail, History, Add, Edit, Sell, Dispose, Delete, Undo, and reconciliation guard MUST satisfy their deterministic screen/state obligations for loading, empty, populated, stale, unknown-freshness, missing or partial data, error, offline, pending-local, local-complete, synchronized, incomplete-group, and reconciled states where applicable.
- **FR-062**: Confirmed holding and lifecycle actions MUST complete against local user data first, remain usable offline, survive restart, and synchronize later without blocking the user.
- **FR-063**: Data from another signed-in identity MUST never influence visible holdings, rates-derived calculations, history, actions, account credit, or synchronization.
- **FR-064**: A user change while a financial flow is open MUST cancel or reject the stale action without writing data for either identity.
- **FR-065**: Every user-visible string MUST be available in English and Arabic, with natural financial terminology and locale-appropriate number, currency, date, weight, purity, and relative-time formatting. Mixed-direction content MUST isolate and keep signs, amounts, currency codes, per-unit labels, weights, purities, dates, account names, and user-entered holding names semantically associated in both languages without changing their value or sign.
- **FR-066**: Every screen and confirmation MUST support left-to-right and right-to-left layout without changing financial meaning, chronology, logical reading order, focus order, semantic action priority, or the relationship between a value and its label. Directional navigation cues MAY mirror, but numeric direction, signs, event chronology, and action meaning MUST remain unchanged.
- **FR-067**: Every action MUST be operable by touch, keyboard, switch control, screen-reader activation, and supported external input, with visible focus and no gesture-only requirement. Interactive targets MUST be at least 44 by 44 logical pixels, MUST NOT overlap, MUST provide sufficient semantic and physical separation to prevent adjacent consequential actions from being mistaken for one another, and MUST expose clear role, label, value, state, and consequence to assistive technology.
- **FR-068**: Profit, loss, trust, stale, terminal, Gold, and Silver identity states MUST use text or another non-color cue and MUST NOT rely on color or metal-themed decoration alone.
- **FR-069**: All journeys MUST remain complete on compact phones, ordinary phones, tablets, portrait, landscape, and text enlarged to 200% without clipped financial facts, truncated required consequences, or unreachable actions. Reduced-motion mode MUST remove nonessential motion while preserving progress, disclosure, success, failure, and state-change meaning through non-motion cues.
- **FR-070**: Loading financial content MUST use structured placeholders that preserve layout and MUST NOT temporarily display zero values as real data.
- **FR-071**: Every feature state MUST have complete light- and dark-theme parity, preserve equivalent financial hierarchy and action priority, meet at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful non-text information, and remain understandable without color alone.
- **FR-072**: No Longer live summary MUST show selected category/treatment, active-ownership removal, permanent History, no sale money/account effect, and no sale profit/loss before direct Record change, without exposing internal classification jargon.
- **FR-073**: In the Add live preview and before material correction, Sell, and No Longer submission, the product MUST capture and preserve every available acquisition or terminal rate reference and its provenance: numeric value, unit and orientation, provider observation time, source identity, source-reported quality or validity, and resulting freshness. Each unavailable provenance fact MUST remain explicitly Unknown; observation, receipt, storage, refresh, and synchronization times MUST remain distinct.
- **FR-074**: The product MUST preserve and evaluate metal-input and FX-input freshness separately; an unknown or unparseable provider observation timestamp MUST produce Unknown freshness and MUST never be presented as Fresh.
- **FR-075**: Financial live previews, consequence summaries, and attribution details MUST show and preserve the distinct age, source, and quality of each consumed metal and FX reference so one fresh input cannot conceal another stale or unknown input.
- **FR-076**: Add, Edit, Sell, Dispose, Delete, Undo, and reconciliation submissions MUST show visible progress, prevent duplicates, and block exit while pending.
- **FR-077**: Repeated confirmation, delivery, background retry, user-requested retry, or replay of the same user action MUST be idempotent and produce at most one canonical holding transition, lifecycle event, and linked account effect.
- **FR-078**: Every submitted action MUST provide explicit success feedback; failure MUST preserve entered and reviewed facts, explain recovery in plain language, and permit a safe retry without re-entering unchanged information.
- **FR-079**: An incomplete reconciliation action group remains recovery-visible but ineffective in financial reporting or normal History until complete valid grouped activation.
- **FR-080**: V1 financial reconciliation MUST use stable action_id plus expected financial revision and an atomic server compare-and-swap. The first complete valid server-accepted action is canonical; repeats are idempotent. Never choose by client timestamp or LWW.
- **FR-081**: Combined P/L in purchase currency MAY be shown only when a positive known all-in purchase cost and every required current or terminal conversion fact support the result without assumptions. Missing, zero, or ambiguous cost MUST make P/L unavailable rather than implying a free acquisition; detailed attribution MUST remain unavailable without the required historical references.
- **FR-082**: Undo MUST finish by visibly restoring the same holding to Active before the user may record a corrected terminal event. V1 MUST NOT hide that Active state behind an automatic or atomic replacement action.
- **FR-083**: Weight MUST preserve at most three decimal places and normalized purity factor `p` at most six decimal places. User-entered money and amounts posted to an account or ledger MUST use the selected currency's minor units without requiring typed trailing zeroes. Derived valuations, conversions, attribution components, P/L, and reporting metrics MUST retain full internal decimal precision through calculation and MUST round only at their defined final presentation or posting boundary. Rate references MUST preserve supplied decimal precision.
- **FR-084**: All valuation, conversion, attribution, P/L, proceeds, fee, account, and net-worth calculations MUST use decimal arithmetic with at least 34 significant decimal digits, MUST NOT use binary floating-point arithmetic for financial results, and MUST perform no intermediate rounding.
- **FR-085**: Each canonical component MUST be calculated at full internal precision without intermediate rounding, components MUST be summed before rounding, and authoritative combined P/L MUST be rounded once using half-even rounding to normal display precision for its currency. Individually displayed components MUST use that same normal currency display precision; their displayed sum MAY differ from authoritative combined P/L by at most two minor units solely because of rounding. Whenever a difference exists, the product MUST show a visible, understandable explanation and MUST NOT add or alter any component as a hidden balancing amount.
- **FR-086**: Full-screen Add, Edit holding, Sell, and No Longer MUST preserve entered input through live preview, validation, acknowledgment, and local submission feedback without a separate review route. Attempting to exit an untouched flow MUST exit immediately; attempting to exit after any user change MUST require Keep editing or Discard changes.
- **FR-087**: Semantic action priority MUST be state-based without prescribing layout. For an eligible Active holding, Sell MUST be the principal lifecycle action, Edit holding ordinary, Dispose consequential, and Delete exceptional and destructive. For Sold or Disposed holdings, Undo MUST be the primary recovery action and Edit holding remains limited to Basic information; prohibited, pending, incomplete, conflicted, and material actions MUST be unavailable with an explanation.
- **FR-088**: Losing optimistic financial actions and linked account effects MUST be reversed exactly once; rejected candidates affect no ownership, portfolio, P/L, account, net worth, allocation, snapshot, or normal History. Field merges and winner-changing are backlog.
- **FR-089**: While grouped reconciliation is incomplete, lock financial actions. Show `Checking changes` — `This holding changed on another device. We’re checking the holding and account before showing the final result.` Offer `Try sync again` only if incomplete.
- **FR-090**: A synchronization pull or push failure MUST remain an explicit failure, MUST NOT be reported as successful empty changes or completed synchronization, MUST NOT advance any synchronization progress marker or watermark, and MUST NOT mark pending local work as synchronized.
- **FR-091**: Global net worth MUST derive only from effective owned assets and account balances, never from reporting metrics. Add MUST begin contributing an Active holding's trustworthy current value; material correction MUST replace only its current contribution; Delete and Dispose MUST remove its current contribution without adding P/L, write-off, transfer, or disposal metrics as wealth; Undo MUST restore the holding contribution and reverse any linked account effect in the same complete outcome; Sale without account credit MUST remove the metal without inventing tracked cash; and Sale with account credit MUST atomically replace the metal contribution with account cash without an intermediate double count or zero count. Incomplete or conflicted candidates MUST contribute nothing beyond the last effective state. Realized or unrealized P/L, sale proceeds reporting, write-offs, transfers, and attribution components MUST never be added separately to net worth, and no action may rewrite earlier daily snapshots.
- **FR-092**: Financial totals, P/L, rate provenance and trust, unavailable values, lifecycle status, conflict state, and destructive consequences MUST expose coherent spoken summaries rather than disconnected numeric fragments. Opening a full-screen flow MUST establish predictable focus entry. A consequential confirmation MUST contain focus, make background content and actions unavailable, initially focus its heading or least consequential safe action rather than destructive confirmation, allow accessible pre-submit dismissal, and restore focus to its trigger. Validation MUST focus an error summary and then the first invalid field. Operational submission failure MUST receive focus and announcement with recovery; completion MUST focus or announce the outcome and destination. Background refresh failure MUST update status without stealing focus, while user-requested refresh failure MUST be announced and leave retry reachable.
- **FR-093**: Each supported Gold or Silver purity choice MUST have one canonical user-facing karat or fineness label as applicable and one deterministic normalized purity factor `p` in `(0, 1]` used by every valuation, review, correction, history, and P/L calculation. Exact catalog maintenance and authoritative mapping-source selection belong to planning, but V1 MUST never accept ambiguous free-text purity or calculate from a label without its declared factor.
- **FR-094**: Every balance-changing domain MUST use one generic owner-scoped financial-action root/outbox containing stable action_id, immutable payload hash, domain/type, expected/server financial revisions, durable state/outcome, and ownership/linkage evidence. Generic immutable account effects link to that root. Metals lifecycle, holding, reporting, and rate-reference evidence remains domain-specific and links by action_id. Grouped sync activates only a complete valid root plus required domain evidence; a competing Metals-only account outbox is forbidden. Schema/protocol changes require approval before implementation.
- **FR-095**: Incomplete action groups MUST remain durable across restart and synchronization, support idempotent background and user-requested retry, and retain `Try sync again` recovery until complete. They MUST NOT silently expire, appear successful, or become effective because time passed.
- **FR-096**: After reconciliation, show `Holding changed on another device` — `Another change was saved first. We kept it and safely removed this device’s pending change.` Action: `View holding`.
- **FR-097**: Local-complete MUST mean every required local domain effect is valid, durable, effective, and safe after restart; Synchronized MUST mean that complete outcome has also been accepted by remote synchronization. User-facing status MUST distinguish pending local completion, local-complete awaiting synchronization, synchronization failure, incomplete remote group, and conflict without making remote completion a prerequisite for local use or presenting local completion as synchronization.
- **FR-098**: History MUST sort canonical effective events by full recorded event time newest first; rejected reconciliation candidates are not normal History. When times are equal, a causal successor such as reversal precedes the event it reverses.
- **FR-099**: Every surface MUST implement all applicable obligations in the following screen/state matrix without prescribing component choice or layout.

- **FR-100**: Default-path user-facing copy MUST use plain language. Active-holding performance MUST say `{{signedAmount}} since purchase`, Sold performance MUST say `{{amount}} profit from sold metals` or `{{amount}} loss from sold metals`, and rate status MUST say `Rates updated {{dateTime}}` when a provider observation time is available. Internal models, calculations, audit records, and APIs MAY retain precise terms such as unrealized or realized P/L, but those terms MUST NOT be the default visible labels.
- **FR-101**: Each holding row MUST show `Bought {{date}}` only when a purchase date is recorded. When absent, it MUST show no purchase-date label, placeholder, or empty reserved line. Holding Detail MUST use `How this value was calculated` for the expandable calculation explanation rather than a rate or P/L jargon label.
- **FR-102**: The destructive visible action, its confirmation title, confirmation button, and accessible name MUST say `Delete holding`. Its confirmation body MUST say `Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.` Delete remains unavailable for Sold or Disposed holdings and its existing hidden-audit, no-financial-effect contract remains unchanged.
- **FR-103**: Monyvi MUST supply a consistent realistic illustrative holding-render library keyed by supported metal and recorded physical form or shape. Gold/Silver coin and bar forms MUST use their matching render; a matching known jewelry form MAY use its matching render. An unsupported form or shape MUST use a clear neutral fallback. Users MUST NOT upload photos in V1. The render is illustrative, not valuation evidence, and MUST never be the sole cue for metal, form, status, or accessibility identity.
- **FR-104**: The Home breakdown, Metals landing, holding rows, and Holding Detail MUST use the approved selected-direction composition: Home uses Concept C—an isolated equal-width Accounts/Metals tile pair titled `Where your money is`, with compact nested Gold/Silver footer—below its existing total without redesigning or replacing the existing Home composition, and keeps Rates separate; Metals uses the Variant B top portfolio summary plus Variant A holding-card/list style; Holding Detail uses Variant A with the plain-copy, Delete holding, and holding-render requirements above. Concept C MUST have equivalent light- and dark-theme versions.

| Surface | Required states and obligations |
| --- | --- |
| Home net-worth breakdown and Rates | Existing Home composition preserved; one compact nested breakdown directly below net-worth total; Accounts and Metals amounts/shares; Gold-only, Silver-only, and mixed Metals nested amounts/shares; no holdings/no history; fresh, stale, unknown, missing, refresh-failed, and offline rate trust; optional Accounts and Metals destinations plus separate Live Rates destination; equivalent light/dark composition; no double counting, duplicated module content, or ownership inferred from rates. |
| Metals landing | Loading; no active/no history; no active/with History; populated and filter-empty results; fresh, stale, unknown, missing, error, and offline valuation; incomplete/conflicted recovery state; active value and reporting metrics never conflated. |
| Live Rates | Loading; fresh, stale, unknown, missing, refreshing, background-refresh failure, user-refresh failure, and offline cache; observation/source/quality meaning and retry remain available. |
| Holding detail | Active, Sold, Disposed, restored Active after reversal event, incomplete-group, conflicted, missing-data, loading, error, and offline; facts, effective state, provenance, action priority, and recovery remain explicit. |
| History | Loading, empty, populated, filter-empty, error, offline, reversal, and deterministic tied-time order; All, Sold, and Disposed expose selected state and accessible counts. Rejected reconciliation evidence remains internal audit-only and incomplete groups appear only on recovery surfaces, never as normal History events. |
| Add and Edit holding/correction | Initial, untouched, dirty, invalid, unusual-value warning, stale/unknown acknowledgment, missing-reference, pending-local, local-complete, synchronization-pending, failure, success, offline, and termination-without-draft-recovery. Edit holding exposes every allowed active field immediately; any material difference reveals inline previous/current values, a reason, and live affected consequences; restoring all material fields removes those correction cues and returns to ordinary metadata save; mixed changes commit atomically; validation, acknowledgment, submission, and exit contracts remain intact without a correction-review route. |
| Sell and No Longer | Eligible, invalid, live-consequence, stale/unknown acknowledgment, missing-reference, pending-local, local-complete, synchronization-pending, failure, success, offline, linked-effect unavailable, and category/treatment-specific states; no review route. |
| Delete, Undo, and reconciliation guard | Eligible, prohibited, consequential review, pre-submit dismissal, pending-local focus containment, local-complete, synchronization-pending, incomplete reconciliation, failure, success, and offline; hidden Delete evidence, reversal-to-Active, linked effects, and automatic server guard remain all-or-nothing. |

### Key Entities _(include if feature involves data)_

- **Metal Holding**: A user-owned physical Gold or Silver position with identity, metal type, weight, canonical user-facing karat or fineness choice as applicable, normalized purity factor `p`, purchase facts, optional descriptive metadata, and Active, Sold, or Disposed status. Purchase facts are fields of this holding, not a separate purchase entity or journey.
- **Lifecycle Event**: A permanent dated record of creation, material correction, sale, disposal, or reversal associated with one holding.
- **Sale Event**: A whole-holding exit with gross proceeds, currency, optional fee and notes, net proceeds, optional same-currency account credit, and realized-performance evidence.
- **Disposal Event**: A whole-holding non-sale exit categorized as Lost or stolen, Destroyed or damaged, Given away, Donated, or Other, with optional notes and a required Write-off or External transfer meaning; Other requires the owner to choose that meaning explicitly.
- **Deletion Evidence**: The full hidden, non-effective creation, correction, and deletion timeline evidence for a mistaken Active record; it is absent from user-visible portfolio, detail, and normal History and has no ownership or financial effect.
- **Reversal Event**: An immutable record that cancels the current effect of a prior terminal event without deleting it and restores the same holding to Active.
- **Material Correction**: An immutable before/after whole fact set for a confirmed change to active physical or acquisition facts, including its consequence and reference-trust meaning.
- **Reconciliation Guard**: Server-authoritative atomic comparison of stable action_id and expected financial revision; one complete valid action becomes canonical, and a losing optimistic group is reversed once without normal-History or financial effect.
- **Incomplete Financial Group**: A recovery-visible but financially ineffective reconciliation/action group that cannot affect any financial result until complete and valid.
- **Rate Reference**: A role- and kind-discriminated raw observed reference: Gold/Silver `metal:<code>` is USD per pure gram in `quote_per_base`; ISO `currency:<code>` is USD per currency unit in `quote_per_base` or currency units per USD in `base_per_quote`. It retains supplied precision and provenance; adapter/pure logic normalizes once to canonical USD-per-base. Unknown/unparseable observation time affects freshness only; unavailable calculation reasons remain stable internal codes.
- **Action Group**: Durable grouped action evidence containing stable action_id, expected/server financial revision, append-only lifecycle/account effects or equivalent atomic protocol, references, and ownership/linkage facts.
- **Profit/Loss Attribution**: Authoritative combined P/L plus optional additive components for metal movement, currency movement, purchase premium/cost, sale-price difference, and fees. Canonical values retain full precision; normal currency display rounding may make displayed components sum within two minor units of the authoritative combined result solely because of rounding, which requires a visible understandable explanation and no hidden balancing component.
- **Asset-Sale Proceeds Credit**: An optional same-currency account increase linked to a sale and excluded from ordinary-income analytics.

### Scope Boundaries

**Included in V1**:

- Connected Home Metals & Rates, Metals landing, Live Rates, holding detail and history.
- Full-screen Add and Edit/correction, whole Sell, categorized Dispose, active-mistake Delete, and auditable Undo.
- Gold and Silver holdings.
- Trustworthy realized/unrealized P/L and expandable attribution when supporting references exist.
- Offline use, stale/missing-rate behavior, permanent lifecycle history, English/Arabic, RTL, accessibility, and responsive states.

**Backlog**:

- Partial sales and remaining-lot accounting.
- Gift, inheritance, and dowry acquisition modes.
- Cross-currency automatic account credit and manual historical baseline entry.
- Purchase-time account deduction, receipt import, attachments, exports, and reminders.
- Historical charts, alerts, forecasts, comparisons, and guidance.
- A guided wrong-metal correction shortcut; V1 uses Delete then Add.
- Zakat as an independent future module; an optional future deep-link does not create a V1 Metals requirement.
- Competing-version selection UI, including Screen 19; V1 uses automatic first-complete-valid-server-accepted reconciliation instead.

**Non-goals**:

- Trading, brokerage, or execution of metal purchases or sales.
- Partial holding exits, FIFO/pro-rata lot allocation, or tax accounting.
- Inventing rates, rewriting historical daily snapshots, or editing terminal events in place.
- Treating asset-sale principal as ordinary income.
- Speculative recommendations, price predictions, or “gold is up” advice.
- Zakat calculation, eligibility, reminders, or workflow inside Metals V1.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In moderated acceptance testing, at least 90% of users can identify Accounts and Metals as the complete current net-worth sources, reach either module or full rates from Home on the first attempt, and avoid confusing market rates with owned holdings.
- **SC-002**: A user can add a valid Gold or Silver holding in under 2 minutes and complete Sell, Dispose, Delete, or Undo in under 90 seconds, excluding time spent choosing optional notes or an account.
- **SC-003**: 100% of accepted Add, correction, Sell, Dispose, Delete, and Undo scenarios complete offline, remain correct after restart, and expose no partial financial state.
- **SC-004**: For every trusted valuation fixture, canonical purchase-currency formulas produce expected authoritative combined P/L and components, current display-time FX converts each through one consistent basis, full-precision components sum before one half-even rounding step, and normal-precision displayed components differ from authoritative combined P/L by no more than two minor units solely because of rounding; every non-zero difference has a visible understandable explanation and no hidden balancing component.
- **SC-005**: Across all missing and invalid rate fixtures, 100% of recorded holdings remain visible and no unavailable valuation is presented as zero, empty portfolio, or fabricated performance.
- **SC-006**: Across all rate fixtures, values derived from rates older than 24 hours are labeled stale with age, unknown-freshness inputs are never labeled Fresh, and 100% of financial confirmations affected by stale or unknown freshness require acknowledgment.
- **SC-007**: 100% of Sold, Disposed, correction, and reversal fixtures preserve their immutable ordered history; Undo never removes the original terminal event.
- **SC-008**: After issue #242 is merged and verified, a sale with account credit increases the selected same-currency account by exactly net proceeds, contributes zero to ordinary income, budget-income, and earned-cashflow totals, and uses one proceeds currency for gross proceeds, fees, net proceeds, and account eligibility. Before that prerequisite, account credit remains disabled and sale without credit remains available.
- **SC-009 (reserved)**: This identifier is intentionally reserved because its earlier candidate criterion was superseded during clarification. Preserve the gap for traceability; do not renumber SC-010 through SC-030 or infer new behavior from this reservation.
- **SC-010**: All primary and destructive journeys can be completed in English and Arabic, LTR and RTL, on compact phone, ordinary phone, tablet, portrait, landscape, and 200% text configurations with no clipped required value, broken bidirectional association, or unreachable action; reduced-motion mode preserves every state and progress meaning.
- **SC-011**: 100% of interactive controls meet minimum target size, separation, focus, and external-input requirements, and all financial status, metal identity, trust, and destructive consequences remain understandable with color removed and through coherent assistive-technology summaries.
- **SC-012**: No lifecycle action rewrites a previously recorded daily dashboard snapshot in the complete acceptance dataset.
- **SC-013**: All specified states pass light- and dark-theme review with equivalent financial hierarchy, at least 4.5:1 normal-text contrast, and at least 3:1 large-text and meaningful non-text contrast.
- **SC-014**: Across populated, Gold-only, Silver-only, mixed-Metals, and empty Home fixtures, 100% of views preserve the existing Home composition, show exactly the authoritative Accounts and Metals current-value contributions once as amounts and total-net-worth shares, nest correct Gold and Silver shares within Metals, keep rate context separate, and infer no ownership from rates in equivalent light and dark themes.
- **SC-015**: For every financial action and reconciliation fixture, pending completion blocks duplicates and dismissal and produces one outcome across retry.
- **SC-016**: Across competing financial actions, server CAS accepts one complete valid action once; rejected optimistic groups and linked account effects reverse once and affect no financial reporting or normal History; incomplete reconciliation gates financial actions.
- **SC-017**: Across all Gold and Silver fixtures with missing, zero, or ambiguous all-in purchase cost or required conversion facts, 100% show P/L as unavailable rather than free-acquisition performance.
- **SC-018**: Across all valuation and lifecycle fixtures, 100% of consumed metal and FX inputs retain their available provider observation time, source, and quality; unknown or unparseable timestamps are never labeled Fresh.
- **SC-019**: Across all Delete fixtures and later synchronization or restart, the mistaken record and timeline remain absent from user-visible portfolio, detail, and normal History, the full hidden creation/correction/deletion evidence prevents reappearance, and every ownership and financial contribution remains zero.
- **SC-020**: Across every Other disposal fixture, the live No Longer form requires Record a loss or Record it as moved out, notes remain optional, the `What will happen` summary states the choice, and the result creates zero proceeds, ordinary income, and realized sale P/L.
- **SC-021**: Across boundary precision fixtures, accepted weight has at most three decimals, normalized purity factor `p` at most six, entered and posted money matches currency minor units, derived financial values retain full internal precision, rates preserve supplied precision, internal calculations retain at least 34 significant decimal digits without intermediate rounding, components sum before one final half-even rounding step, and displayed attribution uses normal currency precision with the approved two-minor-unit maximum explained whenever non-zero.
- **SC-022**: Across synchronization pull and push failure fixtures, 100% remain visible failures, advance no progress marker or watermark, mark no local work synchronized, and never appear as successful empty changes.
- **SC-023**: Across Add, material correction, Delete, each Dispose meaning, Undo, Sale with and without account credit, incomplete-group, and conflict fixtures, global net worth uses only the specified effective holding and account contributions exactly once, reporting metrics add zero wealth, and earlier daily snapshots remain unchanged.
- **SC-024**: Across untouched, dirty, live-preview, discarded, operating-system-terminated, pending-submit, Active, terminal, incomplete, and conflicted fixtures, exit behavior, input retention, action priority, action gating, progress announcement, and absence of promised post-termination draft recovery match the specified state contract.
- **SC-025**: Across same-currency sale-fee fixtures, gross proceeds, optional fees, net proceeds, realized P/L, and optional account credit all use the proceeds currency, no fee-currency selector or conversion appears, and fees greater than gross proceeds remain blocked.
- **SC-026**: Across every supported Gold and Silver purity fixture, the exact user-facing catalog choice resolves to one normalized factor `p` in `(0, 1]`, pure grams equal `weight × p`, and no ambiguous or free-text purity reaches valuation. A 99.9% Gold sample displays `24K · 999`, not a generic `24K` label.
- **SC-027**: Across complete, delayed, malformed, foreign-owned, missing-linked-effect, restart, repeated-background-retry, and user-retry action-group fixtures, only complete valid groups become effective once; incomplete groups remain durable, financially ineffective, visible for recovery, and never silently expire or activate.
- **SC-028**: Across consequential confirmations, validation failures, operational failures, background refresh failures, and user-requested refresh failures, focus containment, background isolation, safe initial focus, pre-submit dismissal, trigger restoration, error focus, announcements, and no background focus theft match FR-092.
- **SC-029**: Every row of the screen/state obligation matrix passes applicable English/Arabic, LTR/RTL, touch, keyboard, switch-control, screen-reader, external-input, offline, trust, recovery, and action-availability fixtures without layout assumptions.
- **SC-030**: Across same-displayed-time History, restored-Active reversal, missing-data, local-complete-awaiting-sync, synchronization-failure, accessible-filter, plain-copy, missing-purchase-date, and holding-render fixtures, ordering, state terminology, synchronization status, provenance vocabulary, filter counts, and accessible identity remain deterministic and unambiguous.

## Assumptions

- Users are authenticated before entering private financial screens; guest use is outside this feature.
- Preferred currency continues to control portfolio display conversion and defaults, while a holding retains its recorded purchase currency.
- A purchase price of zero is not valid in V1 because gift, inheritance, and dowry acquisitions are backlog flows.
- A zero-proceeds exit is a non-sale disposal, not a Sale.
- Recent history is a bounded newest-first summary with a View all entry; exact visual capacity may adapt to screen and text size without changing ordering or access to complete history.
- Existing valid cached rates are sufficient for current display even when offline; current and historical references remain distinct.
- Existing daily dashboard snapshots are historical records, not a recalculated lifecycle ledger.
- Product design follows the approved calm Nile Ledger direction and the eight promoted canonical visuals. Deferred responsive and state proofs remain required in their recorded scope. Live Rates preserves its existing `/live-rates` visual appearance and layout.
- Finalized business rules from this specification must be promoted to the business-decisions source before implementation begins.
