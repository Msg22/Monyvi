import type { TrustedSmsCatalog } from "../trusted-sms-pattern-types";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_01 } from "./qnb-egypt-patterns-01";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_02 } from "./qnb-egypt-patterns-02";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_03 } from "./qnb-egypt-patterns-03";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_04 } from "./qnb-egypt-patterns-04";

export const QNB_EGYPT_TRUSTED_SMS_CATALOG = {
  schemaVersion: 1,
  catalogVersion: 1,
  patterns: [
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_01,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_02,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_03,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_04,
  ],
  integrityDigest:
    "ecec633daf1f1ee214a3744687d17e0ca029f5cfd9b48ce4a6661812f7db4e61",
} as const satisfies TrustedSmsCatalog;
