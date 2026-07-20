const ZERO_WIDTH_CHARS_RE = /\u200B|\u200C|\u200D|\uFEFF|\u00AD|\u2060|\u180E/g;

interface SmsFingerprintAtEdgeInput {
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
}

function normalizeSmsBodyAtEdge(body: string): string {
  return body
    .replace(ZERO_WIDTH_CHARS_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function computeSmsFingerprintAtEdge(
  input: SmsFingerprintAtEdgeInput
): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      sender: input.sender.trim().toLowerCase(),
      body: normalizeSmsBodyAtEdge(input.body),
      receivedAtMs: input.receivedAtMs,
    })
  );
}

export async function computeRequestDigestAtEdge(
  value: unknown
): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}
