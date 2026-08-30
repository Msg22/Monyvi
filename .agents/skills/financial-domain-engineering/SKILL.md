---
name: financial-domain-engineering
description: Implement or review assigned pure Metals financial calculations in packages/logic, including Decimal.js precision, purity, valuation, P/L, and rate trust. Do not use for persistence, sync, UI, or unresolved financial-policy decisions.
---

# Financial Domain Engineering

Apply only to a bounded pure-logic financial slice with an approved rule source.
Read `../../personas/financial-domain-engineer.md` completely before work.

- Treat the constitution, business decisions, and approved Metals contracts as
  sources of truth. Stop when they omit or conflict on semantics, rounding,
  rate freshness, or attribution.
- Define plain input/output interfaces and deterministic fixtures. Keep money,
  quantities, purity, and rates in Decimal.js; never use a `number` intermediate
  for a financial calculation.
- Write and run focused tests Red before production code. Cover boundary
  rounding, zero/negative/large values, purity conversion, stale or missing
  rates, and P/L allocation that the assigned contract requires.
- Keep work inside `packages/logic` unless the brief explicitly expands it.
  No DB models, writes, migrations, services, hooks, routes, or UI.
- Hand off public API changes, Red/Green evidence, deterministic fixture set,
  assumptions, and independent-review needs. Do not self-review or self-approve.
