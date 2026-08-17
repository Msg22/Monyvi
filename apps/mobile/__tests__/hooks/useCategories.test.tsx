import { renderHook } from "@testing-library/react-native";
import type { Category } from "@monyvi/db";

interface UseAllCategoriesMockResult {
  readonly categories: readonly Category[];
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly retry: () => void;
}

const mockRetry = jest.fn();
const mockUseAllCategories = jest.fn<UseAllCategoriesMockResult, []>();

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: () => mockUseAllCategories(),
}));

import { useCategories } from "@/hooks/useCategories";

describe("useCategories", () => {
  beforeEach(() => {
    mockRetry.mockClear();
    mockUseAllCategories.mockReturnValue({
      categories: [],
      isLoading: false,
      error: null,
      retry: mockRetry,
    });
  });

  it("forwards category observation recovery state to form consumers", () => {
    const observationError = new Error("category observation failed");
    mockUseAllCategories.mockReturnValue({
      categories: [],
      isLoading: false,
      error: observationError,
      retry: mockRetry,
    });

    const { result } = renderHook(() => useCategories());

    expect(result.current.error).toBe(observationError);
    expect(result.current.retry).toBe(mockRetry);
  });
});
