import { reconcileProviderCompletion } from "../sms-provider-response-reconciler";

describe("SMS provider completion reconciliation", () => {
  it("classifies omitted identities only for a complete identity-valid response", () => {
    expect(
      reconcileProviderCompletion({
        submittedMessageIds: ["a", "b", "c"],
        envelope: {
          requestId: "request-1",
          completionStatus: "complete",
          transactions: [
            { messageId: "a", isTrusted: true },
            { messageId: "b", isTrusted: false },
          ],
        },
      })
    ).toEqual({
      isValid: true,
      positiveMessageIds: ["a"],
      negativeMessageIds: ["b", "c"],
    });
  });

  it.each(["truncated", "safety_stopped", "failed"] as const)(
    "creates no outcomes for %s completion",
    (completionStatus) => {
      expect(
        reconcileProviderCompletion({
          submittedMessageIds: ["a"],
          envelope: {
            requestId: "request-1",
            completionStatus,
            transactions: [],
          },
        })
      ).toEqual({
        isValid: false,
        reason: "incomplete_response",
        positiveMessageIds: [],
        negativeMessageIds: [],
      });
    }
  );

  it.each([
    [
      [
        { messageId: "a", isTrusted: true },
        { messageId: "a", isTrusted: false },
      ],
    ],
    [[{ messageId: "unknown", isTrusted: true }]],
  ])("rejects duplicate or unknown identities", (transactions) => {
    const result = reconcileProviderCompletion({
      submittedMessageIds: ["a"],
      envelope: {
        requestId: "request-1",
        completionStatus: "complete",
        transactions,
      },
    });

    expect(result).toMatchObject({
      isValid: false,
      positiveMessageIds: [],
      negativeMessageIds: [],
    });
  });
});
