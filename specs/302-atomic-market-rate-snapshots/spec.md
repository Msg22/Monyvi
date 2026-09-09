# Feature Specification: Atomic Market-Rate Snapshots

**Feature Branch**: `codex/issue302-atomic-market-rate-snapshots`  
**Created**: 2026-09-09  
**Status**: Draft — pending Mohamed approval  
**Input**: Issue #302 — deliver one complete market-rate snapshot guarantee from refresh ingestion through offline cache and every user-facing rate/valuation consumer, superseding issues #280 and #281.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Trust One Complete Rate Snapshot Everywhere (Priority: P1)

As a user, I want every rate, freshness indicator, source statement, and rate-based valuation I see at a given moment to come from one complete trusted market snapshot so that Monyvi never combines a displayed value with evidence from a different observation.

**Why this priority**: A mismatched value and trust signal can make a financially important number look more trustworthy than it is. Producer ingestion and consumer binding therefore form one indivisible user guarantee.

**Independent Test**: Prepare one complete valid snapshot and a second deliberately mismatched or incomplete candidate, then verify that Home, Live Rates, My Metals, holding valuation/detail, and any other current-rate valuation consumer all continue to use the same complete valid snapshot and never mix values or trust evidence across candidates.

**Acceptance Scenarios**:

1. **Given** a complete valid market snapshot is available, **When** any supported rate or rate-based valuation is shown, **Then** its numeric value and every trust fact used to describe it come from that same immutable snapshot.
2. **Given** Home, Live Rates, My Metals, and a holding valuation are viewed without a new accepted refresh between them, **When** they require the same rate input, **Then** they use the same selected snapshot rather than independently choosing newer or different evidence.
3. **Given** a newer candidate contains a displayed rate value but its matching trust evidence is missing, invalid, or belongs to another snapshot, **When** readers reevaluate current rates, **Then** that candidate is not promoted and the last complete valid snapshot remains selected.
4. **Given** no complete valid snapshot exists for a required current rate, **When** a dependent value is requested, **Then** the dependent value is unavailable rather than zero, guessed, or certified by unrelated evidence.

---

### User Story 2 - Refresh Safely Through Failure, Replay, and Partial Updates (Priority: P1)

As a user, I want market refreshes to improve my data only when a whole new snapshot is complete and valid, so that network failures, retries, realtime races, and repeated delivery cannot replace trustworthy cached values with a partial state.

**Why this priority**: Refresh is the main path that creates new market truth. If refresh can expose a half-written candidate, every consumer can temporarily show inconsistent financial information.

**Independent Test**: Starting from a known complete snapshot, exercise successful refresh, failed refresh, duplicate replay, conflicting replay, out-of-order delivery, and partial-write timing. Verify that selection changes exactly once only for a complete valid replacement and otherwise remains on the prior valid snapshot.

**Acceptance Scenarios**:

1. **Given** a complete valid snapshot is selected, **When** a refresh fails before the next snapshot is complete, **Then** the selected snapshot remains usable and unchanged.
2. **Given** only part of a newer snapshot has arrived, **When** realtime or refresh-driven readers react to the partial update, **Then** they continue using the prior complete snapshot.
3. **Given** the same complete snapshot is delivered again with the same immutable identity and content, **When** it is replayed, **Then** the result is idempotent and does not create a second user-visible truth or alter the selected values.
4. **Given** the same immutable identity is replayed with conflicting content, **When** the conflict is detected, **Then** the conflicting candidate is not accepted and it cannot displace the last complete valid snapshot.
5. **Given** an older already-known complete snapshot arrives after a newer selected complete snapshot, **When** delivery is out of order, **Then** the selected view does not regress solely because the older snapshot arrived later.

---

### User Story 3 - Keep the Last Trusted Snapshot Offline (Priority: P1)

As a user, I want the last complete valid market snapshot to remain usable after losing connectivity or restarting the app, so that previously trustworthy rate-based values remain available without pretending they are newer than the provider actually observed.

**Why this priority**: Offline-first behavior is a core Monyvi promise, and market-rate trust must survive restart and failed refresh without changing the meaning of freshness.

**Independent Test**: Select a complete snapshot while online, then disconnect and restart. Verify that the same snapshot remains available, its exact provider observation times remain the basis of freshness, and no fetch, storage, restart, or synchronization time makes it appear fresher.

