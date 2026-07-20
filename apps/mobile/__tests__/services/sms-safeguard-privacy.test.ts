import { readFileSync } from "fs";
import path from "path";

const FORBIDDEN_PERSISTED_FIELDS = [
  "rawSmsBody",
  "smsBody",
  "senderName",
  "merchant",
  "categoryId",
  "accountId",
  "cardLast4",
  "providerResponse",
] as const;

describe("SMS safeguard local privacy boundary", () => {
  it("keeps checkpoint and oversized stores free of message payload fields", () => {
    const source = [
      "sms-scan-checkpoint-service.ts",
      "sms-oversized-outcome-service.ts",
    ]
      .map((file) =>
        readFileSync(path.resolve(__dirname, `../../services/${file}`), "utf8")
      )
      .join("\n");

    for (const field of FORBIDDEN_PERSISTED_FIELDS) {
      expect(source).not.toContain(field);
    }
  });
});
