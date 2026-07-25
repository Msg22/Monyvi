export type SmsAiOperationalCapability =
  | "sms_full_parse"
  | "sms_category_enrichment";

interface OperationalResponseBody {
  readonly reason?: unknown;
  readonly completionStatus?: unknown;
}

function getDecisionCode(
  body: OperationalResponseBody,
  status: number
): string {
  if (typeof body.reason === "string" && body.reason.length <= 80) {
    return body.reason;
  }
  if (
    typeof body.completionStatus === "string" &&
    body.completionStatus.length <= 80
  ) {
    return body.completionStatus;
  }
  return `http_${status}`;
}

export async function logSmsAiOperationalResponse(
  capability: SmsAiOperationalCapability,
  response: Response,
  log: (...values: readonly unknown[]) => void
): Promise<void> {
  let body: OperationalResponseBody = {};
  try {
    body = (await response.clone().json()) as OperationalResponseBody;
  } catch {
    // Status remains a complete privacy-safe fallback when the body is absent.
  }

  log("smsAi.operational", {
    capability,
    status: response.status,
    decisionCode: getDecisionCode(body, response.status),
  });
}
