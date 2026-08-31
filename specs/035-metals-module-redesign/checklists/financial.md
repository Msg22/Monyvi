# Financial Requirements Quality Checklist: Metals Module Redesign

**Purpose**: Assess whether valuation, profit/loss, rate-evidence, proceeds, disposal, incomplete historical data, and snapshot requirements are precise enough for pre-design and pre-plan approval. **Created**: 2026-08-25 **Feature**: [spec.md](../spec.md)

**Note**: This checklist evaluates requirement quality, not implementation behavior.

## Valuation Basis and Currency Semantics

- [ ] CHK001 Are weight, purity, metal-rate units, and currency-rate orientation defined precisely enough to derive one canonical current-value formula? [Clarity, Spec §FR-046]
- [ ] CHK002 Is the holding purchase currency unambiguously defined as the canonical calculation and reporting basis for both combined P/L and every attribution component? [Clarity, Spec §FR-050]
- [ ] CHK003 Does the preferred-currency requirement define one consistent conversion basis for the combined value, each component, totals, and holding-level values? [Completeness, Spec §FR-051]
- [ ] CHK004 Are requirements explicit that missing, invalid, or non-finite valuation inputs make only affected values unavailable and never imply zero ownership or zero performance? [Consistency, Spec §FR-046, Spec §FR-057]
- [ ] CHK005 Are active, Sold, and Disposed contribution rules consistent across current value, unrealized P/L, lifetime realized sale P/L, allocation, and net-worth-facing totals? [Consistency, Spec §FR-004, Spec §FR-047]
- [ ] CHK006 Is the smallest displayed currency unit defined as the sole rounding tolerance after all values share the same reporting basis? [Clarity, Spec §FR-051]

## Additive Profit/Loss Waterfall

- [ ] CHK007 Is acquisition reference value defined with enough precision to calculate the purchase-cost component from pure metal quantity, acquisition metal reference, and acquisition FX reference? [Gap, Spec §FR-050]
- [ ] CHK008 Is the purchase-cost component sign convention explicit as acquisition reference value minus all-in purchase cost, including how positive and negative results are labeled? [Clarity, Spec §FR-050]
- [ ] CHK009 Does the all-in purchase-cost definition consistently include workmanship, dealer premium, fees, tax, and other recorded acquisition costs without labeling the entire component as dealer premium? [Consistency, Spec §FR-010, Spec §FR-050]
- [ ] CHK010 Is metal movement defined by an exact additive expression that holds acquisition FX constant and uses the difference between current or terminal and acquisition metal references? [Clarity, Spec §FR-050]
- [ ] CHK011 Is currency movement defined by an exact additive expression that holds the current or terminal metal reference constant and isolates only FX change? [Clarity, Spec §FR-050]
- [ ] CHK012 Is unrealized combined P/L explicitly defined as current reference value in purchase currency minus all-in purchase cost, reconciling to all three stated components? [Completeness, Spec §FR-048, Spec §FR-050]
- [ ] CHK013 Is realized combined P/L explicitly defined as net sale proceeds in purchase currency minus all-in purchase cost? [Completeness, Spec §FR-049]
- [ ] CHK014 Is sale-price difference defined as actual gross proceeds minus sale-date reference value after both use the same purchase-currency basis? [Clarity, Spec §FR-050]
- [ ] CHK015 Is fee effect defined as a separate negative component in the same basis, rather than being deducted both from net proceeds and again from attribution? [Consistency, Spec §FR-027, Spec §FR-049, Spec §FR-050]
- [ ] CHK016 Are sign, label, and ordering requirements defined for gain, loss, zero, unavailable, and rounding-residual states in the expanded waterfall? [Gap, Spec §FR-050, Spec §FR-052]
- [ ] CHK017 Can the reconciliation rule be objectively evaluated for holding-level, filtered, and portfolio-level combined values without allowing hidden balancing components? [Measurability, Spec §FR-051, Spec §SC-004]

