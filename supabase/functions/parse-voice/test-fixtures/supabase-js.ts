import {
  getAuthUserId,
  getConsentValue,
  invokeRpc,
  recordAuthToken,
} from "./state.ts";

interface FakeError {
  readonly message: string;
}

interface FakeProfileQuery {
  readonly select: (columns: string) => FakeProfileQuery;
  readonly eq: (column: string, value: unknown) => FakeProfileQuery;
  readonly maybeSingle: () => Promise<{
    readonly data: { readonly ai_processing_consent: unknown } | null;
    readonly error: FakeError | null;
  }>;
}

interface FakeSupabaseClient {
  readonly auth: {
    readonly getUser: (token: string) => Promise<{
      readonly data: {
        readonly user: { readonly id: string } | null;
      };
      readonly error: FakeError | null;
    }>;
  };
  readonly from: (tableName: string) => FakeProfileQuery;
  readonly rpc: (
    name: string,
    params: Readonly<Record<string, unknown>>
  ) => Promise<{
    readonly data: unknown;
    readonly error: FakeError | null;
  }>;
}

function createProfileQuery(): FakeProfileQuery {
  const query: FakeProfileQuery = {
    select: (_columns: string): FakeProfileQuery => query,
    eq: (_column: string, _value: unknown): FakeProfileQuery => query,
    maybeSingle: async (): Promise<{
      readonly data: { readonly ai_processing_consent: unknown };
      readonly error: null;
    }> => ({
      data: { ai_processing_consent: getConsentValue() },
      error: null,
    }),
  };
  return query;
}

export function createClient(
  _url: string,
  _key: string,
  _options?: unknown
): FakeSupabaseClient {
  return {
    auth: {
      getUser: async (
        token: string
      ): Promise<{
        readonly data: {
          readonly user: { readonly id: string } | null;
        };
        readonly error: null;
      }> => {
        recordAuthToken(token);
        const userId = getAuthUserId();
        return {
          data: {
            user: userId === null ? null : { id: userId },
          },
          error: null,
        };
      },
    },
    from: (tableName: string): FakeProfileQuery => {
      if (tableName !== "profiles") {
        throw new Error(
          `Unexpected table access in parse-voice test: ${tableName}`
        );
      }
      return createProfileQuery();
    },
    rpc: async (
      name: string,
      params: Readonly<Record<string, unknown>>
    ): Promise<{
      readonly data: unknown;
      readonly error: FakeError | null;
    }> => invokeRpc(name, params),
  };
}
