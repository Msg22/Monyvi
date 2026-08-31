---
alwaysApply: true
---

# ECC Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier,
and enables safe concurrency.

## File Organization

MANY SMALL FILES > FEW LARGE FILES:

- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:

- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

## Input Validation

ALWAYS validate at system boundaries:

- Validate all user input before processing
- Use schema-based validation where available
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

## Authoritative Financial Arithmetic

For new or changed authoritative financial calculations:

- Use the shared `@monyvi/logic` Decimal.js primitive, never JavaScript-number
  arithmetic.
- Accept and persist canonical base-10 strings for non-posted values;
  WatermelonDB uses text and PostgreSQL uses exact `numeric`.
- Convert posted money only at the approved account boundary to integer minor
  units. Do not round intermediate calculation results.
- Use precision 50 and `ROUND_HALF_EVEN`; round only at the approved display or
  posting boundary.

## Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
