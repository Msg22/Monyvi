import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import type { CategoryCatalogueSnapshot } from "@/services/category-catalogue-service";

const mockReloadCatalogue = jest.fn<Promise<void>, []>();
const mockSync = jest.fn<Promise<void>, [boolean?]>();

jest.mock("@/utils/category-catalogue-retry", () => ({
  requestCatalogueSync: (): Promise<void> => mockSync(),
}));

jest.mock("@monyvi/db", () => ({
  database: { name: "test-database" },
}));

const mockSnapshot: { current: CategoryCatalogueSnapshot } = {
  current: {
    status: "ready",
    origin: "https://project.supabase.co",
    ownerId: "owner-1",
    selectedSystemIds: new Set<string>(),
    acceptedAt: 1_700_000_000_000,
    error: null,
  },
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false, theme: { text: { primary: "#000" } } }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useOptionalCategoryCatalogue: () => ({
    catalogue: mockSnapshot.current,
    reloadCatalogue: mockReloadCatalogue,
  }),
  useAllCategories: () => ({
    categories: [],
    isLoading: false,
    error: null,
    retry: jest.fn(),
  }),
  useCategoryCatalogueSnapshot: () => mockSnapshot.current,
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: () => ({ children: [], isLoading: false }),
}));

jest.mock("@/hooks/useCategoriesWithChildren", () => ({
  useCategoriesWithChildren: () => new Set<string>(),
}));

function renderModal(): void {
  render(
    <CategorySelectorModal
      visible
      rootCategories={[]}
      selectedId={null}
      type="EXPENSE"
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />
  );
}

describe("CategorySelectorModal catalogue states", (): void => {
  beforeEach((): void => {
    mockReloadCatalogue.mockReset();
    mockSync.mockReset();
    mockSync.mockResolvedValue(undefined);
    mockReloadCatalogue.mockResolvedValue(undefined);
    mockSnapshot.current = {
      status: "ready",
      origin: "https://project.supabase.co",
      ownerId: "owner-1",
      selectedSystemIds: new Set<string>(),
      acceptedAt: 1_700_000_000_000,
      error: null,
    };
  });

  it("shows a loading state while the catalogue manifest is read", (): void => {
    mockSnapshot.current = {
      status: "loading",
      origin: "https://project.supabase.co",
      ownerId: "owner-1",
      selectedSystemIds: new Set<string>(),
      acceptedAt: null,
      error: null,
    };

    renderModal();

    expect(screen.getByText("loading")).toBeTruthy();
  });

  it("shows a retryable unavailable state instead of the empty list", (): void => {
    mockSnapshot.current = {
      status: "unavailable",
      origin: "https://project.supabase.co",
      ownerId: "owner-1",
      selectedSystemIds: new Set<string>(),
      acceptedAt: null,
      error: "manifest_unreadable",
    };

    renderModal();

    expect(screen.getByText("categories_unavailable")).toBeTruthy();
    expect(screen.getByTestId("category-catalogue-retry")).toBeTruthy();
    expect(screen.queryByText("no_categories_found")).toBeNull();
  });

  it("requests the ordinary sync and re-reads the manifest on retry", async (): Promise<void> => {
    mockSnapshot.current = {
      status: "unavailable",
      origin: "https://project.supabase.co",
      ownerId: "owner-1",
      selectedSystemIds: new Set<string>(),
      acceptedAt: null,
      error: "manifest_unreadable",
    };

    renderModal();
    const retry = screen.getByTestId("category-catalogue-retry");
    fireEvent.press(retry);
    await waitFor(() => {
      expect(mockSync).toHaveBeenCalled();
      expect(mockReloadCatalogue).toHaveBeenCalled();
    });
  });
});