**Acceptance Scenarios**:

1. **Given** a complete valid snapshot was previously selected, **When** the device is offline, **Then** supported screens continue using that snapshot for any calculation it can validly support.
2. **Given** the app restarts while offline, **When** market-dependent screens reopen, **Then** they rebuild from the same last complete valid snapshot rather than an incomplete refresh candidate.
3. **Given** the retained snapshot is old, **When** freshness is shown or used, **Then** freshness is derived only from provider observation time and remains stale or unknown as appropriate; local fetch, cache, synchronization, or restart time cannot make it fresh.
4. **Given** a failed online refresh occurs after a valid cached snapshot exists, **When** the user returns to a market-dependent screen, **Then** the cached snapshot remains available and the failed attempt does not erase or partially replace it.

---

### User Story 4 - Fail Closed for Missing or Invalid Market Inputs (Priority: P2)

As a user, I want Monyvi to clearly withhold only the rate-dependent values it cannot prove, while preserving my recorded financial facts and any unaffected content.

**Why this priority**: Honest unavailability is safer than misleading zeros, fabricated current values, or trust evidence borrowed from another observation.

**Independent Test**: Supply candidates with missing rates, invalid decimals, invalid quality, missing or unparseable provider time, missing trust evidence, and legacy data without a provable snapshot binding. Verify that dependent outputs become unavailable or freshness becomes unknown according to the existing rate-trust rules, while recorded holdings and unrelated data remain intact.

**Acceptance Scenarios**:

1. **Given** a required rate value or required matching evidence is invalid, **When** a dependent valuation is requested, **Then** the dependent result is unavailable and no current or unrelated rate is substituted.
2. **Given** a rate value and evidence are otherwise valid but provider observation time is missing or unparseable, **When** freshness is classified, **Then** the rate may remain usable according to the existing validity rules but freshness is Unknown; local timestamps never replace provider time.
3. **Given** legacy cached market data cannot be proven to belong to one matching immutable snapshot, **When** the new contract is applied, **Then** that data is not newly certified as an atomic trusted snapshot by inference alone.
4. **Given** one required input is unavailable, **When** the user views their holdings, **Then** ownership and recorded facts remain visible while only calculations that depend on the unavailable input are withheld.

### Edge Cases

