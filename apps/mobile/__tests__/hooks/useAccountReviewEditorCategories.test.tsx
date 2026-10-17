/**
 * #395 T054 tests-first: category loading belongs to a scoped React hook,
 * not the presentational transaction edit sheet. Never show prior-actor
 * categories while an async owner/row revision changes.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useAccountReviewEditorCategories } from "@/hooks/useAccountReviewEditorCategories";

const mockLoadCategories = jest.fn<
  Promise<ReturnType<typeof response>>,
  [string, AbortSignal?]
>();
jest.mock(
  "@/services/account-review-transaction-edit-category-service",
  () => ({
    loadCurrentAccountReviewEditorCategories: (
      ownerId: string,
      signal?: AbortSignal
    ): Promise<ReturnType<typeof response>> =>
      mockLoadCategories(ownerId, signal),
  })
);

const OWNER = "00000000-0000-4000-8000-000000000123";
const OTHER_OWNER = "00000000-0000-4000-8000-000000000124";
const ROW = "00000000-0000-4000-8000-000000000125";
const category = {
  id: "00000000-0000-4000-8000-000000000126",
  userId: null,
  isSystem: true,
  deleted: false,
  isHidden: false,
  isInternal: false,
  type: "EXPENSE",
  level: 1,
  parentId: null,
  displayName: "Shopping",
};

function props(
  overrides: Partial<{
    visible: boolean;
    ownerId: string;
    rowId: string;
    rowRevision: string;
    signal: AbortSignal;
  }> = {}
): {
  readonly visible: boolean;
  readonly ownerId: string;
  readonly rowId: string;
  readonly rowRevision: string;
  readonly signal?: AbortSignal;
} {
  return {
    visible: true,
    ownerId: OWNER,
    rowId: ROW,
    rowRevision: "0",
    ...overrides,
  };
}

function response(
  ownerId: string,
  categories = [category]
): {
  readonly snapshot: {
    readonly ownerId: string;
    readonly categories: readonly [];
  };
  readonly records: ReadonlyArray<typeof category>;
} {
  return {
    snapshot: { ownerId, categories: [] },
    records: categories,
  };
}

beforeEach(() => {
  mockLoadCategories.mockReset();
  mockLoadCategories.mockResolvedValue(response(OWNER));
});

describe("#395 T054 useAccountReviewEditorCategories", () => {
  it("loads current authenticated category options and reports ready without UI service access", async () => {
    const { result } = renderHook(() =>
      useAccountReviewEditorCategories(props())
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.categories).toEqual([category]);
    expect(result.current.hasError).toBe(false);
    expect(mockLoadCategories).toHaveBeenCalledWith(OWNER, expect.anything());
  });

  it("does not query before opening and publishes no options when invisible", () => {
    const { result } = renderHook(() =>
      useAccountReviewEditorCategories(props({ visible: false }))
    );
    expect(mockLoadCategories).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([]);
    expect(result.current.isReady).toBe(false);
  });

  it("hides first owner immediately upon a replacement, revokes its request and refuses late results", async () => {
    const oldRead: {
      resolve: (value: ReturnType<typeof response>) => void;
    } = {
      resolve: () => {
        throw new Error("old_read_not_started");
      },
    };
    mockLoadCategories
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof response>>((resolve) => {
            oldRead.resolve = resolve;
          })
      )
      .mockResolvedValueOnce(
        response(OTHER_OWNER, [
          {
            ...category,
            id: "00000000-0000-4000-8000-000000000127",
            displayName: "Other",
          },
        ])
      );
    interface CurrentReviewScopeProps {
      readonly ownerId: string;
      readonly rowRevision: string;
    }
    const { result, rerender } = renderHook(
      ({ ownerId, rowRevision }: CurrentReviewScopeProps) =>
        useAccountReviewEditorCategories(props({ ownerId, rowRevision })),
      { initialProps: { ownerId: OWNER, rowRevision: "0" } }
    );
    await waitFor(() => expect(mockLoadCategories).toHaveBeenCalledTimes(1));
    const oldSignal = mockLoadCategories.mock.calls[0]?.[1];
    if (!oldSignal) throw new Error("Missing scoped category abort signal");
    rerender({ ownerId: OTHER_OWNER, rowRevision: "1" });
    expect(result.current.categories).toEqual([]);
    expect(result.current.isReady).toBe(false);
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.categories[0]?.displayName).toBe("Other");
    await act(async () => {
      oldRead.resolve(response(OWNER));
      await Promise.resolve();
    });
    expect(result.current.categories[0]?.displayName).toBe("Other");
  });

  it("aborts on unmount and ignores late successful category loading", async () => {
    const pending: {
      resolve: (value: ReturnType<typeof response>) => void;
    } = {
      resolve: () => {
        throw new Error("unmount_read_not_started");
      },
    };
    mockLoadCategories.mockImplementation(
      () =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          pending.resolve = resolve;
        })
    );
    const { unmount } = renderHook(() =>
      useAccountReviewEditorCategories(props())
    );
    await waitFor(() => expect(mockLoadCategories).toHaveBeenCalledTimes(1));
    const signal = mockLoadCategories.mock.calls[0]?.[1];
    if (!signal) throw new Error("Missing unmount category abort signal");
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response(OWNER));
      await Promise.resolve();
    });
  });

  it("clears options and disallows publication when the external signal aborts", async () => {
    const external = new AbortController();
    const { result } = renderHook(() =>
      useAccountReviewEditorCategories(props({ signal: external.signal }))
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    act(() => {
      external.abort();
    });
    expect(result.current.categories).toEqual([]);
    expect(result.current.isReady).toBe(false);
  });

  it("sets only a safe error state when authenticated category loading fails", async () => {
    mockLoadCategories.mockRejectedValue(new Error("private category failure"));
    const { result } = renderHook(() =>
      useAccountReviewEditorCategories(props())
    );
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.categories).toEqual([]);
    expect(result.current.isReady).toBe(false);
  });

  it("never loads an already aborted editor", () => {
    const external = new AbortController();
    external.abort();
    const { result } = renderHook(() =>
      useAccountReviewEditorCategories(props({ signal: external.signal }))
    );
    expect(mockLoadCategories).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([]);
  });
});
