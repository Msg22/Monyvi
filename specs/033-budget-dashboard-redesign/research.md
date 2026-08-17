# Phase 0 Research: Unified Budgets Dashboard

## Decision 1: Derive lifecycle before filtering

**Decision**: Derive one state per budget in this order: expired custom,
persisted paused, over budget, near limit, healthy.

**Rationale**: `EXPIRED` is not persisted and must win while auto-pause is
pending or after manual pause. One derivation prevents one budget matching
Active and Expired.

**Rejected**: Persist `EXPIRED`; infer expiry from `PAUSED`; run independent
status predicates.

## Decision 2: Keep expired budgets in metric enrichment

**Decision**: Enrich every eligible active/paused budget, including expired
custom records, before building presentation state.

**Rationale**: Expired history must remain visible if lifecycle writes are
pending or fail. Existing metrics provide amount context without changing
financial rules.

**Rejected**: Depend on focus-triggered auto-pause for visibility.

## Decision 3: Build one display item, then apply three filters

**Decision**: Build immutable display-ready items once and apply scope, period,
and status using pure AND predicates.

**Rationale**: One pipeline makes combination coverage deterministic and avoids
section duplication. Category labels remain service-shaped from accessible
category input; rows do no query.

**Rejected**: Filter independently in cards, route, or separate sections.

## Decision 4: Use explicit priority ordering

**Decision**: Rank `EXPIRED`, `OVER_BUDGET`, `NEAR_LIMIT`, `PAUSED`, `HEALTHY`.
Within rank, use active-locale collator and stable ID tie-break.

**Rationale**: Urgent/actionable states remain discoverable without sections.
Approved active order is Over Budget, Near Limit, Healthy. Expired comes first
under All status because it requires renewal; paused precedes healthy but
follows spending attention states.

**Rejected**: Spending-percentage sort, creation-time sort, or pure alphabetical
order across all states; each can bury attention rows or reorder continuously.

## Decision 5: Use one virtualized list, no carousel

**Decision**: Use one vertical `FlatList` with one compact full-width row type.
Remove section rows, global page groups, page dots, carousel announcements,
horizontal snapping, and responsive card-count helpers.

**Rationale**: Approved information architecture is filter-driven. One row type
removes special global hierarchy and prevents prior width/height failures.

**Rejected**: Preserve carousel under Global tab; it contradicts unified style
and reintroduces two navigation models.

## Decision 6: Keep filters visible and compose selectors

**Decision**: Scope is a three-tab control. Period and Status are two visible
selector controls that always expose current value. Selector content uses
existing app modal/dropdown patterns and safe-area ownership.

**Rationale**: Users understand all active constraints without opening a general
filter sheet. Separate controls scale better than twelve combined chips.

**Rejected**: One hidden filter modal, one chip per combination, or status
sections.

## Decision 7: Session-only filter persistence

**Decision**: Store latest three selections in an in-memory UI session boundary.
Initialize with `All / All / Active`; update on accepted changes; reset on fresh
JS runtime. Do not persist to database, cloud, or preferences.

**Rationale**: Matches approved navigation-back behavior while preventing
surprising stale filters after fresh launch.

**Rejected**: Permanent device preference; URL-only state; relying on route
mount lifetime without explicit contract.

## Decision 8: Preserve last valid model and cancel stale work

**Decision**: `useBudgets` distinguishes initial loading from later work. New
selection/observation generations invalidate older async completions. Later
failure retains last valid rows and current selections.

**Rationale**: Financial content must not disappear or revert to earlier filter
because of a race.

**Rejected**: Clear rows on every change or cache mutable state in service.

## Decision 9: Preserve lifecycle action contracts

**Decision**: Resume continues through shared confirmation and owned command.
Renew continues through distinct `renewFrom` create-source navigation with
prefilled reusable values and immutable history.

**Rationale**: Approved actions remain useful after sections disappear, and
current correctness fixes already implement safety boundaries.

**Rejected**: Hide actions in menu, direct Resume without confirmation, or renew
through edit `id`.

## Decision 10: Match skeleton to final information architecture

**Decision**: Skeleton renders scope-tab shapes, two visible filter-control
shapes, and repeated compact-row shapes. It contains no hero or carousel block.

**Rationale**: Geometry continuity reduces layout surprise and fulfills shared
Skeleton policy.

**Rejected**: Reuse section/carousel skeleton or generic full-page blocks.

## Decision 11: Consume established safe-area ownership

**Decision**: Keep root measurement and PR #222 contract. Unified list adds
runtime bottom inset once to base content spacing; filter selectors use shared
modal inset behavior.

**Rationale**: Root padding would regress already-correct screens and gesture
mode.

**Rejected**: Global bottom wrapper or fixed navigation-bar spacer.

## Decision 12: Testing and seed strategy

**Decision**: Extend fixtures only for missing scope/period/status combinations.
Keep `dashboard-full` and `dashboard-filter-empty`; replace carousel Maestro
journey with combined-filter coverage. TDD covers deterministic service, hook,
row, filter, skeleton, action, and recovery branches.

**Automation boundary**:

- Jest/RNTL: all derived states, 3 x 4 x 4 filter matrix, ordering, session
  persistence/reset, stale cancellation, row content omissions, accessibility,
  long text, safe area, injected failures, Resume/Renew/detail behavior.
- Maestro: defaults, visible selected values, representative combined filters,
  reset, row detail, Resume cancel/confirm, Renew prefill.
- Manual-only: TalkBack quality, visual contrast, maximum font scale, Android
  navigation-mode switching, pixel comparison, and timed acceptance evidence.

## Decision 13: Reproducible timing and ordering

**Decision**: Use one injected clock per read-model build, explicit active
locale, stable ID tie-break, and temporary development-only timing probes for
five consecutive selection transitions. Remove probes before PR completion.

**Rationale**: Tests and device evidence stay deterministic without production
logging or device-specific rules.