- First launch or cleared local data with no complete valid market snapshot.
- A refresh writes the wide set of displayed values but crashes before all matching observations are available.
- Matching observations arrive before the corresponding displayed-value set.
- A newer candidate is complete for some instruments but missing or invalid for another instrument required by the same supported snapshot contract.
- A value is valid but its source, quality, unit/orientation, or other required trust fact is invalid or absent.
- Provider observation time is missing, unparseable, non-finite, or in the future; freshness must remain Unknown rather than using local time.
- Duplicate delivery of an already accepted snapshot with identical content.
- Replay of the same immutable identity with different content.
- Out-of-order delivery of an older complete snapshot after a newer complete snapshot is already selected.
- Realtime notification occurs while a new snapshot is only partially available.
- The device goes offline or the app terminates in the middle of a refresh.
- A failed refresh leaves staged or partial candidate data behind.
- Retention removes old unselected snapshots; it must not leave a selected value whose required trust evidence has been removed.
- Legacy cached values exist without a provable immutable binding to their trust observations.
- A selected snapshot becomes locally incomplete or corrupt; readers must not silently combine it with another snapshot to repair it.
- Current-rate evidence and immutable historical acquisition/terminal evidence coexist; current snapshot selection must never rewrite or fabricate historical references.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST define one immutable snapshot identity that binds a complete set of displayed current market-rate values to the exact trust observations that certify those values.
- **FR-002**: A market refresh MUST be treated as one logical snapshot from production creation through local availability; producer creation and consumer binding MUST ship as one user/business guarantee rather than independent behaviors.
- **FR-003**: A candidate snapshot MUST be considered complete only when every value and every required trust fact for the supported current-rate snapshot contract are present and valid together under the same immutable identity.
- **FR-004**: Required trust facts MUST preserve the existing semantics for exact value, instrument, unit/orientation, provider observation time, source identity, source-reported quality/validity, and freshness classification.
- **FR-005**: The system MUST promote a new current snapshot only after the complete candidate has passed all required validation; incomplete, unmatched, conflicting, or invalid candidates MUST NOT become current.
- **FR-006**: A newer incomplete or invalid candidate MUST NOT replace, mutate, or partially merge into the last complete valid selected snapshot.
- **FR-007**: Home, Live Rates, My Metals, holding detail/valuation, net-worth metal valuation, and every other current market-rate consumer in scope MUST derive the rates and trust evidence they consume from the same selected complete snapshot.
- **FR-008**: A displayed value MUST NOT be paired with source, provider time, quality, freshness, or other trust evidence from a different snapshot, even temporarily during refresh or realtime delivery.
- **FR-009**: Freshness MUST be derived only from provider observation time according to the approved rate-trust policy. Fetch time, storage time, synchronization time, receipt time, restart time, and local clock time used as a replacement observation timestamp MUST NOT make a rate fresher.
- **FR-010**: Missing or unparseable provider observation time MUST produce Unknown freshness according to the existing trust rules; it MUST NOT be repaired with a local timestamp.
- **FR-011**: Failed refresh MUST retain the last complete valid selected snapshot when one exists and MUST NOT erase trustworthy cached values merely because a newer attempt failed.
- **FR-012**: The last complete valid selected snapshot MUST remain usable offline and after application restart for every calculation it can still validly support.
- **FR-013**: When no complete valid snapshot exists for a required current input, the dependent value MUST be unavailable rather than zero, guessed, inferred from a different snapshot, or backfilled from a current value that lacks matching evidence.
- **FR-014**: Recorded user facts such as holdings MUST remain preserved and visible when market inputs are unavailable; only outputs that depend on unavailable market inputs may be withheld.
- **FR-015**: Market-rate decimal values used for financial calculations MUST preserve the approved exact-decimal semantics and supplied precision through the authoritative calculation boundary; the feature MUST NOT introduce binary floating-point approximation as financial truth.
- **FR-016**: Replaying the same immutable snapshot identity with the same content MUST be idempotent and MUST NOT create duplicate user-visible snapshots or change already selected values merely because of replay.
- **FR-017**: Replaying the same immutable snapshot identity with conflicting content MUST be rejected or quarantined as invalid and MUST NOT displace the last complete valid snapshot.
- **FR-018**: Out-of-order or delayed delivery MUST NOT make the selected view regress to a previously superseded snapshot solely because that older snapshot arrived later.
- **FR-019**: Retention behavior MUST preserve the integrity of every snapshot that remains eligible to be selected. A selected snapshot MUST NOT remain usable if any of its required matching evidence has been removed; retention MUST never force readers to combine surviving parts from different snapshots.
- **FR-020**: Migration or cutover from legacy cached rate data MUST fail closed: legacy values without a provable matching immutable snapshot identity MUST NOT be newly certified by inference. The transition MUST preserve an already valid complete snapshot when available or expose dependent values as unavailable until a complete valid snapshot exists.
- **FR-021**: Current market snapshot behavior MUST remain distinct from immutable historical acquisition and terminal rate references. The feature MUST NOT fabricate or rewrite historical evidence from the selected current snapshot.
- **FR-022**: This feature MUST preserve existing supported instruments, calculation meanings, navigation, screen hierarchy, and visual design. It is a data-correctness change and introduces no intended visual redesign or new user flow.
- **FR-023**: Every deterministic acceptance scenario for successful ingestion, duplicate replay, conflicting replay, partial-update races, failed refresh, offline restart, invalid data, cutover, and cross-consumer consistency MUST be verifiable before implementation is considered complete.

### Key Entities

- **Market-Rate Snapshot**: One immutable, logically complete market observation used as the only eligible source for current displayed rate values and their trust evidence. It has a stable identity, a completeness/validity outcome, and ordering sufficient to prevent stale replay from becoming current.
- **Rate Observation**: The exact evidence for one rate input within a snapshot, including its numeric value, instrument meaning, unit/orientation, provider observation time, source identity, quality/validity, and resulting freshness state.
- **Selected Snapshot**: The last complete valid snapshot currently eligible for user-facing current-rate calculations. Selection changes only when another complete valid snapshot is safely promoted.
- **Dependent Valuation**: Any current user-facing financial value whose calculation consumes one or more rates from the selected snapshot, including metal values and related net-worth presentation.

