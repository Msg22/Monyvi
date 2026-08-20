import {
  database,
  type Budget,
  type Category,
  type CurrencyType,
  type Transaction,
} from "@monyvi/db";

import type { BudgetDetailReadModel } from "@/contracts/budget-detail-presentation";
import {
  buildBudgetDetailReadModel,
  createBudgetDetailCategoryQuery,
  createBudgetDetailTransactionQuery,
} from "@/services/budget-detail-read-model-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  observeOwnedById,
} from "@/services/user-data-access";

export interface BudgetDetailObservedValue {
  readonly budget: Budget;
  readonly readModel: BudgetDetailReadModel;
}

export interface BudgetDetailObservationOptions {
  readonly budgetId: string;
  readonly userId: string;
  readonly fallbackCurrency: CurrencyType;
  readonly getNow?: () => Date;
}

interface Observer<TValue> {
  readonly next: (value: TValue) => void;
  readonly error?: (error: unknown) => void;
}

interface Subscription {
  readonly unsubscribe: () => void;
}

const CATEGORY_DISPLAY_COLUMNS = [
  "display_name",
  "icon",
  "icon_library",
  "color",
  "parent_id",
] as const;

const TRANSACTION_DISPLAY_COLUMNS = [
  "amount",
  "currency",
  "counterparty",
  "category_id",
  "date",
  "type",
] as const;

export interface BudgetDetailObservation {
  subscribe(observer: Observer<BudgetDetailObservedValue | null>): Subscription;
}

export async function observeBudgetDetailReadModels(
  options: BudgetDetailObservationOptions
): Promise<BudgetDetailObservation> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== options.userId) {
    await assertExpectedCurrentUser(options.userId);
    throw new Error("AUTH_SCOPE_CHANGED");
  }
  const getNow = options.getNow ?? (() => new Date());

  return {
    subscribe: (observer): Subscription => {
      let isActive = true;
      let budgetGeneration = 0;
      let transactionGeneration = 0;
      let categorySubscription: Subscription | undefined;
      let transactionSubscription: Subscription | undefined;

      const clearDependencies = (): void => {
        budgetGeneration += 1;
        transactionGeneration += 1;
        categorySubscription?.unsubscribe();
        transactionSubscription?.unsubscribe();
        categorySubscription = undefined;
        transactionSubscription = undefined;
      };

      const fail = (error: unknown): void => {
        if (!isActive) return;
        clearDependencies();
        observer.error?.(error);
      };

      const budgetSubscription = observeOwnedById<Budget>(
        database.get<Budget>("budgets"),
        options.budgetId,
        options.userId
      ).subscribe({
        next: (budget): void => {
          if (!isActive) return;
          clearDependencies();
          if (!budget || budget.deleted) {
            observer.next(null);
            return;
          }

          const observedBudgetGeneration = budgetGeneration;
          let categoryQuery: ReturnType<typeof createBudgetDetailCategoryQuery>;
          try {
            categoryQuery = createBudgetDetailCategoryQuery(scope);
          } catch (error: unknown) {
            fail(error);
            return;
          }
          categorySubscription = categoryQuery
            .observeWithColumns([...CATEGORY_DISPLAY_COLUMNS])
            .subscribe({
              next: (categories: Category[]): void => {
                if (
                  !isActive ||
                  observedBudgetGeneration !== budgetGeneration
                ) {
                  return;
                }
                transactionSubscription?.unsubscribe();
                const observedTransactionGeneration = ++transactionGeneration;
                const now = getNow();
                let transactionQuery: ReturnType<
                  typeof createBudgetDetailTransactionQuery
                >;
                try {
                  transactionQuery = createBudgetDetailTransactionQuery(
                    scope,
                    budget,
                    categories,
                    now
                  );
                } catch (error: unknown) {
                  fail(error);
                  return;
                }
                transactionSubscription = transactionQuery
                  .observeWithColumns([...TRANSACTION_DISPLAY_COLUMNS])
                  .subscribe({
                    next: (transactions: Transaction[]): void => {
                      if (
                        !isActive ||
                        observedTransactionGeneration !== transactionGeneration
                      ) {
                        return;
                      }
                      try {
                        observer.next({
                          budget,
                          readModel: buildBudgetDetailReadModel(
                            {
                              budget,
                              categories,
                              transactions,
                              fallbackCurrency: options.fallbackCurrency,
                            },
                            now
                          ),
                        });
                      } catch (error: unknown) {
                        fail(error);
                      }
                    },
                    error: fail,
                  });
              },
              error: fail,
            });
        },
        error: fail,
      });

      return {
        unsubscribe: (): void => {
          if (!isActive) return;
          isActive = false;
          clearDependencies();
          budgetSubscription.unsubscribe();
        },
      };
    },
  };
}
