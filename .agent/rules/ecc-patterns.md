---
alwaysApply: true
---

# ECC Common Patterns

## Design Patterns

### Repository Pattern

Encapsulate data access behind a consistent interface:

- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details (database, API, file, etc.)
- Business logic depends on the abstract interface, not the storage mechanism
- Enables easy swapping of data sources and simplifies testing with mocks

### API Response Format

Use a consistent envelope for all API responses:

- Include a success/status indicator
- Include the data payload (nullable on error)
- Include an error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)

### Financial Action Groups

- Use Last Write Wins only for ordinary independently replaceable metadata.
- A grouped lifecycle or balance-changing financial action requires a stable
  action ID, expected financial revision, and one idempotent atomic local group.
- Synchronize the complete group through one server compare-and-swap operation.
  Client timestamps and Last Write Wins must never select a competing financial
  action.
- A rejected optimistic group and linked effects reconcile exactly once and are
  excluded from ownership, balances, net worth, reporting, and normal History.