## Reference Capture, Provenance, and Freshness

- [ ] CHK018 Are acquisition and terminal capture requirements complete for metal value, required FX values, provider observation timestamp, source, quality, and explicit Unknown provenance? [Completeness, Spec §FR-073]
- [ ] CHK019 Does the spec define which reference facts belong to Add, material acquisition correction, Sell, and each Dispose category? [Gap, Spec §FR-073]
- [ ] CHK020 Are source and quality terms defined as a controlled, user-understandable provenance vocabulary rather than free-form trust labels? [Ambiguity, Spec §FR-073, Spec §FR-075]
- [ ] CHK021 Is provider observation time distinguished consistently from local fetch, storage, synchronization, and user action times? [Consistency, Spec §FR-054]
- [ ] CHK022 Are metal and FX freshness requirements independent so one fresh input cannot hide a stale, unknown, or invalid companion input? [Completeness, Spec §FR-074, Spec §FR-075]
- [ ] CHK023 Is unknown freshness defined for missing or unparseable provider timestamps, with no path that presents such input as Fresh? [Clarity, Spec §FR-074]
- [ ] CHK024 Are historical-reference requirements explicit that later current values, inferred values, or retroactive snapshots cannot replace missing acquisition or terminal evidence? [Consistency, Spec §FR-058]
- [ ] CHK025 Does the valid-cached-rate requirement define validity independently for every consumed metal and FX input before permitting current display? [Gap, Spec §FR-053, Spec §FR-054]

## Sale, Account Credit, and Non-Sale Outcomes

- [ ] CHK026 Is fee currency explicitly defined as the proceeds currency, or is any alternative currency handling clearly excluded from V1? [Gap, Spec §FR-026, Spec §FR-027]
- [ ] CHK027 Are gross proceeds, fees, net proceeds, purchase cost, and realized P/L terms used consistently between the live sale summary, history, attribution, and lifetime totals? [Consistency, Spec §FR-028, Spec §FR-029]
- [ ] CHK028 Is same-currency account credit clearly optional, limited to net proceeds, linked to one sale, disabled until issue #242 is merged and verified, and independent from whether the sale itself remains recordable; are only credited Undo and account compensation/replacement credit additionally gated? [Clarity, Spec §FR-030, Spec §FR-032]
- [ ] CHK029 Are asset-sale proceeds exclusions complete across ordinary income, budget income, earned cashflow, and every other named income-derived aggregate? [Completeness, Spec §FR-031, Spec §SC-008]
- [ ] CHK030 Is Lost or Damaged write-off defined as a separate cost-basis outcome without sale proceeds or realized sale P/L? [Clarity, Spec §FR-034]
- [ ] CHK031 Are Gifted, Donated, and Other outcomes distinguished sufficiently to prevent external transfer, write-off, sale, and ordinary-income meanings from being conflated? [Clarity, Spec §FR-035, Spec §FR-036, Spec §FR-072]
- [ ] CHK032 Is lifetime realized sale P/L inclusion conditioned on a trustworthy combined result while all Dispose and Delete outcomes remain excluded? [Consistency, Spec §FR-029, Spec §FR-034, Spec §FR-037]

## Incomplete Historical Data and Historical Immutability

- [ ] CHK033 Are combined-P/L availability rules for Gold/Silver records with incomplete historical facts exhaustive for known positive cost, same-currency proceeds, cross-currency proceeds, missing conversion facts, and missing acquisition references? [Completeness, Spec §FR-059, Spec §FR-081]
- [ ] CHK034 Is zero or ambiguous acquisition cost explicitly distinguished from a valid free acquisition, which remains outside V1 scope? [Consistency, Spec §FR-081, Spec §Assumptions]
- [ ] CHK035 Are all valuation and P/L requirements limited consistently to supported Gold and Silver holdings? [Consistency, Spec §FR-017]
- [ ] CHK036 Is the prohibition on retroactive daily-snapshot rewriting stated consistently for Sell, Dispose, Undo, backdated events, and active material corrections? [Coverage, Spec §FR-060, Spec §SC-012]
- [ ] CHK037 Is manual historical baseline entry clearly excluded without leaving an implied automatic backfill path? [Consistency, Spec §Scope Boundaries, Spec §FR-058]

