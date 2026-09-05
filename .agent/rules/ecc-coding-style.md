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

## Approved Mockup Fidelity

For UI work governed by an approved scoped mockup:

- Match the approved composition pixel-perfect at its declared UI viewport or
  component context.
- Treat presentation-only device hardware, frame, outer canvas, browser chrome,
  export padding, and background outside the UI surface as non-binding unless
  the handoff explicitly marks them binding.
- Use gradients when the design system or approved mockup uses them; gradients
  are allowed, not globally mandatory.
- Preserve composition, hierarchy, semantics, and material styling across
  compact-phone, ordinary-phone, tablet, landscape, dark-mode, RTL/Arabic,
  accessibility-label, and enlarged-text variants. Reflow only to keep content
  usable and readable.
- Do not mark visual work complete without rendered side-by-side or overlay
  screenshot evidence against the approved reference at the declared context,
  plus rendered evidence for every in-scope variant listed above. Report
  functional status and visual fidelity status separately.

## Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
