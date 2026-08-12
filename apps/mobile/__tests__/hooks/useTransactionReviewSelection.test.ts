import { act, renderHook } from "@testing-library/react-native";

import { useTransactionReviewSelection } from "@/hooks/useTransactionReviewSelection";

describe("useTransactionReviewSelection", () => {
  it("updates selection before persistence completes", async () => {
    let finishPersistence: (() => void) | undefined;
    const onSelectionChange = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPersistence = resolve;
        })
    );
    const { result } = renderHook(() =>
      useTransactionReviewSelection({
        transactionKeys: ["first"],
        onSelectionChange,
        onPersistenceError: jest.fn(),
      })
    );

    let request!: Promise<void>;
    act(() => {
      request = result.current.toggleSelection(0);
    });
    expect([...result.current.selectedIndices]).toEqual([0]);

    await act(async () => {
      finishPersistence?.();
      await request;
    });
  });

  it("keeps selection attached to its key when a preceding row disappears", () => {
    const { result, rerender } = renderHook(
      ({ keys }: { readonly keys: readonly string[] }) =>
        useTransactionReviewSelection({
          transactionKeys: keys,
          onPersistenceError: jest.fn(),
        }),
      { initialProps: { keys: ["selected", "unselected"] } }
    );

    act(() => result.current.replaceSelectedIndices(new Set([0])));
    rerender({ keys: ["unselected"] });

    expect([...result.current.selectedIndices]).toEqual([]);
  });

  it("persists select all through one bulk callback", async () => {
    const onSelectionChanges = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useTransactionReviewSelection({
        transactionKeys: ["first", "second"],
        onSelectionChanges,
        onPersistenceError: jest.fn(),
      })
    );

    await act(async () => result.current.setSelections([0, 1], true));

    expect(onSelectionChanges).toHaveBeenCalledWith([
      { index: 0, selected: true },
      { index: 1, selected: true },
    ]);
    expect([...result.current.selectedIndices]).toEqual([0, 1]);
  });
});
