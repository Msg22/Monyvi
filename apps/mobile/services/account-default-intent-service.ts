/**
 * #395 T068 additive Add-default command service.
 *
 * prepare() freezes the complete original command once; commitPrepared()
 * submits that exact immutable envelope through the feature foundation.
 * This is a narrow production DI boundary, not a debug or test-only API.
 */
import type { Sha256Provider } from "@monyvi/logic";
import {
  accountFormSchema,
  type AccountFormData,
} from "../validation/account-validation";
import type { CurrentUserDataScope } from "./user-data-access";
import {
  createAccountDefaultFinancialCommandService,
} from "./account-review-financial-command-service";
import {
  readOwnedDefaultSnapshot,
  readDefaultCreatorDependencies,
} from "./account-default-intent-snapshot";
import {
  prepareAccountDefaultCommand,
  type AccountDefaultPreparedCommand,
} from "./account-default-intent-command";
import {
  prepareAccountDefaultLinkedPlan,
  type AccountDefaultPlanDependencies,
} from "./account-default-intent-plan";

export interface AccountDefaultIntentDependencies
  extends AccountDefaultPlanDependencies {
  readonly createId: () => string;
  readonly now: () => Date;
  readonly hashProvider: Sha256Provider;
}
export interface AccountDefaultIntentService {
  readonly prepare: (
    userId: string,
    form: Readonly<AccountFormData>
  ) => Promise<AccountDefaultPreparedCommand>;
  readonly commitPrepared: (
    original: AccountDefaultPreparedCommand
  ) => Promise<{ readonly kind: "committed" | "replay"; readonly accountId: string }>;
  readonly create: (
    userId: string,
    form: Readonly<AccountFormData>
  ) => Promise<{ readonly kind: "committed" | "replay"; readonly accountId: string }>;
}
function fail(reason: string): never {
  throw new Error("account_default_" + reason);
}
/** Factory can be bound to production or a real test SQLite database. */
export function createAccountDefaultIntentService(
  dep: AccountDefaultIntentDependencies
): AccountDefaultIntentService {
  const financial = createAccountDefaultFinancialCommandService(dep.database);
  const ownerScope = async (userId: string): Promise<CurrentUserDataScope> => {
    await dep.assertExpectedCurrentUser(userId);
    const scope = await dep.getCurrentUserDataScope();
    if (scope.userId !== userId) fail("auth_scope_changed");
    return scope;
  };
  const prepare = async (
    userId: string,
    form: Readonly<AccountFormData>
  ): Promise<AccountDefaultPreparedCommand> => {
    const validated = accountFormSchema.parse(form);
    if (validated.defaultIntent === undefined)
      fail("explicit_intent_required");
    const scope = await ownerScope(userId);
    const snapshot = await readOwnedDefaultSnapshot(dep.database, scope);
    dep.assertNoDuplicateAccountIdentity(snapshot.accounts, validated);
    const dependencyActionIds = await readDefaultCreatorDependencies(
      dep.database, scope, snapshot.snapshot
    );
    await dep.assertExpectedCurrentUser(userId);
    // From here, every planned ID, amount, default and dependency is fixed.
    // The writer later compares this ORIGINAL logical snapshot to current state.
    return prepareAccountDefaultCommand({
      ownerId: userId,
      form: validated,
      snapshot: snapshot.snapshot,
      dependencyActionIds,
      createId: dep.createId,
      occurredAt: dep.now().toISOString(),
    });
  };
  const commitPrepared = async (
    original: AccountDefaultPreparedCommand
  ): Promise<{ readonly kind: "committed" | "replay"; readonly accountId: string }> => {
    await dep.assertExpectedCurrentUser(original.ownerId);
    const result = await financial.execute({
      envelope: original.envelope,
      hashProvider: dep.hashProvider,
      prepareDomainOperationPlan: () =>
        prepareAccountDefaultLinkedPlan(original, dep),
    });
    return { kind: result.kind, accountId: original.accountId };
  };
  return {
    prepare,
    commitPrepared,
    create: async (userId, form) => commitPrepared(await prepare(userId, form)),
  };
}
