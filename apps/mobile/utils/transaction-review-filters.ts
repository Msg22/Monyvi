import type { TransactionTypeFilter } from "@/hooks/useTransactionsGrouping";

export function toggleTransactionTypeFilter(
  selectedTypes: readonly TransactionTypeFilter[],
  type: TransactionTypeFilter
): TransactionTypeFilter[] {
  if (type === "All") return ["All"];

  const specificTypes = selectedTypes.filter(
    (selectedType) => selectedType !== "All"
  );
  if (specificTypes.includes(type)) {
    const remainingTypes = specificTypes.filter(
      (selectedType) => selectedType !== type
    );
    return remainingTypes.length > 0 ? remainingTypes : ["All"];
  }

  return [...specificTypes, type];
}
