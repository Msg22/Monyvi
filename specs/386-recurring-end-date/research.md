# Research: Bounded Recurring Payments

## Decision: Reuse the existing end-date data field without a migration

**Rationale**: The recurring-payment record already has an optional end date in the local schema, generated model, and sync configuration. The gap is exposure and use, not data storage.

**Alternatives considered**:

- Add a new database field: rejected because it duplicates an existing synced field.
- Store an unset date as an empty identifier or sentinel value: rejected because absence is a real domain state and must remain null.

## Decision: Keep date fields in the established Payment Schedule group

**Rationale**: The approved mockup keeps Due payment and End date inside the existing five-row grouped control. Each date row gains concise helper copy beneath its normal label/value content, so users receive context without a new card, toggle, or flow.

**Alternatives considered**:

- Toggle that reveals End date: rejected by approved product direction.
- Separate date cards or an explanatory banner: rejected because they change the schedule hierarchy and existing visual pattern.
- Tooltip-only help: rejected because visible supporting text is required.

## Decision: Treat end date as an inclusive final eligible due date

**Rationale**: A payment due on End date must be payable. The following calculated due date determines whether the series has ended.

**Alternatives considered**:

- Exclusive boundary: rejected because it makes the displayed final date unusable.
- Complete before the final due payment: rejected because it suppresses a valid final occurrence.

## Decision: Complete manual final payment atomically

**Rationale**: The current Pay Now path already commits transaction creation, balance update, and schedule advance together. Final-payment completion must join that same local atomic unit so a failure cannot create mismatched money, schedule, and status state.

**Alternatives considered**:

- Separate status update after payment: rejected because failure can leave an active series after a recorded final payment.
- UI-only hiding: rejected because the persisted status remains wrong and sync may re-expose it.

## Decision: Keep an unpaid final occurrence active and overdue

**Rationale**: Passing End date does not prove the final bill was paid. The series must remain visible until the user resolves that real financial obligation.

**Alternatives considered**:

- Complete automatically when End date passes: rejected because it hides an unpaid occurrence.
- Keep active forever after a successful final payment: rejected because it leaves a completed obligation in active state.

## Decision: Allow Pay Now for an overdue final occurrence

**Rationale**: A user must be able to record a late real-world payment. One successful final payment then completes the series through the same atomic outcome.

**Alternatives considered**:

- Block Pay Now after End date until the user edits the boundary: rejected because it creates unnecessary correction work and can trap an unpaid bill.

## Decision: Provide inline Clear for a selected End date

**Rationale**: Native date selection does not provide a cross-platform unset action. Clear is visible in the existing row and returns the form to `Not set` before Save.

**Alternatives considered**:

- Separate removal action: rejected because it adds a new surface outside Payment Schedule.
- Replacement only: rejected because users must be able to restore an ongoing series.

## Decision: Reactivate only an end-date-completed series when its existing next due payment becomes valid

**Rationale**: Extending or clearing the boundary should restore a series that ended solely because of that boundary, without reviving a manually stopped or otherwise completed series.

**Alternatives considered**:

- Never reactivate: rejected because clearing/extension would not make the edited series usable.
- Always reactivate every completed payment: rejected because it changes unrelated completion semantics.

## Decision: Defer scheduler behavior to its owning feature

**Rationale**: Current production behavior is centered on upcoming payments and manual Pay Now. This issue does not introduce an automatic processor. Its owning future feature must adopt the established inclusive boundary and unpaid-final rule.

**Alternatives considered**:

- Build automatic processing here: rejected as out of scope and a separate lifecycle/background-work feature.
