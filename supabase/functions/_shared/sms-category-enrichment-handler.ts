import {
  parseSmsCategoryRequest,
  type SmsCategoryRequest,
  type SmsCategoryResponse,
} from "./sms-category-enrichment-contract.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AuthenticatedUser {
  readonly userId: string;
}

export interface SmsCategoryHandlerDependencies {
  readonly authenticate: (
    authHeader: string | null
  ) => Promise<AuthenticatedUser | null>;
  readonly hasConsent: (userId: string) => Promise<boolean>;
  readonly isProviderConfigured: boolean;
  readonly classify: (
    request: SmsCategoryRequest,
    signal: AbortSignal
  ) => Promise<SmsCategoryResponse | null>;
  readonly logInfo: (...values: readonly unknown[]) => void;
  readonly logError: (...values: readonly unknown[]) => void;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message, code: status }, status);
}

export async function handleSmsCategoryEnrichmentRequest(
  request: Request,
  dependencies: SmsCategoryHandlerDependencies
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST")
    return errorResponse("Method not allowed", 405);

  try {
    const auth = await dependencies.authenticate(
      request.headers.get("authorization")
    );
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!(await dependencies.hasConsent(auth.userId))) {
      return errorResponse("AI processing consent required", 403);
    }

    const body = parseSmsCategoryRequest(await request.json());
    if (body === null) return errorResponse("Invalid request payload", 400);
    if (!dependencies.isProviderConfigured) {
      return errorResponse("Category service unavailable", 500);
    }

    const result = await dependencies.classify(body, request.signal);
    if (result === null)
      return errorResponse("Category service unavailable", 502);

    dependencies.logInfo("[enrich-sms-categories] Classification completed", {
      merchantCount: body.merchants.length,
      resultCount: result.categories.length,
    });
    return jsonResponse(result);
  } catch (error: unknown) {
    dependencies.logError("[enrich-sms-categories] Request failed", {
      errorType: error instanceof Error ? error.name || "Error" : typeof error,
    });
    return errorResponse("Internal server error", 500);
  }
}
