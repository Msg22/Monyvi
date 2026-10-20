import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AccountReviewCategoryChoice } from "@/components/transaction-review/account-review-category-choice";
import type {
  ReviewFeedbackBoundary,
  ReviewNotice,
} from "@/hooks/useReviewNotice";
import { makeT025ReviewSession } from "../../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import type { Category } from "@monyvi/db";

const mockChildren = [
  mockCategory({
    id: "clothes",
    displayName: "Clothes",
    systemName: "clothes",
  }),
  mockCategory({
    id: "accessories",
    displayName: "Accessories",
    systemName: "accessories",
  }),
  mockCategory({
    id: "footwear",
    displayName: "Footwear",
    systemName: "footwear",
  }),
];

function mockCategory(overrides: Partial<Category>): Category {
  const model = {
    id: "category",
    color: "nileGreen",
    displayName: "Category",
    icon: "shirt",
    iconLibrary: "Ionicons",
    isHidden: false,
    isInternal: false,
    parentId: "shopping",
    systemName: "category",
    type: "EXPENSE",
    ...overrides,
  };

  return model as Category;
}

jest.mock("@/components/category-selector", () => ({
  Breadcrumb: (): null => null,
  CategoryListItem: ({
    category: item,
    onSelect,
  }: {
    readonly category: Category;
    readonly onSelect: () => void;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.TouchableOpacity
        testID={"category-item-" + item.id}
        onPress={onSelect}
      >
        <ReactNative.Text>{item.displayName}</ReactNative.Text>
      </ReactNative.TouchableOpacity>
    );
  },
  CategorySearchBar: (): null => null,
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en"; readonly isRTL: false } => ({
    language: "en",
    isRTL: false,
  }),
}));

jest.mock("@/hooks/useAccountReviewEditorCategories", () => ({
  useAccountReviewEditorCategories: () => ({
    categories: mockChildren,
    isReady: true,
    hasError: false,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 24 }),
}));

