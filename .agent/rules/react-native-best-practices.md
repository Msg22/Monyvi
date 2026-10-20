---
trigger: always_on
description: when working on mobile app that uses react native
---

Apply `AGENTS.md`, `docs/development-workflow.md`,
`docs/design/design-system.md`, and `.agent/rules/styling-rules.md` before these
general patterns. Changed UI must use intrinsic container/text fit with 44/48 dp
accessible targets, readable dark/RTL states, reachable keyboard-aware footer
with one safe-area inset, and page/modal inline notices rather than new
error/warning/success toasts. Legacy migration is gradual; do not add a
mandatory cosmetic test/device matrix.

- Leverage native modules for performance-critical tasks.
- Optimize images and assets for mobile to reduce load times.
- Type all `props` and `state` using interfaces.
- Use `React.FC<Props>` only when you need `children`; otherwise use
  `function Component(props: Props)` for better type inference.
- Use `TouchableOpacity`, `Pressable`, or `TouchableWithoutFeedback` instead of
  `Button` for better UI control.
- Avoid logic in JSX; move calculations and business logic to the
  packages/logic. If it's shared or could be used by the mobile & api, if it's
  not shared and it will only be used in the mobile, then move it to the proper
  place in the mobile folder that is responsible for writing calculations and
  business logic.
- Always use `FlatList` instead of mapping manually over arrays when rendering
  long lists.
- Use `useMemo` and `useCallback` to avoid unnecessary re-renders in
  performance-critical components.
- Use `keyExtractor` in `FlatList` to prevent key warnings and improve rendering
  efficiency.
- Always clean up side effects in `useEffect` with a return function (cleanup).
- Prefer `react-native-safe-area-context` and `KeyboardAvoidingView` to manage
  safe areas and keyboard overlap.

  ## Component Structure & Organization
  - Each component should live in its own file.
  - Keep components small and focused (Single Responsibility Principle).
  - Use a dedicated folder structure: `/components`, `/screens`, `/hooks`,
    `/types`, `/utils`, `/constants`, `/services`.
  - Create reusable styled components or hooks where patterns repeat.
  - Use `index.ts` for barrel exports in folders.

  ## Async & APIs
  - Always use `async/await` with try/catch for API calls.
  - Extract API logic into separate service files.
  - Use `zod` or similar libraries for runtime validation of API responses.
  - When using Zod, derive TypeScript types with `z.infer<typeof schema>`
    instead of duplicating type definitions.
  - Use `React Query`, `SWR`, or similar libraries for stateful data fetching
    and caching.

## Testing & Debugging

- Write unit tests using `Jest` and `@testing-library/react-native`.
- Mock native modules and API responses in tests.
- Prefer `detox` for end-to-end testing if applicable.

instructions:

- Follow all rules above when writing or refactoring React Native TypeScript
  code.
- Ensure proper typing and code organization.
- Optimize for performance and memory usage on mobile devices.
- Use idiomatic React Native patterns and avoid web-specific patterns unless
  React Native Web is used.
- Provide reusable, clean, and accessible component implementations.
- Favor scalability, testability, and maintainability in all implementations.
