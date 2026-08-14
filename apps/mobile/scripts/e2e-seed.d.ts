export interface E2eSeedConfig {
  readonly mode: "local" | "remote";
  readonly supabaseUrl: string;
  readonly appSupabaseUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly email: string;
  readonly password: string | null;
  readonly preserveExistingPassword: boolean;
  readonly userId?: string;
}

export interface E2eSeedConfigOptions {
  readonly readLocalSupabaseStatusEnv?: () => string;
}

export const E2E_TABLE_DELETE_ORDER: readonly string[];

export interface E2eBudgetFixtureRows {
  readonly categories?: readonly {
    readonly display_name: string;
    readonly deleted: boolean;
  }[];
  readonly budgets: readonly {
    readonly name: string;
    readonly amount: number;
    readonly category_id: string | null;
    readonly period: string;
    readonly period_end: string;
    readonly status: string;
    readonly type: string;
  }[];
  readonly transactions?: readonly {
    readonly amount: number;
    readonly category_id: string;
    readonly type: string;
  }[];
}

export interface E2eFixture {
  readonly seedScope: string;
  readonly buildExtraRows?: (args: {
    readonly categoryIds: Readonly<Record<string, string>>;
    readonly currentTimestamp: string;
    readonly dateFromToday: (offset: number) => string;
    readonly deterministicUuid: (
      scope: string,
      userId: string,
      key: string
    ) => string;
    readonly fixedNow: string;
    readonly seedIds: {
      readonly accounts: { readonly cash: string };
      readonly budgets: Readonly<Record<string, string>>;
    };
    readonly seedScope: string;
    readonly userId: string;
  }) => E2eBudgetFixtureRows;
}

export function getE2eFixture(
  env?: Record<string, string | undefined>
): E2eFixture;

export function getE2eSeedConfig(
  env?: Record<string, string | undefined>,
  options?: E2eSeedConfigOptions
): E2eSeedConfig;

export function seedE2eData(
  client: unknown,
  config: E2eSeedConfig
): Promise<{ readonly userId: string }>;

export function resetE2eData(
  client: unknown,
  config: E2eSeedConfig
): Promise<{ readonly userId: string }>;