jest.mock("@/hooks/useCategoryChildren", () => ({
  useCategoryChildren: (): {
    readonly children: readonly Category[];
    readonly isLoading: false;
  } => ({
    children: mockChildren,
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useCategoriesWithChildren", () => ({
  useCategoriesWithChildren: (): ReadonlySet<string> => new Set(),
}));

jest.mock("@/hooks/useCategoryNavigation", () => ({
  useCategoryNavigation: (): {
    readonly stack: readonly [
      { readonly category: null; readonly label: "All Categories" },
      { readonly category: Category; readonly label: "Shopping" },
    ];
    readonly currentLevel: {
      readonly category: Category;
      readonly label: string;
    };
    readonly depth: 1;
    readonly searchQuery: "";
    readonly direction: "forward";
    readonly drillInto: jest.Mock;
    readonly goBack: jest.Mock;
    readonly jumpToLevel: jest.Mock;
    readonly reset: jest.Mock;
    readonly setSearchQuery: jest.Mock;
  } => ({
    stack: [
      { category: null, label: "All Categories" },
      {
        category: mockCategory({
          id: "shopping",
          displayName: "Shopping",
          parentId: undefined,
          systemName: "shopping",
        }),
        label: "Shopping",
      },
    ],
    currentLevel: {
      category: mockCategory({
        id: "shopping",
        displayName: "Shopping",
        parentId: undefined,
        systemName: "shopping",
      }),
      label: "Shopping",
    },
    depth: 1,
    searchQuery: "",
    direction: "forward",
    drillInto: jest.fn(),
    goBack: jest.fn(),
    jumpToLevel: jest.fn(),
    reset: jest.fn(),
    setSearchQuery: jest.fn(),
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("CategorySelectorModal", () => {
  it("renders unique child rows without clipped subviews in the animated modal list", () => {
    const view = render(
      <CategorySelectorModal
        visible
        rootCategories={[]}
        selectedId="unselected-category"
        type="EXPENSE"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getAllByText("Clothes")).toHaveLength(1);
    expect(screen.getAllByText("Accessories")).toHaveLength(1);
    expect(screen.getAllByText("Footwear")).toHaveLength(1);
    expect(
      view.UNSAFE_getByProps({ removeClippedSubviews: false })
    ).toBeTruthy();
  });
  it("keeps an optional caller notice below the fixed selector header and outside the list", () => {
    render(
      <CategorySelectorModal
        visible
        rootCategories={[]}
        selectedId={null}
        type="EXPENSE"
        onSelect={jest.fn()}
        onClose={jest.fn()}
        inlineNotice={
          <Text testID="category-selector-inline-notice">
            Review needs attention
          </Text>
        }
      />
    );
    expect(
      screen.getByTestId("category-selector-inline-notice")
    ).toHaveTextContent("Review needs attention");
    expect(screen.getByTestId("category-selector-list")).toBeTruthy();
    expect(
      within(screen.getByTestId("category-selector-list")).queryByTestId(
        "category-selector-inline-notice"
      )
    ).toBeNull();
  });

  it("deducts the measured notice height, clamps the list, and resets on removal", () => {
    const props = {
      visible: true,
      rootCategories: [],
      selectedId: null,
      type: "EXPENSE" as const,
      onSelect: jest.fn(),
      onClose: jest.fn(),
    };
    const listHeight = (): number => {
      const rawStyle: unknown = screen.getByTestId(
        "category-selector-list-viewport"
      ).props.style;
      const styles: readonly unknown[] = Array.isArray(rawStyle)
        ? rawStyle
        : [rawStyle];
      for (const style of styles) {
        const entry: unknown = style;
        if (
          entry !== null &&
          typeof entry === "object" &&
          "maxHeight" in entry &&
          typeof entry.maxHeight === "number"
        )
          return entry.maxHeight;
      }
      throw new Error("Missing numeric list budget");
    };
    const view = render(<CategorySelectorModal {...props} />);
    const normalBudget = listHeight();
    expect(normalBudget).toBeGreaterThan(0);
    view.rerender(
      <CategorySelectorModal
        {...props}
        inlineNotice={<Text>Category requires attention</Text>}
      />
    );
    const region = screen.getByTestId("category-selector-inline-notice-region");
    fireEvent(region, "layout", { nativeEvent: { layout: { height: 64 } } });
    expect(listHeight()).toBe(Math.max(0, normalBudget - 64));
    fireEvent(region, "layout", {
      nativeEvent: { layout: { height: normalBudget + 100 } },
    });
    expect(listHeight()).toBe(0);
    view.rerender(<CategorySelectorModal {...props} />);
    expect(
      screen.queryByTestId("category-selector-inline-notice-region")
    ).toBeNull();
    expect(listHeight()).toBe(normalBudget);
  });

  it("keeps a rejected row-category command open with visible modal feedback", async () => {
    const session = makeT025ReviewSession();
    const row = session.rows[0];
    if (!row) throw new Error("Missing canonical review row");
    const onClose = jest.fn();
    const reported = jest.fn();
    function RejectedCategory(): React.JSX.Element {
      const [notice, setNotice] = React.useState<ReviewNotice | null>(null);
      const feedback: ReviewFeedbackBoundary = {
        pageNotice: null,
        modalNotice: notice,
        reportFailure: (failure) => {
          reported(failure);
          setNotice({
            tone: "warning",
            title: "Category not saved",
            message: "Choose a category again",
          });
        },
        showNotice: jest.fn(),
        dismiss: () => setNotice(null),
      };
      return (
        <AccountReviewCategoryChoice
          row={row}
          ownerId={session.ownerId}
          reviewFeedback={feedback}
          onClose={onClose}
          onSelect={(categoryId) => {
            expect(categoryId).toBe("clothes");
            feedback.reportFailure({
              stage: "command",
              surface: "modal",
              reasonCodes: ["review_revision_stale"],
            });
            return Promise.resolve(false);
          }}
        />
      );
    }
    render(<RejectedCategory />);
    fireEvent.press(screen.getByTestId("category-item-clothes"));
    await waitFor(() => {
      expect(reported).toHaveBeenCalledWith({
        stage: "command",
        surface: "modal",
        reasonCodes: ["review_revision_stale"],
      });
      expect(screen.getByTestId("review-inline-notice-modal")).toBeTruthy();
    });
    expect(screen.getByText("Choose a category again")).toBeTruthy();
    expect(screen.getByTestId("category-selector-sheet")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
