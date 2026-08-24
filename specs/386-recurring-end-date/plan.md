# Implementation Plan: Bounded Recurring Payments

**Branch**: `386-recurring-end-date` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/386-recurring-end-date/spec.md`

## Summary

Expose the existing optional end date in the established Payment Schedule group, validate and persist it, and complete a series only after its final eligible payment succeeds. The approved interaction keeps date fields in the existing grouped list with inline helper text; selected End date has an inline Clear action. An unpaid final occurrence remains active and overdue, while Pay Now may record that overdue final occurrence and then complete the series. Completed series never reactivate through ordinary schedule edits; users explicitly choose Reactivate after saving in the edit form.

## Technical Context

**Language/Version**: TypeScript strict mode; React Native Expo mobile app  
**Primary Dependencies**: Expo Router, React Native, NativeWind v4, WatermelonDB, Zod, DateTimePicker, i18next  
**Storage**: Existing synced recurring-payment end-date field in WatermelonDB  
**Testing**: Jest + React Native Testing Library; SQLite-backed atomic recurring-payment integration tests; Maestro where current harness can drive flow  
**Target Platform**: Android and iOS mobile  
**Project Type**: Mobile app in npm/Nx monorepo  
**Performance Goals**: Local date selection and save remain immediate; no new network dependency  
**Constraints**: Offline-first, authenticated user scope, EN/AR localization, approved grouped-row UI, no partial financial writes  
**Scale/Scope**: Existing recurring create/edit routes, form, command service, validation, dashboard/list presentation, translations, and focused test suites

## Constitution Check

_GATE: Passed before Phase 0 and after Phase 1 design._

- **Offline-first**: Pass. All affected fields and status changes persist locally first.
- **Documented business logic**: Conditional pass. Before implementation, document approved inclusive boundary, overdue-final, Pay Now, completion, and reactivation rules in `docs/business/business-decisions.md`.
- **Type safety**: Pass. End date is `Date | null` at form and validation boundaries; no empty-string sentinel.
- **Service-layer separation**: Pass. Form owns UI state; command service owns scoped persistence and atomic final-payment completion.
- **Premium UI**: Pass. Approved grouped Payment Schedule pattern is retained; helper text and Clear remain inside affected rows.
- **Monorepo boundaries**: Pass. No reverse dependency or model-owned presentation logic.
- **Migrations**: Pass. Existing end-date schema/model/sync support removes migration need.
- **User scope and sync**: Pass. Existing current-user scope helpers remain required.

## Project Structure

### Documentation

```text
specs/386-recurring-end-date/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/recurring-payment-schedule.md
└── quickstart.md
```

### Source Code

```text
apps/mobile/
├── app/(private)/{create-recurring-payment,edit-recurring-payment}.tsx
├── components/recurring-payments/RecurringPaymentForm.tsx
├── services/recurring-payment-service.ts
├── validation/recurring-payment-validation.ts
├── locales/{en,ar}/transactions.json
└── __tests__/{app,components/recurring-payments,services}/

docs/business/business-decisions.md
```

**Structure Decision**: Extend existing mobile recurring-payment boundaries. Routes map form values to commands, form owns visual state, service owns user-scoped local writes and atomic submission, validation owns form-boundary date checks.

## Complexity Tracking

No constitution violations requiring justification.
