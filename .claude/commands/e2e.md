---
description:
  Generate and run end-to-end tests. Creates test journeys, runs tests, captures
  screenshots/videos/traces, and uploads artifacts.
---

# E2E Command

This command invokes the **e2e-runner** skill to generate, maintain, and execute
end-to-end tests.

## What This Command Does

1. **Generate Test Journeys** - Create tests for user flows
2. **Run E2E Tests** - Execute tests
3. **Capture Artifacts** - Screenshots, videos, traces on failures
4. **Identify Flaky Tests** - Quarantine unstable tests

## When to Use

Use `/e2e` when:

- Testing critical user journeys (login, transactions, payments)
- Verifying multi-step flows work end-to-end
- Testing UI interactions and navigation
- Validating integration between frontend and backend
- Preparing for production deployment

## How It Works

1. **Analyze user flow** and identify test scenarios
2. **Generate test** using Page Object Model pattern
3. **Run tests**
4. **Capture failures** with screenshots, videos, and traces
5. **Generate report** with results and artifacts
6. **Identify flaky tests** and recommend fixes

## Best Practices

**DO:**

- ✅ Use Page Object Model for maintainability
- ✅ Use data-testid attributes for selectors
- ✅ Wait for API responses, not arbitrary timeouts
- ✅ Test critical user journeys end-to-end
- ✅ Run tests before merging to main
- ✅ Review artifacts when tests fail

**DON'T:**

- ❌ Use brittle selectors (CSS classes can change)
- ❌ Test implementation details
- ❌ Run tests against production
- ❌ Ignore flaky tests
- ❌ Test every edge case with E2E (use unit tests)

## Integration with Other Commands

- Follow [delivery policy](../../docs/development-workflow.md) for unit/E2E
  sequencing; reserve `/tdd` for an explicit scoped request. No emulator/device
  execution unless Mohamed requests it.
- Use `/e2e` for integration and user journey tests
- Use `/test-coverage` to verify coverage
