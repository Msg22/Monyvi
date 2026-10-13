# Data and UI State: Accounts UI Pilot

No new entity, database column, migration, sync contract, repository or service is introduced.

## Existing persisted concepts

| Concept | Existing meaning | Pilot boundary |
| --- | --- | --- |
| Account | Current-user owned ID, nickname, type, one currency, balance and default status | Authoritative generated/model types retained; type/currency locked after create |
| Provider identity | Optional institutionId; otherwise normalized providerDisplayName; otherwise missing-provider identity | UI does not implement identity/uniqueness policy; current scoped services remain authoritative |
| SMS metadata | Existing optional sender aliases and bank/card details linked to owned account | Optional/conditional validation and reset rules unchanged |
| Balance adjustment | Existing silent balance update or tracked adjustment workflow | Existing command/persistence boundary unchanged; no new financial representation |

Account balance persistence/save conversion is existing behavior, not precedent for new number-based calculations. This pilot changes text presentation only; it does not expand arithmetic or issue #241 migration scope.

## Existing form and presentation state

- Editable Name string, balance draft string, supported currency/type selection, provider identity genuinely null when unselected, optional metadata and default flag.
- Name validation and provider-aware duplicate status remain local and current-user scoped; existing debounce/stale-result/failure behavior stays in existing hooks/services.
- Balances have three distinct representations: canonical accepted dot-decimal12345.678, editable grouped12,345.678 and unchanged raw preview12345.678. Invalid draftabc12345 remains that exact raw string.
- TextField ordinary focus-local draft protects fast typing from stale parent values; numeric controlled synchronization is explicit. Formatting does not count as user modification.
- Field messages contain existing error, optional advisory warning and helper text. Approved priority selects error > warning > helper while preserving essential correction instructions. Warning alone does not invalidate or disable Save.
- Locked Type/Currency are display attributes, separate from temporarily disabled editable controls. Lock explanation remains accessible.

## State transitions

| Trigger | Existing transition / expected outcome |
| --- | --- |
| Open Add | Initial balance0; current type/preference defaults; Name/Type/Currency/Initial Balance required |
| User chooses currency | Explicit selection retained if preferred currency resolves later |
| Type/provider change | Existing eligibility/reset and stale uniqueness-result suppression |
| Raw input edit | Preserve valid canonical grammar or verbatim malformed/intermediate correction state; no rounding |
| Open pristine Edit; focus/blur | Grouped presentation only; no dirty/financial change |
| Metadata-only Save | Existing save path; no unnecessary balance sheet |
| Changed valid Edit balance | Existing sheet opens, silent choice initially selected |
| Confirm silent/tracked | Existing workflow invoked once; tracked mode creates its existing adjustment |
| Backdrop/Android Back | No commit; entered form remains recoverable |
| Save/Confirm failure | Existing entered values and friendly recovery retained; retry/duplicate guard unchanged |

Validation remains form-specific. Add negative submission stays invalid; Edit negative balance stays permitted; arbitrary existing decimals and save conversion remain unchanged. Name native maxLength50 and card digits-only four-character sanitizer are retained. Oversized payload schema tests do not imply UI can enter those payloads.

## Relationships and security

Existing scoped hooks/services supply shaped props and callbacks. Presentational controls never import database, services, query builders or account uniqueness calculations. Another user's preserved local rows cannot affect this user's uniqueness, visible values, defaults, save or offline-relaunch result.
