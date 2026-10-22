# #395 R2 owner feedback — approved UI amendments and acceptance

**Owner approval:** 2026-10-19. **Pinned source:** `Msg22/Monyvi`
`codex/395-shared-account-review`, base
`1a29b744a7dfbf9097366df88cb7c1f8799fd328`. **Status:** These UI decisions are
APPROVED; implementation, consolidated tests, owner manual visual/accessibility
acceptance, financial Save diagnostics and release status are **not** certified
by this document. See the corresponding
[current business decisions](../../../docs/business/business-decisions.md) and
the controlling [first-release scope](first-release-scope.md).

## Authority and non-expansion

Newer owner requests below supersede only conflicting UI interaction details in
historical #395 design/spec wording. Keep immutable approved images, bindings,
mockup sidecars and 23 B1 approvals unchanged; no new imagery or approval
ritual. Preserve PR #403 direct-implementation policy: implementation first,
Root's batched relevant checks, owner manual testing, focused regressions and
final affected validation. Existing native/device permission gates, worker
ownership order, owner/CAS safety and SQLite/SQL requirements remain intact.
This record neither expands #239/#339 nor changes the financial writer, generic
Voice transfers/#404, SMS detector or sync.

## Binding owner R2 decisions

1. **Single owned-account chooser:** All visible eligible accounts remain
   deliberate options across permissible currencies. Final CTA explicitly names
   the selected account **and currency** (e.g. "Use QNB · EGP"). Candidate tap
   is provisional. The one final action commits the combined account+currency
   under current owner/account/row revisions, preserving the identical numeric
   amount and doing **no FX conversion**. No separate Confirm currency/Confirm
   account+currency modal after selection. Cancel, Back or dismissal commits
   nothing; no auto-picked first candidate, automatic default override or
   relaxed known-currency automatic matching. No standalone currency correction
   or recovery UI remains. Existing CurrencyPicker is reused **inside the new
   row-only draft currency field**, not as a separate confirmation chain.
2. **Row-only manual account draft:** The same new-draft form exposes name, type
   **and user-selected currency** via the existing CurrencyPicker in the same
   form. A bounded existing local command extension may persist the explicit
   draft currency atomically under current owner/row/role guards, without SQL or
   database schema changes. Draft is row-only and does not select entries,
   create physical accounts or alter balance/default. Ordinary SMS source
   excludes Cash; a Cash destination is permitted only on a genuine SMS ATM with
   separate source Bank/Wallet. Existing shared drafts retain **locked
   currency** and linked-scope behavior. Only eligible **selected** Save
   referencing a confirmed draft may physically create it through the existing
   atomic/idempotent guarded Save; no new writer.
3. **Issue recovery:** Account/currency-uncertain Review details opens a
   temporary, actual account-needed-only list in **original source order**.
   **Show all** restores the complete list; user chooses each row separately,
   not a fabricated bulk/group assignment. Group replacement stays disclosed and
   limited to its linked members; unrelated rows stay unchanged.
4. **Pencils are activation only:** Existing-account pencil opens the owned
   chooser; suggested-account pencil opens EditSuggestedAccountSheet with
   linked-scope disclosure. Category pencil and quick-category open
   CategorySelectorModal **directly**, not the full TransactionEditModal. Only
   final category choice dispatches existing `edit_row_transaction` with
   **only** `patch: { categoryId }` under its current guards. Editing SMS ATM
   category is prohibited. No mutation on activation or parallel writer.
5. **Feedback policy, prospective for app:** No error/warning/success **toast**
   in new or changed app code. Page-scoped persistent dismissible inline notice
   **directly beneath the header**, **outside the scrolling region**, remains
   visible while content scrolls. An active modal places its own feedback **at
   its top**, not behind it or in a global toast. Explicit dismissal or
   resolution controls notice state, not a timed toast. Migrate unrelated legacy
   screens gradually; current changed Review flows comply now. Never display
   success for unknown/rejected Save.
6. **Responsive, dark and keyboard:** Actual container width/label fit, not
   character-count estimates, fixed control chrome or arbitrary screen
   breakpoints, decides inline versus wrap. Reserve 44/48dp targets, keep
   status+linked count together where they fit, wrap without a stray leading
   separator dot, preserve all financial identity and font scaling. Dark
   informational text must be legible with semantic colors, not disabled tint.
   Transparent information-icon dark backdrop only in the approved state;
   preserve meaningful selected/alert fills. In Edit suggested account, Android
   KAV-height/scroll/field focus and single bottom inset must keep the name and
   Cancel/Confirm footer accessible at max 80% **usable** viewport height.
   Current account type requires a visible selected check/highlight plus its
   accessible checked state.
