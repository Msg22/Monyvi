import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

interface Observer<TRecord> {
  readonly next: (records: TRecord[]) => void;
  readonly error: (error: unknown) => void;
}

const observerRef: { current: Observer<unknown> | null } = { current: null };
const mockUnsubscribe = jest.fn();
const mockQueryAccessibleCategories = jest.fn<
  {
    readonly observe: () => {
      readonly subscribe: (observer: Observer<unknown>) => {
        readonly unsubscribe: jest.Mock;
      };
    };
  },
  [unknown, string, unknown, unknown]
>(() => ({
  observe: () => ({
    subscribe: (observer: Observer<unknown>) => {
      observerRef.current = observer;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
}));
const mockLoggerError = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: { get: () => "categories" },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (...args: readonly unknown[]) => args,
    sortBy: (...args: readonly unknown[]) => args,
    asc: "asc",
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryAccessibleCategories: (
    collection: unknown,
    userId: string,
    deletedCondition: unknown,
    sortCondition: unknown
  ): unknown =>
    mockQueryAccessibleCategories(
      collection,
      userId,
      deletedCondition,
      sortCondition
    ),
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1", isResolvingUser: false }),
  runUserScopedEffect: ({
    onAuthenticated,
  }: {
    readonly onAuthenticated: (userId: string) => void | (() => void);
  }): void | (() => void) => onAuthenticated("user-1"),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import {
  CategoriesProvider,
  useAllCategories,
} from "@/context/CategoriesContext";

function Wrapper({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <CategoriesProvider>{children}</CategoriesProvider>;
}

describe("CategoriesProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    observerRef.current = null;
  });

  it("exposes observation failures and recreates the scoped subscription", async () => {
    const { result } = renderHook(() => useAllCategories(), {
      wrapper: Wrapper,
    });
    const error = new Error("categories failed");

    act(() => observerRef.current?.error(error));

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.isLoading).toBe(false);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "categoriesProvider.observe.failed",
      error
    );

    act(() => result.current.retry());

    await waitFor(() =>
      expect(mockQueryAccessibleCategories).toHaveBeenCalledTimes(2)
    );
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => observerRef.current?.next([]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
