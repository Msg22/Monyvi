/**
 * #395 T070 — authenticated owned active/default snapshot (read only).
 * One observable owner-scoped query; writer-owned CAS remains authoritative.
 */
import { Q } from "@nozbe/watermelondb";
import type { Account } from "@monyvi/db";
import { database } from "@monyvi/db";
import { accountDefaultSnapshotSchema } from
  "@monyvi/logic/src/financial-actions/review-batch-save-shapes";
import type { AccountDefaultSnapshot } from
  "@monyvi/logic/src/financial-actions/account-create-default-shapes";
import { useCallback, useEffect, useState } from "react";
import { queryOwned } from "@/services/user-data-access";
import { useCurrentUser } from "./useCurrentUser";

export type OwnedAccountDefaultState =
  | { readonly status: "loading"; readonly ownerId: string | null }
  | {
      readonly status: "ready";
      readonly ownerId: string;
      readonly snapshot: AccountDefaultSnapshot;
      readonly defaultAccountName: string | null;
    }
  | {
      readonly status: "recovery";
      readonly ownerId: string | null;
    };

interface UseOwnedAccountDefaultStateResult {
  readonly state: OwnedAccountDefaultState;
  readonly retry: () => void;
}

/** Reject contradictions instead of choosing an arbitrary default/account. */
function projectOwnedDefault(
  accounts: readonly Account[],
  ownerId: string
): OwnedAccountDefaultState {
  if (
    accounts.some(
      (account) =>
        account.userId !== ownerId ||
        account.deleted ||
        typeof account.isDefault !== "boolean"
    )
  ) {
    return { status: "recovery", ownerId };
  }
  const defaults = accounts.filter((account) => account.isDefault);
  if (defaults.length > 1) {
    return { status: "recovery", ownerId };
  }

  const candidate = {
    activeAccountIds: accounts.map((account) => account.id).sort(),
    defaultAccount: defaults[0]
      ? { accountId: defaults[0].id, isDefault: true }
      : null,
  };
  const parsed = accountDefaultSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    return { status: "recovery", ownerId };
  }
  return {
    status: "ready",
    ownerId,
    snapshot: parsed.data,
    defaultAccountName: defaults[0]?.name ?? null,
  };
}

export function useOwnedAccountDefaultState(): UseOwnedAccountDefaultStateResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [observed, setObserved] = useState<OwnedAccountDefaultState>({
    status: "loading",
    ownerId: null,
  });
  const retry = useCallback((): void => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (isResolvingUser) {
      setObserved({ status: "loading", ownerId: null });
      return;
    }
    if (userId === null) {
      setObserved({ status: "recovery", ownerId: null });
      return;
    }

    let active = true;
    setObserved({ status: "loading", ownerId: userId });
    try {
      const subscription = queryOwned(
        database.get<Account>("accounts"),
        userId,
        Q.where("deleted", false)
      )
        .observeWithColumns(["is_default", "deleted", "name"])
        .subscribe({
          next: (accounts) => {
            if (!active) return;
            try {
              setObserved(projectOwnedDefault(accounts, userId));
            } catch {
              setObserved({ status: "recovery", ownerId: userId });
            }
          },
          error: () => {
            if (active) setObserved({ status: "recovery", ownerId: userId });
          },
        });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      setObserved({ status: "recovery", ownerId: userId });
      return () => {
        active = false;
      };
    }
  }, [isResolvingUser, userId, refreshKey]);

  const state: OwnedAccountDefaultState =
    observed.ownerId !== userId || isResolvingUser
      ? { status: "loading", ownerId: userId }
      : observed;

  return { state, retry };
}
