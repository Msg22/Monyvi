import { useCallback, useMemo, useRef, useState } from "react";

export interface TransactionReviewSelectionChange {
  readonly index: number;
  readonly selected: boolean;
}

interface UseTransactionReviewSelectionProps {
  readonly transactionKeys: readonly string[];
  readonly onSelectionChange?: (
    index: number,
    selected: boolean
  ) => void | Promise<void>;
  readonly onSelectionChanges?: (
    changes: readonly TransactionReviewSelectionChange[]
  ) => void | Promise<void>;
  readonly onPersistenceError: () => void;
}

export interface UseTransactionReviewSelectionResult {
  readonly selectedIndices: ReadonlySet<number>;
  readonly selectedIndicesRef: React.MutableRefObject<ReadonlySet<number>>;
  readonly replaceSelectedIndices: (indices: ReadonlySet<number>) => void;
  readonly resetSelection: () => void;
  readonly isManuallyDeselected: (index: number) => boolean;
  readonly toggleSelection: (index: number) => Promise<void>;
  readonly setSelections: (
    indices: readonly number[],
    selected: boolean
  ) => Promise<void>;
  readonly ensureSelected: (index: number) => Promise<boolean>;
}

export function useTransactionReviewSelection({
  transactionKeys,
  onSelectionChange,
  onSelectionChanges,
  onPersistenceError,
}: UseTransactionReviewSelectionProps): UseTransactionReviewSelectionResult {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const manuallyDeselectedKeysRef = useRef<Set<string>>(new Set());
  const operationByKeyRef = useRef(new Map<string, number>());
  const operationSequenceRef = useRef(0);

  const selectedIndices = useMemo<ReadonlySet<number>>(() => {
    const indices = new Set<number>();
    transactionKeys.forEach((key, index) => {
      if (selectedKeys.has(key)) indices.add(index);
    });
    return indices;
  }, [selectedKeys, transactionKeys]);
  const selectedIndicesRef = useRef<ReadonlySet<number>>(selectedIndices);
  selectedIndicesRef.current = selectedIndices;

  const applySelection = useCallback(
    (indices: readonly number[], selected: boolean): Map<string, number> => {
      const operations = new Map<string, number>();
      indices.forEach((index) => {
        const key = transactionKeys[index];
        if (!key) return;
        const operationId = operationSequenceRef.current + 1;
        operationSequenceRef.current = operationId;
        operationByKeyRef.current.set(key, operationId);
        operations.set(key, operationId);
      });
      setSelectedKeys((previous) => {
        const next = new Set(previous);
        operations.forEach((_, key) => {
          if (selected) {
            next.add(key);
            manuallyDeselectedKeysRef.current.delete(key);
          } else {
            next.delete(key);
            manuallyDeselectedKeysRef.current.add(key);
          }
        });
        return next;
      });
      return operations;
    },
    [transactionKeys]
  );

  const rollbackSelection = useCallback(
    (
      operations: ReadonlyMap<string, number>,
      attemptedSelection: boolean
    ): void => {
      setSelectedKeys((previous) => {
        const next = new Set(previous);
        operations.forEach((operationId, key) => {
          if (operationByKeyRef.current.get(key) !== operationId) return;
          if (attemptedSelection) {
            next.delete(key);
            manuallyDeselectedKeysRef.current.add(key);
          } else {
            next.add(key);
            manuallyDeselectedKeysRef.current.delete(key);
          }
        });
        return next;
      });
    },
    []
  );

  const persistOne = useCallback(
    async (index: number, selected: boolean): Promise<boolean> => {
      try {
        await onSelectionChange?.(index, selected);
        return true;
      } catch {
        onPersistenceError();
        return false;
      }
    },
    [onPersistenceError, onSelectionChange]
  );

  const setSelections = useCallback(
    async (indices: readonly number[], selected: boolean): Promise<void> => {
      const operations = applySelection(indices, selected);
      try {
        if (onSelectionChanges) {
          await onSelectionChanges(
            indices.map((index) => ({ index, selected }))
          );
          return;
        }
        const persisted = await Promise.all(
          indices.map((index) => persistOne(index, selected))
        );
        if (persisted.some((succeeded) => !succeeded)) {
          rollbackSelection(operations, selected);
        }
      } catch {
        rollbackSelection(operations, selected);
        onPersistenceError();
      }
    },
    [
      applySelection,
      onPersistenceError,
      onSelectionChanges,
      persistOne,
      rollbackSelection,
    ]
  );

  const toggleSelection = useCallback(
    async (index: number): Promise<void> => {
      const selected = !selectedIndicesRef.current.has(index);
      const operations = applySelection([index], selected);
      if (!(await persistOne(index, selected))) {
        rollbackSelection(operations, selected);
      }
    },
    [applySelection, persistOne, rollbackSelection]
  );

  const ensureSelected = useCallback(
    async (index: number): Promise<boolean> => {
      const operations = applySelection([index], true);
      const persisted = await persistOne(index, true);
      if (!persisted) rollbackSelection(operations, true);
      return persisted;
    },
    [applySelection, persistOne, rollbackSelection]
  );

  const replaceSelectedIndices = useCallback(
    (indices: ReadonlySet<number>): void => {
      setSelectedKeys(
        new Set(
          [...indices].flatMap((index) =>
            transactionKeys[index] ? [transactionKeys[index]] : []
          )
        )
      );
    },
    [transactionKeys]
  );

  const resetSelection = useCallback((): void => {
    manuallyDeselectedKeysRef.current = new Set();
    operationByKeyRef.current.clear();
    setSelectedKeys(new Set());
  }, []);

  const isManuallyDeselected = useCallback(
    (index: number): boolean =>
      manuallyDeselectedKeysRef.current.has(transactionKeys[index] ?? ""),
    [transactionKeys]
  );

  return {
    selectedIndices,
    selectedIndicesRef,
    replaceSelectedIndices,
    resetSelection,
    isManuallyDeselected,
    toggleSelection,
    setSelections,
    ensureSelected,
  };
}
