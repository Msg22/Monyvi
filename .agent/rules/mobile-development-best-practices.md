---
trigger: always_on
---

You are an expert in JavaScript, React Native, Expo, and Mobile UI development.

For Monyvi, `AGENTS.md`, `docs/development-workflow.md`,
`docs/design/design-system.md`, and `.agent/rules/styling-rules.md` govern UI
fit, accessible hit areas, semantic dark copy, keyboard/insets and new
page/modal feedback. These specific rules override generic suggestions below; no
automatic screen-breakpoint reflow, new toast or extra QA gate.

Code Style and Structure:

- Write Clean, Readable Code: Ensure your code is easy to read and understand.
  Use descriptive names for variables and functions.
- Use Functional Components: Prefer functional components with hooks (useState,
  useEffect, etc.) over class components.
- Component Modularity: Break down components into smaller, reusable pieces.
  Keep components focused on a single responsibility.
- Organize Files by Feature: Group related components, hooks, and styles into
  feature-based directories (e.g., user-profile, chat-screen).

Naming Conventions:

- Variables and Functions: Use camelCase for variables and functions (e.g.,
  isFetchingData, handleUserInput).
- Components: Use PascalCase for component names (e.g., UserProfile,
  ChatScreen).
- Directories: Use lowercase and hyphenated names for directories (e.g.,
  user-profile, chat-screen).

JavaScript Usage:

- Avoid Global Variables: Minimize the use of global variables to prevent
  unintended side effects.
- Use ES6+ Features: Leverage ES6+ features like arrow functions, destructuring,
  and template literals to write concise code.
- PropTypes: Use PropTypes for type checking in components if you're not using
  TypeScript.

Performance Optimization:

- Optimize State Management: Avoid unnecessary state updates and use local state
  only when needed.
- Memoization: Use React.memo() for functional components to prevent unnecessary
  re-renders.
- FlatList Optimization: Optimize FlatList with props like
  removeClippedSubviews, maxToRenderPerBatch, and windowSize.
- Avoid Anonymous Functions: Refrain from using anonymous functions in
  renderItem or event handlers to prevent re-renders.

### Methodology

    1. **System 2 Thinking**: Approach the problem with analytical rigor. Break down the requirements into smaller, manageable parts and thoroughly consider each step before implementation.
    2. **Tree of Thoughts**: Evaluate multiple possible solutions and their consequences. Use a structured approach to explore different paths and select the optimal one.
    3. **Iterative Refinement**: Before finalizing the code, consider improvements, edge cases, and optimizations. Iterate through potential enhancements to ensure the final solution is robust.

**Process**: 1. **Deep Dive Analysis**: Begin by conducting a thorough analysis
of the task at hand, considering the technical requirements and constraints. 2.
**Planning**: Develop a clear plan that outlines the architectural structure and
flow of the solution, using <PLANNING> tags if necessary. 3. **Implementation**:
Implement the solution step-by-step, ensuring that each part adheres to the
specified best practices. 4. **Review and Optimize**: Perform a review of the
code, looking for areas of potential optimization and improvement. 5.
**Finalization**: Finalize the code by ensuring it meets all requirements, is
secure, and is performant.

Best Practices:

- Follow React Native's Threading Model: Be aware of how React Native handles
  threading to ensure smooth UI performance.
- Use Expo Tools: Utilize Expo's EAS Build and Updates for continuous deployment
  and Over-The-Air (OTA) updates.
- Expo Router: Use Expo Router for file-based routing in your React Native app.
  It provides native navigation, deep linking, and works across Android, iOS,
  and web. Refer to the official documentation for setup and usage:
  https://docs.expo.dev/router/introduction/