## Scope Boundaries

### In Scope

- Production creation of complete current market-rate snapshots.
- Immutable identity and value-to-evidence binding.
- Completeness and validity rules needed to decide whether a candidate may become current.
- Idempotency, replay, conflict, failure, retention, and partial-update behavior.
- Local cached selection, offline restart, realtime refresh, and failure recovery.
- One selected current snapshot shared by Home, Live Rates, My Metals, holding detail/valuation, net-worth metal valuation, and other affected current-rate consumers.
- Compatibility/cutover rules necessary to avoid falsely certifying legacy unmatched data.
- Verification of deterministic success and failure paths.

### Out of Scope

- Changing the supported Gold/Silver or fiat-rate product scope.
- Changing the approved Metals valuation, attribution, sale-result, purity, or rounding formulas.
- Reconstructing missing historical acquisition or terminal evidence from current rates.
- New screens, navigation, visual hierarchy, interaction design, or mockup work.
- User-owned financial-action reconciliation that is unrelated to market-rate snapshot ingestion/selection.
- Production implementation during the Speckit pre-implementation flow.

## Dependencies

- Issue #302 is the combined authority and supersedes closed issues #280 and #281.
- Existing Metals V1 rate-reference and read-model contracts remain authoritative for exact values, provenance, freshness, missing-data behavior, and separation of current versus historical references.
- Existing business decisions remain authoritative for offline use, current-rate validity, exact financial decimals, and preserving holdings when rate-dependent values are unavailable.
- The current production market-rate refresh path, local market cache, synchronization/realtime delivery, and all current-rate consumers must be included in later planning because the guarantee spans producer through display.
- No mockup dependency exists because the requested behavior does not intentionally redesign visible UI.

## Assumptions

- Gold, Silver, and the currently supported fiat-rate set remain unchanged by this feature.
- A complete snapshot represents one producer refresh/observation event even when individual rate observations carry their own provider observation timestamps.
- The existing freshness threshold and trust classification rules remain unchanged; this feature fixes identity and atomicity rather than redefining freshness policy.
- Existing user-facing screens may continue to show cached valid rates while offline or after refresh failure, subject to their true provider-time freshness.
- The exact technical binding key, transaction mechanism, storage layout, retention duration, and rollout sequence are planning decisions. The specification requires their externally observable guarantees without preselecting an implementation.
- If repository/schema inspection later proves the candidate identity proposed in issue context cannot safely satisfy these requirements, Clarify must surface that conflict before Plan chooses another design.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In 100% of acceptance tests, every displayed current rate and every trust fact describing that rate are traceable to one and the same immutable selected snapshot.
- **SC-002**: Across the defined partial-write, realtime-race, failed-refresh, and invalid-candidate test matrix, zero incomplete or unmatched candidates replace the last complete valid snapshot.
- **SC-003**: Across Home, Live Rates, My Metals, holding valuation/detail, and net-worth metal valuation scenarios, 100% of shared current-rate inputs resolve from the same selected snapshot when no accepted replacement occurs between reads.
- **SC-004**: In 100% of failed-refresh and offline-restart scenarios with a previously complete valid snapshot, the last complete snapshot remains available without being made artificially fresher by local timestamps.
- **SC-005**: In 100% of missing/invalid required-input scenarios, dependent financial values are unavailable rather than zero, guessed, or supported by evidence from another snapshot, while recorded holdings remain preserved.
- **SC-006**: Replaying an accepted snapshot with identical content produces no second user-visible truth and no unintended value change in 100% of replay tests; conflicting same-identity replay never replaces the selected snapshot.
- **SC-007**: In 100% of provider-time edge cases, freshness is based on valid provider observation time only, with missing/unparseable provider time classified as Unknown rather than replaced by fetch, storage, sync, receipt, or restart time.
- **SC-008**: The completed feature preserves all existing user journeys and visual structure for Home, Live Rates, My Metals, and holding detail; manual regression finds no new screen, navigation step, or intentional layout redesign attributable to this feature.
- **SC-009**: The final implementation verification matrix covers every functional requirement and every listed edge case with deterministic automated coverage where controllable and explicit manual-only evidence where a runtime condition cannot be honestly automated.
