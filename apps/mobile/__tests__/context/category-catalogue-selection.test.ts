import { renderHook } from "@testing-library/react-native";
import type { Category } from "@monyvi/db";
import { useSelectableCategories } from "@/hooks/useSelectableCategories";
import { useAllCategories } from "@/context/CategoriesContext";
import type { CategoryCatalogueSnapshot } from "@/services/category-catalogue-service";

const mockAllCategories: readonly Category[] = [
  {
    id: "system-current",
    displayName: "Electricity",
    isSystem: true,
    isInternal: false,
    isHidden: false,
    level: 2,
    userId: null,
  },
  {
    id: "system-legacy",
    displayName: "Electricity",
    isSystem: true,
    isInternal: false,
    isHidden: false,
    level: 2,
    userId: null,
  },
  {
    id: "custom-own",
    displayName: "Electricity",
    isSystem: false,
    isInternal: false,
    isHidden: false,
    level: 2,
    userId: "owner-1",
  },
  {
    id: "internal",
    displayName: "Internal",
    isSystem: true,
    isInternal: true,
    isHidden: false,
    level: 1,
    userId: null,
  },
] as unknown as readonly Category[];

const mockCatalogueSnapshot: CategoryCatalogueSnapshot = {
  status: "ready",
  origin: "https://project.supabase.co",
  ownerId: "owner-1",
  selectedSystemIds: new Set(["system-current"]),
  acceptedAt: 1_700_000_000_000,
  error: null,
};

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: (): {
    categories: readonly Category[];
    isLoading: boolean;
  } => ({
    categories: mockAllCategories,
    isLoading: false,
  }),
  useCategoryCatalogueSnapshot: (): CategoryCatalogueSnapshot =>
    mockCatalogueSnapshot,
}));

describe("useSelectableCategories", (): void => {
  it("offers every current catalogue item once and keeps the owner's own categories", (): void => {
    const { result } = renderHook(() => useSelectableCategories());

    expect(result.current.categories.map((entry) => entry.id)).toEqual([
      "system-current",
      "custom-own",
    ]);
    expect(result.current.status).toBe("ready");
  });

  it("keeps the shared lookup list unchanged so old records still resolve", (): void => {
    const { result } = renderHook(() => useAllCategories());

    expect(result.current.categories).toHaveLength(4);
    expect(result.current.categories.map((entry) => entry.id)).toContain(
      "system-legacy"
    );
  });
});
