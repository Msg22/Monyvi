import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOCAL_SMS_PATTERNS } from "../local-sms-pattern-catalog";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";

const parsersDirectory = resolve(__dirname, "..");

describe("QA SMS candidate runtime isolation", () => {
  it("keeps candidate modules out of runtime parser barrels and entry points", () => {
    const runtimeFiles = [
      "index.ts",
      "local-sms-parser.ts",
      "local-sms-pattern-catalog.ts",
    ];

    for (const file of runtimeFiles) {
      const source = readFileSync(resolve(parsersDirectory, file), "utf8");
      expect(source).not.toMatch(/qa-sms-pattern-candidates/);
      expect(source).not.toMatch(/qa-sms-template-evaluator/);
      expect(source).not.toMatch(/qa-sms-validation-case-runner/);
    }
  });

  it("keeps candidate identifiers and policies out of the active catalog", () => {
    for (const pattern of LOCAL_SMS_PATTERNS) {
      expect(pattern.id).not.toMatch(/^qa-|candidate/i);
      expect(pattern.runtimeScope).not.toBe("candidate");
    }
  });

  it("keeps evidence identities and candidate scope out of trusted runtime entries", () => {
    expect(QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.length).toBeGreaterThan(0);
    for (const pattern of QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns) {
      expect(JSON.stringify(pattern)).not.toMatch(
        /candidateId|evidenceDigest|rawSmsBody|receivedAtMs|smsFingerprint/
      );
      expect(pattern.runtimeScope).toBe("trusted_production");
      expect(pattern.autoSelectPolicy).toBe("never");
    }
  });

  it("keeps the QA evaluator result-only and transaction-free", () => {
    const evaluator = readFileSync(
      resolve(
        parsersDirectory,
        "qa-sms-pattern-intake/testing/qa-sms-template-evaluator.ts"
      ),
      "utf8"
    );
    expect(evaluator).not.toMatch(/ParsedSmsTransaction/);
    expect(evaluator).not.toMatch(/LOCAL_SMS_PATTERNS/);
  });
});
