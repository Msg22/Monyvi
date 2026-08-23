/**
 * Jest global setup — mock native modules that aren't available in test env.
 */

/* eslint-disable @typescript-eslint/no-empty-function */

// Mock expo-updates — used by utils/rtl.ts (applyRTL → reloadAsync on RTL flip).
// Not available in the worktree's node_modules here; a minimal no-op stub keeps
// transitive imports (changeLanguage.ts → rtl.ts) from failing at test load.
// `virtual: true` is required because the module isn't present on disk.
jest.mock(
  "expo-updates",
  () => ({
    reloadAsync: jest.fn(),
  }),
  { virtual: true }
);

// Mock expo-secure-store — referenced by services/supabase.ts for token storage
// but not needed in unit tests. Supplying stubs prevents module-load failures.
jest.mock(
  "expo-secure-store",
  () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
  }),
  { virtual: true }
);

// Mock @react-native-async-storage/async-storage — pulls a native module that
// fails to load under Jest. Supplying a minimal in-memory stub lets services
// that depend on it (intro-flag-service, i18n init, etc.) run in tests.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(
        (key: string): Promise<string | null> =>
          Promise.resolve(store.get(key) ?? null)
      ),
      setItem: jest.fn((key: string, value: string): Promise<void> => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string): Promise<void> => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn((): Promise<void> => {
        store.clear();
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(
        (): Promise<string[]> => Promise.resolve(Array.from(store.keys()))
      ),
      multiGet: jest.fn(),
      multiSet: jest.fn(),
      multiRemove: jest.fn(),
    },
  };
});

// Mock expo-haptics (uses native module)
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

// Mock @sentry/react-native — its module-level access of the native
// `RNSentry` TurboModule throws under Jest. Any test that transitively
// imports `utils/logger` (which wraps Sentry) would otherwise fail to load.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  withScope: jest.fn((fn: (scope: unknown) => void) =>
    fn({
      setLevel: jest.fn(),
      setTag: jest.fn(),
      setContext: jest.fn(),
    })
  ),
}));

// Reanimated 4 uses the separate react-native-worklets package. In Jest there
// is no native Worklets runtime, so load both official mocks before animated
// components are imported by tests.
jest.mock("react-native-worklets", () =>
  jest.requireActual<Record<string, unknown>>(
    "react-native-worklets/lib/module/mock"
  )
);
jest.mock("react-native-reanimated", () => {
  const reanimatedMock = jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock"
  );
  const mockedUseReducedMotion = reanimatedMock.useReducedMotion;

  return {
    ...reanimatedMock,
    useReducedMotion:
      typeof mockedUseReducedMotion === "function"
        ? mockedUseReducedMotion
        : (): boolean => false,
  };
});

// React 19 schedules react-test-renderer mounts asynchronously unless they are
// wrapped in act(). Existing tests use a small project-local RTR pattern, so
// keep that pattern working by wrapping create() at the test boundary.
jest.mock("react-test-renderer", () => {
  const actual = jest.requireActual("react-test-renderer") as unknown as {
    readonly act: (callback: () => void) => void;
    readonly create: (...args: readonly unknown[]) => unknown;
  };
  const originalCreate = actual.create;

  return {
    ...actual,
    create: (...args: readonly unknown[]): unknown => {
      let renderer: unknown;
      actual.act(() => {
        renderer = originalCreate(...args);
      });
      if (!renderer) {
        throw new Error("react-test-renderer create() did not return renderer");
      }
      return renderer;
    },
  };
});

// Mock @expo/vector-icons — module-level load checks expo-font's
// loadedNativeFonts which is not initialized under the jest-expo preset.
// Tests that render components using these icons would otherwise crash
// with "loadedNativeFonts.forEach is not a function".
jest.mock("@expo/vector-icons", () => {
  const NullIcon = (): null => null;
  return new Proxy(
    {},
    {
      get: (): typeof NullIcon => NullIcon,
    }
  );
});

// Mock the internal AppState module that react-native/index.js re-requires
// on every property access. Patching the returned object in place does not
// stick, so we mock the underlying module directly. We cannot `jest.mock`
// the whole "react-native" module (breaks jest-expo's component mocks which
// read `displayName` on every exported component during setup).
jest.mock("react-native/Libraries/AppState/AppState", () => {
  const appState = {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  };

  return {
    __esModule: true,
    default: appState,
    ...appState,
  };
});

// Ditto — the individual icon-family entrypoints used directly by some files.
jest.mock("@expo/vector-icons/Ionicons", () => {
  const NullIcon = (): null => null;
  return { __esModule: true, default: NullIcon };
});
jest.mock("@expo/vector-icons/FontAwesome5", () => {
  const NullIcon = (): null => null;
  return { __esModule: true, default: NullIcon };
});
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const NullIcon = (): null => null;
  return { __esModule: true, default: NullIcon };
});
