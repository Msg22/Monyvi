# Read-Model Contract

Read-model services perform user-scoped local queries; hooks subscribe and expose
lifecycle state.

```ts
interface RateStatus { state: "fresh"|"stale"|"unknown"|"missing"; ageMs: number|null }
interface MetalPortfolioReadModel {
  totalValue: string|null; goldValue: string|null; silverValue: string|null;
  holdings: MetalHoldingCard[]; rateStatus: RateStatus;
}
interface MetalDetailReadModel {
  status: "active"|"sold"|"disposed"; currentValue: string|null;
  totalGain: string|null; metalGain: string|null; currencyGain: string|null;
  premiumAndCosts: string|null; canAttributeGain: boolean;
  unavailableExactFacts: readonly ("weight"|"purity"|"purchase_cost")[];
  requiresCompleteMaterialCorrection: boolean;
  isFinancialActionLocked: boolean;
}
```

Missing rates preserve facts and holdings; affected values are null. A migrated
holding may also have null exact weight, purchase cost, or the whole purity tuple when
legacy compatibility input was missing, invalid, or ambiguous. Read models expose the
specific unavailable facts, never read compatibility numbers as authoritative fallback,
and return null only for calculations that depend on them. The holding remains visible.
A material-correction form requires every unavailable required exact fact to be supplied
before direct save; after acceptance, `requiresCompleteMaterialCorrection` is false.
Stale valid rates
remain calculable with warning. Net worth is scoped account balances plus effective
active metal value. Sale with credit replaces metal with account cash atomically;
without credit invents no cash. Disposal/Delete add no proceeds. The global History
list is the user-facing list of effective holding events/holdings for the approved
All, Sold, and Disposed filters; it excludes rejected candidates, incomplete groups,
and Delete-mistake evidence. Each holding detail also exposes its own immutable
lifecycle timeline containing creation, corrections, the original Sold/Disposed
event, any reversal, and the new replacement/corrected terminal event. A reversed
terminal event remains in that per-holding timeline even after the holding returns
Active and therefore no longer appears as an effective terminal item in the global
status-filtered list. Account effects are excluded from ordinary income and budgets.
Historical attribution stays unavailable unless trustworthy.

Rate unavailable reason codes stay internal to the rate/attribution result contract;
views render their approved mapped trust/recovery copy, never raw codes. The global
History and every financial aggregate include only reducer-accepted effective events.
Malformed, rejected, incomplete, and ineffective evidence is excluded from normal
History, ownership, net worth, reporting, and analytics, while the holding's approved
reconciliation-recovery state keeps recovery reachable without exposing raw
rejection diagnostics.
