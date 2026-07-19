import { normalizeSmsBody } from "../sms-hash";

interface QaSmsEvidenceIdentityInput {
  readonly sender: string;
  readonly body: string;
}

export function buildQaSmsEvidenceIdentity(
  input: QaSmsEvidenceIdentityInput
): string {
  return JSON.stringify({
    sender: input.sender.trim().toLowerCase(),
    body: normalizeSmsBody(input.body),
  });
}

export type { QaSmsEvidenceIdentityInput };
