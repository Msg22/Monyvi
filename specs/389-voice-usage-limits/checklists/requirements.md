# Specification Quality Checklist: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-09-27  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No unresolved clarification markers remain
- [ ] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [ ] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Scope expanded 2026-09-27: implement the already-approved unified Add Transaction redesign with Manual/Voice tabs; Manual reuses the existing transaction form, Voice uses the approved mockup, and the global Add Transaction FAB opens the same page with Manual selected.
- No new or modified mockup is requested; the existing approved mockup is the visual target.
- One clarification is now open because the approved UI copy "Your limit resets tomorrow at the same time" conflicts with the previously approved local-calendar-day reset semantics (next local midnight). This must be resolved before `speckit.plan` is finalized.
- Clarifications recorded 2026-09-27: 5 provider-starting voice parses per authenticated user per local calendar day; burst cap 2 provider-starting logical requests per minute; provider-started logical requests consume exactly one daily unit even when they later fail, time out, or return invalid output, while pre-provider refusals consume zero.
- "Daily" follows the user's local timezone so the policy is not Egypt-specific; timezone-source and anti-abuse mechanics for timezone changes remain planning details while server authority is preserved.
- Exact visual placement/styling is deferred to the required mockup approval workflow rather than treated as a specification ambiguity.
- Subscription pricing, plan names, paid quotas, paywall behavior, and billing remain out of scope.
