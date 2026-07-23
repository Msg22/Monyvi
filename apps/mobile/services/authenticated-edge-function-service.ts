import type { FunctionInvokeOptions } from "@supabase/supabase-js";

import { clearPersistedAuthSession, supabase } from "./supabase";

const EDGE_FUNCTION_AUTHENTICATION_ERROR_NAME =
  "EdgeFunctionAuthenticationRequiredError";
const HTTP_UNAUTHORIZED_STATUS = 401;

interface EdgeFunctionResponse<TData> {
  readonly data: TData | null;
  readonly error: unknown;
}

interface AuthenticatedEdgeFunctionRecovery {
  readonly beforeRetry?: () => Promise<void>;
}

function createEdgeFunctionAuthenticationError(): Error {
  const error = new Error("Authenticated Edge Function session required");
  error.name = EDGE_FUNCTION_AUTHENTICATION_ERROR_NAME;
  return error;
}

export function isEdgeFunctionAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === EDGE_FUNCTION_AUTHENTICATION_ERROR_NAME
  );
}

export function getEdgeFunctionErrorStatus(error: unknown): number | undefined {
  const context = (error as { readonly context?: unknown } | null)?.context;
  return context instanceof Response ? context.status : undefined;
}

async function clearInvalidLocalSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    await clearPersistedAuthSession();
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    return error === null ? (data.session?.access_token ?? null) : null;
  } catch {
    return null;
  }
}

function withAuthorization(
  options: FunctionInvokeOptions,
  accessToken: string
): FunctionInvokeOptions {
  return {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function invokeAuthenticatedEdgeFunction<TData>(
  functionName: string,
  options: FunctionInvokeOptions,
  recovery: AuthenticatedEdgeFunctionRecovery = {}
): Promise<EdgeFunctionResponse<TData>> {
  const firstResponse = await supabase.functions.invoke<TData>(
    functionName,
    options
  );
  if (
    firstResponse.error === null ||
    getEdgeFunctionErrorStatus(firstResponse.error) !== HTTP_UNAUTHORIZED_STATUS
  ) {
    return firstResponse;
  }

  const accessToken = await refreshAccessToken();
  if (accessToken === null) {
    await clearInvalidLocalSession();
    throw createEdgeFunctionAuthenticationError();
  }

  await recovery.beforeRetry?.();
  const retryResponse = await supabase.functions.invoke<TData>(
    functionName,
    withAuthorization(options, accessToken)
  );
  if (
    retryResponse.error !== null &&
    getEdgeFunctionErrorStatus(retryResponse.error) === HTTP_UNAUTHORIZED_STATUS
  ) {
    await clearInvalidLocalSession();
    throw createEdgeFunctionAuthenticationError();
  }

  return retryResponse;
}
