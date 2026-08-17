# Contract: Dashboard Lifecycle Actions

## Resume

### Trigger

A unified row with `availableAction: "RESUME"` exposes a visible, labelled
Resume button and omits percentage/progress.

### Confirmation

Tapping Resume opens the shared `ConfirmationModal` pattern. Opening or
cancelling the modal performs no database write. The route owns the selected
budget ID and modal visibility. `useBudgetDashboardActions` owns only in-flight
command, cancellation, and friendly error state.

### Confirm behavior

1. Capture the selected budget ID.
2. Disable duplicate confirmation while submitting.
3. Call the existing user-scoped `resumeBudget(budgetId)` command exactly once.
4. On success, close the modal and wait for the WatermelonDB observation to
   reclassify the item.
5. On failure, keep the prior read model/card visible, stop submitting, and show
   translated friendly recovery copy with retry/dismiss behavior.

### Invariants

- Never mutate hook read-model items optimistically.
- Never resume an expired custom budget from the dashboard; it exposes Renew.
- UI/hook in-flight protection prevents repeated taps from invoking the service
  twice.
- The existing service remains paused-only: a second/non-paused call rejects and
  must append no new pause interval; it is not redefined as a successful
  idempotent call.
- Signed-out or foreign IDs fail through existing ownership enforcement.

### Coverage boundary

Jest/RNTL covers cancel, confirm, duplicate taps, injected failure, retry, and
service rejection. Maestro covers only visible cancel/confirm behavior because
the shipped app has no approved user-level failure-injection control.

## Renew

### Navigation request

```ts
router.push({
  pathname: "/create-budget",
  params: { renewFrom: expiredBudgetId },
});
```

### Consumer contract (#225)

The Create/Edit flow must:

- resolve `renewFrom` through a current-user-owned lookup;
- treat it as a CREATE source, never edit;
- prefill approved reusable fields;
- choose valid new period dates according to the Create/Edit specification;
- leave the expired source record unchanged on open, cancel, validation failure,
  and successful creation;
- make final creation explicit through the existing Create budget submit action.

### Failure behavior

- Missing, deleted, or foreign source: show friendly recovery UI and do not open
  an editable historical record.
- Navigation failure: retain the expired dashboard card and show recovery
  feedback.
- Dashboard issue #224 preserves the emitted route contract and existing child
  issue #225 prefill integration already present on the branch.

## Header Create

`BudgetsScreen` exposes:

```ts
rightAction={{
  icon: "add",
  onPress: handleCreateBudget,
  testID: "budgets-add-button",
}}
```

It routes to `/create-budget` without `id` or `renewFrom`. The dashboard
floating action button is removed. An empty-state CTA may invoke the same
callback but must not introduce a second persistent floating action.
