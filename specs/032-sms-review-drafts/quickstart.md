# Quickstart: Resumable SMS Review Drafts

## Prerequisites

- Local Supabase is running when authenticated/manual QA data is needed.
- Android development build is installed.
- Metro is stopped before changing parser/scenario environment variables.
- Use `manual-qa@monyvi.test` / the configured local QA password.
- Do not use real AI when a deterministic fixture mode can prove the scenario.

## Automated Validation

Run focused suites first, then package checks:

```powershell
npm test -w @monyvi/logic -- --runInBand sms-review-draft
npm test -w @monyvi/db -- --runInBand sms-review-draft
npm test -w @monyvi/mobile -- --runInBand sms-review-draft
npm run typecheck -w @monyvi/logic
npm run typecheck -w @monyvi/db
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/logic
npm run lint -w @monyvi/db
npm run lint -w @monyvi/mobile
```

Run existing SMS review/sync regression suites identified by Jest discovery. Do
not change voice review behavior while adding SMS-only props.

## Manual Device QA

### 1. Automatic persistence before navigation

1. Start a deterministic hybrid-fixture SMS scan with local and simulated AI
   successes.
2. Let parsing finish; before tapping Review, background and terminate the app.
3. Reopen and sign in as the same user.
4. Open SMS import.

Expected:
- Primary action says `Continue reviewing N transactions`.
- Continuing restores all accepted successes without another parser request.
- No unresolved/failed fixture raw message appears as a draft.

### 2. Resume edits and explicit selection

1. Open review and edit Amount and Merchant on one suggestion.
2. Change Category, Account, and Currency through their selectors.
3. Explicitly deselect one auto-selected suggestion and select one valid
   soft-warning suggestion.
4. Tap Review later, terminate the app, reopen, and continue.

Expected:
- Confirmed values and explicit selection overrides survive.
- Untouched suggestions still derive selection normally.
- No AI request occurs on resume.

### 3. Merge new results and deduplicate

1. Keep the queue unfinished.
2. Run Check for new messages with old fingerprints plus unique new messages.
3. Continue review.

Expected:
- Unique successes append once.
- Existing edited items are unchanged.
- Saved, active, and dismissed fingerprints never reach paid parsing.

### 4. Hard and soft validation

1. Make a referenced account/category inaccessible or use deterministic stale
   reference fixtures.
2. Resume review.
3. Try saving while the invalid item is unselected, then deliberately select it.
4. Correct the reference and reselect manually.

Expected:
- Hard-invalid item is forced unselected and identifies the field.
- Unselected hard-invalid and soft-warning items do not block other selected work.
- Selected hard-invalid item blocks the entire batch.
- Correction does not silently reselect it.

### 5. Atomic save and no empty flash

1. Select multiple valid suggestions and leave at least one unselected.
2. Save.

Expected:
- All selected financial records appear once with fingerprints.
- Matching drafts disappear; unselected draft remains resumable.
- Navigation goes directly to Transactions without an empty-review flash.
- Success feedback contains only the saved count.

Repeat with an injected batch failure:
- No financial record or draft deletion commits.
- Every item remains recoverable with edits.

### 6. Edit sheet visual and keyboard behavior

1. Open a card.
2. Compare the sheet to the approved mockup in light and dark themes.
3. Focus Amount, then Merchant; open each selector.
4. Test Android 3-button and gesture navigation plus large text.

Expected:
- Sheet is bounded; review header/filters remain visible.
- Provider identity and colorful icons remain.
- Currency exists; Expense/Income tabs and discard do not.
- Keyboard-aware internal scrolling keeps focused row and Save reachable.
- Bottom actions are above the native navigation bar.

### 7. One-tap discard, motion, and Undo

1. Tap the card's top-right X.
2. Observe removal and banner.
3. Tap Undo.
4. Discard again, then discard another item.
5. Close the latest banner.
6. Repeat with platform reduced motion enabled.

Expected:
- First tap discards without confirmation.
- Card fades/collapses once; adjacent cards settle once.
- Banner names the item and includes Undo plus close.
- Undo restores same values, position, and selection.
- Second discard finalizes/replaces the first Undo opportunity.
- Reduced motion uses immediate transitions.
- Failed persistence leaves/restores the card.

### 8. Discard all and Review later

1. Tap Review later.
2. Reopen and verify all suggestions remain.
3. Open Discard all, inspect copy, cancel, then reopen and confirm.

Expected:
- Review later exits the complete flow in one action without deletion.
- Confirmation uses `suggestions`, exact count, permanent consequence, cannot be
  undone, and not suggested again on this device.
- Cancel changes nothing.
- Confirm removes all, offers no Undo, writes no financial records, and leaves no
  empty queue.

### 9. Account isolation and stale completion

1. Create a queue for user A.
2. Switch to user B.
3. Open SMS import/review and start a scan that completes after another switch.

Expected:
- User B cannot see/count/mutate user A's queue or dismissed state.
- Late results become durable for neither wrong account.
- Switching back to A restores only A's queue.

### 10. Expiry and malformed payload recovery

1. Seed one item just older than 30 days and one newer item.
2. Seed malformed/unsupported payload fixtures.
3. Open SMS entry/review repeatedly.

Expected:
- Only expired/invalid items are removed or excluded safely.
- Newer item remains.
- Dismissed fingerprints remain.
- Repeated cleanup is idempotent and no raw payload appears in logs/errors.

### 11. Privacy inspection

1. Open Privacy details.
2. Inspect local DB, sync payloads, logs, notifications, diagnostics, category
   enrichment, and saved financial rows across save/discard/expiry.

Expected:
- Page separates AI processing from temporary local SMS review storage.
- Original SMS exists only in active local payloads or latest volatile Undo.
- Save/discard/expiry removes durable raw SMS immediately.
- No raw SMS or payload JSON enters cloud/operational surfaces.
- No encryption claim appears.

## Coverage Matrix

| Manual scenario | Automated coverage |
| --- | --- |
| Persistence/restart | codec + repository + hook/route integration |
| Edit/selection resume | repository + review-state tests |
| Merge/dedup/checkpoint | sync-service + repository concurrency tests |
| Hard/soft validation | reference + save-command tests |
| Atomic save | batch failure/interruption integration tests |
| Edit sheet | component/keyboard/safe-area tests; device visual manual |
| Discard/Undo/motion | command + component + reduced-motion tests |
| Discard all/Review later | command + route tests |
| Account isolation | repository/hook/stale-session tests |
| Expiry/malformed data | cleanup + codec tests |
| Privacy | sync exclusion + logger/copy tests; local DB manual inspection |

Physical-device visual fidelity, process termination, Android keyboard/navigation
bars, and reduced-motion transitions remain manual checks where unit tests cannot
honestly prove native rendering.
