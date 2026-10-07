import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { handleEmailVerificationResendRequest } from "../../supabase/functions/_shared/email-verification-resend-handler.ts";

test("deployed resend entrypoint reserves with two resends, 120s cooldown and anchored 24h window", async (): Promise<void> => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/email-verification-resend/index.ts",
      import.meta.url
    ),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const calls: {
    readonly name: string;
    readonly input: Record<string, unknown>;
  }[] = [];
  let serveHandler: ((request: Request) => Promise<Response>) | undefined;
  const client = {
    rpc: async (
      name: string,
      input: Record<string, unknown>
    ): Promise<unknown> => {
      calls.push({ name, input });
      return {
        data: [
          {
            accepted: false,
            decision_code: "limit",
            reservation_id: null,
            available_at: "2026-10-08T00:00:00.000Z",
          },
        ],
        error: null,
      };
    },
    auth: {
      resend: async (): Promise<never> => {
        throw new Error("Limit must not call provider");
      },
    },
  };
  runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    Date,
    Deno: {
      env: { get: (): string => "test-server-value" },
      serve: (handler: (request: Request) => Promise<Response>): void => {
        serveHandler = handler;
      },
    },
    require: (name: string): unknown => {
      if (name === "edge-runtime") return {};
      if (name === "@supabase/supabase-js")
        return { createClient: (): typeof client => client };
      if (name === "../_shared/email-verification-resend-handler.ts")
        return { handleEmailVerificationResendRequest };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  assert.ok(serveHandler, "Entrypoint must register its real request handler");
  const response = await serveHandler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        operation: "resend",
        email: "pending@example.com",
      }),
    })
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "email_verification_reserve_resend");
  assert.equal(calls[0]?.input.p_max_resends, 2);
  assert.equal(calls[0]?.input.p_cooldown_seconds, 120);
  assert.equal(calls[0]?.input.p_window_seconds, 86_400);
  assert.equal(calls[0]?.input.p_reservation_lease_seconds, 30);
  const payload: unknown = await response.json();
  assert.ok(
    typeof payload === "object" && payload !== null && "status" in payload
  );
  assert.equal(payload.status, "limit");
});