7. **Save diagnostics only until evidence:** Real Save failure's underlying
   cause is unproven. Surface genuine error/status at the correct inline or
   modal location; collect evidence without leaking private SMS/Voice data. Do
   not alter financial Save, unsafe ACK, SQLite/SQL, retry identity or
   reconciliation on a guess.

## Ownership boundaries

**A:** SharedAccountGroupRow / DefaultAccountInfo / SharedAccountSuggestions
presentation. **B:** Canonical / row metadata / AccountChoice flows. **C:**
Route page-scoped notices and real Save diagnostics. **Separate form lane, only
with exact grant:** EditSuggestedAccountSheet and assigned focused tests.
**Root:** One integrated owner of batched checks, test assertions and manual
acceptance handoff. No overlapping source writers.

## Compact owner-manual checklist — PENDING / NOT RUN

- [ ] Choose a conflicting-currency owned account. Final CTA visibly names
      account+currency; no second confirmation popup. Before final tap or on
      Cancel/Back, no mutation. Accepted numeric amount unchanged, no FX.
- [ ] New row-only draft chooses name/type/currency together. Ordinary SMS Cash
      source excluded; real ATM Cash destination permitted. Creating draft does
      not check other rows or make a physical account; selected Save alone may
      do so. Existing shared draft currency stays locked.
- [ ] Review details issue shows real account-needed rows only in original
      order; Show all restores list. Resolve rows individually; group Replace
      disclosed, unlinked rows unchanged.
- [ ] Existing-account pencil opens owned chooser; suggested-account pencil
      opens EditSuggestedAccountSheet with linked disclosure. Category pencil
      and quick category open CategorySelectorModal directly; only final
      selection dispatches `edit_row_transaction` / `patch.categoryId`, never
      for SMS ATM. Activation alone makes no account/category change.
- [ ] Error/warning/success appears in dismissible sticky page notice
      immediately below header (outside scrolling list) or at top of active
      modal, never a new toast. Dismiss works; unresolved Save never looks
      saved.
- [ ] Ordinary 390dp, 340dp, 600dp/landscape, enlarged font and Arabic RTL: keep
      hit targets/readable full text; inline status/count when fit and no
      isolated leading separator dot on wrap.
- [ ] Light/dark: informational text contrast, icon transparency only where
      approved, preserved selected/alert fills; account type visibly selected,
      with checked accessibility state.
- [ ] Android Edit suggested account: focus name/keyboard, scroll and
      Cancel/Confirm footer reachable, one safe-area inset, 80% usable-height
      cap.
- [ ] Capture actual guarded Save failure step before requesting any financial
      repair; preserve owned, retry/dedup/privacy invariants.
- [ ] **19** DEV-only fixed Voice transcript fixtures stay intact: no mic,
      provider or Gemini; all TEST labels clear; existing review and
      deliberately **real** current-owner selected Save (balances can change)
      unchanged.

## Owner screenshot feedback — implementation evidence (2026-10-20)

**Observed:** The owner's actual review screenshot showed oversized 48 dp
**bordered pencil boxes** dominating account/category rows, and an unstyled
black-text filter displaying the raw missing key `account_review_filter_all`.
Root's targeted investigation established that a `.ts` `React.createElement`
header bypassed the configured Babel/NativeWind JSX transform, whereas its JSX
equivalent applied the expected styling; the filter key was absent from the EN
and AR transaction resources. These are implementation/integration and
evidence-boundary defects, not proof of any model's relative quality. Source
`className` tests never established native rendered fidelity.

**Approved interpretation, no new binding approval:** The original binding facts
(including 48 dp action hit targets and 340/390 dp reference contexts) and the
frozen 49/23 binding/mockup approval package retain their exact approved bytes
and provenance. The owner's newer actual-container and **quiet visible pencil
with a larger in-bounds effective tap area** decisions govern implementation
where the older facts might otherwise be read as mandatory visible 48 dp
bordered buttons or rigid viewport breakpoints. Do not regenerate
images/sidecars, change approved binding records, or open another approval
process.

**Repair and evidence status:** A owns the scoped UI corrections. Root reports
that the existing staged-artifact syntax intake guard is installed and prior
brace/quote syntax faults were addressed; formatting passed, but the initial
consolidated batch stopped during lint for new manual feedback, and **tests have
not run**. Focused filter styling/key and pencil presentation corrections, the
resumed Root check batch, and owner visual/manual acceptance remain **PENDING**.
No NativeWind/device/visual PASS, final readiness, or financial Save-failure
root cause is established by this receipt.

**Explicit exclusions:** No spec/mockup byte changes, E2E/static fixture
replacement, global feedback rewrite, native/emulator run, SQL/schema, sync/
ACK, expanded #239/#339 or generalized transfers. Root alone records actual
test/device outcomes; none are asserted here.
