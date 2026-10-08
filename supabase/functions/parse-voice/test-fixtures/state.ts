export type CapturedServeHandler = (
  request: Request
) => Response | Promise<Response>;

export type ProviderResult =
  | { readonly kind: "success"; readonly text: string }
  | { readonly kind: "error"; readonly message: string };

export interface RpcResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface RpcCall {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export type RpcResponder = (
  name: string,
  params: Readonly<Record<string, unknown>>
) => Promise<RpcResult>;

const ACTIVE_CONSENT = {
  version: "2026-07-ai-processing-v1",
  consentedAt: "2026-10-07T12:00:00.000Z",
  revokedAt: null,
} as const;

let capturedServeHandler: CapturedServeHandler | null = null;
let authUserId: string | null = "voice-user";
let consentValue: unknown = ACTIVE_CONSENT;
let providerResults: ProviderResult[] = [];
let providerInvocations: unknown[] = [];
let authTokens: string[] = [];
let rpcCalls: RpcCall[] = [];
let rpcResponder: RpcResponder | null = null;

export function resetParseVoiceTestState(): void {
  authUserId = "voice-user";
  consentValue = ACTIVE_CONSENT;
  providerResults = [];
  providerInvocations = [];
  authTokens = [];
  rpcCalls = [];
  rpcResponder = null;
}

export function setCapturedServeHandler(handler: CapturedServeHandler): void {
  capturedServeHandler = handler;
}

export function getCapturedServeHandler(): CapturedServeHandler {
  if (capturedServeHandler === null) {
    throw new Error("parse-voice did not register a Deno.serve handler");
  }
  return capturedServeHandler;
}

export function setAuthUserId(userId: string | null): void {
  authUserId = userId;
}

export function getAuthUserId(): string | null {
  return authUserId;
}

export function setConsentValue(value: unknown): void {
  consentValue = value;
}

export function getConsentValue(): unknown {
  return consentValue;
}

export function recordAuthToken(token: string): void {
  authTokens.push(token);
}

export function getAuthTokens(): readonly string[] {
  return [...authTokens];
}

export function setProviderResults(results: readonly ProviderResult[]): void {
  providerResults = [...results];
}

export function takeProviderResult(): ProviderResult {
  const result = providerResults.shift();
  if (result === undefined) {
    throw new Error("Provider test double has no configured result");
  }
  return result;
}

export function recordProviderInvocation(input: unknown): void {
  providerInvocations.push(input);
}

export function getProviderInvocations(): readonly unknown[] {
  return [...providerInvocations];
}

export function setRpcResponder(responder: RpcResponder): void {
  rpcResponder = responder;
}

export async function invokeRpc(
  name: string,
  params: Readonly<Record<string, unknown>>
): Promise<RpcResult> {
  rpcCalls.push({ name, params });
  if (rpcResponder === null) {
    throw new Error(`Unexpected RPC call without a configured double: ${name}`);
  }
  return rpcResponder(name, params);
}

export function getRpcCalls(): readonly RpcCall[] {
  return [...rpcCalls];
}