## Acceptance Criteria Quality

- [ ] CHK038 Does SC-004 define a fixture matrix covering fresh, stale, unknown, missing, mixed-currency, fee, gain, loss, and rounding-boundary calculations? [Gap, Spec §SC-004]
- [ ] CHK039 Can rate-trust outcomes be measured independently for each consumed metal and FX input, including unknown source, quality, and timestamp states? [Measurability, Spec §SC-006, Spec §SC-018]
- [ ] CHK040 Are measurable outcomes complete for account-credit exclusion, disposal classification, unavailable states caused by incomplete historical facts, and daily-snapshot immutability? [Completeness, Spec §SC-008, Spec §SC-012, Spec §SC-017]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Link findings to the cited requirement, gap, ambiguity, conflict, or assumption
- Items are numbered sequentially for traceability

## Reconciliation — 2026-08-25

**Authority**: This ledger is the current resolution status; the unchecked questions above remain unchanged as historical requirements tests.

### Satisfied

- **CHK007** — Satisfied by `FR-046`, `FR-050`, `FR-083`–`FR-085`, `SC-004`, and `SC-021`: acquisition reference, additive formulas, decimal precision, and final half-even rounding are explicit.
- **CHK019** — Satisfied by `FR-073`: Add, material acquisition correction, Sell, and Dispose define the acquisition or terminal reference-capture boundary.
- **CHK020** — Satisfied by `FR-073`–`FR-075` and `SC-018`: source identity, source-reported quality or validity, observation time, freshness, and explicit Unknown provenance form the controlled trust vocabulary.
- **CHK025** — Satisfied by `FR-053`–`FR-057`, `FR-074`, `FR-075`, `SC-005`, and `SC-006`: every consumed metal and FX input is validated and qualified independently.
- **CHK026** — Satisfied by `FR-027` and `SC-025`: fees use proceeds currency and V1 exposes no alternative fee-currency path.
- **CHK038** — Satisfied by `SC-004`–`SC-006`, `SC-021`, and `SC-025`: trusted, missing, stale, unknown, precision-boundary, mixed-currency, and fee fixtures have measurable outcomes.
- **CHK028** — Satisfied by `FR-030`, `FR-032`, and `SC-008`: #242 gates only sale credit, credited Undo, and account compensation/replacement credit; sale without credit and uncredited Undo remain available.

### Deferred

- **CHK016** — Resolved by the approved content contract and canonical visual handoff: simple gain/loss, zero, unavailable, and rounding-difference labels and their order are fixed; implementation must verify every state.

### Implementation handoff constraint — sale-proceeds credit

- **Evidence to validate during planning:** The current Account model can support an optional matching-currency default selection without a schema change. Auto-select only when exactly one matching default exists; if malformed local data produces multiple defaults, leave credit unselected, log a diagnostic, and require user choice. Never override a manual account choice or disabled credit when accounts/defaults arrive later. Current Metals has no Sell command or Sale Event implementation. The generic transaction-create path does not expose `linkedAssetId`, and present analytics/read models count every `INCOME` row. Therefore an asset-sale-proceeds credit needs explicit non-income analytics/read-model treatment and durable audit linkage to its sale; otherwise it would inflate income. This is an implementation constraint for the future data/service design, not a reopened business decision and not a prescribed schema solution. Explorer/code-path evidence should be attached when the implementation discovery handoff is available.
- **CHK001 (catalog-source detail only)** — Resolved by the versioned Gold/Silver catalog contract and `FR-093`; implementation must provide catalog maintenance and parity fixtures.
