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
    "bec032a722ae69baacd57334d2b201d4627fe9d4f20e6c9fe3603db3a83fdc71",
} as const satisfies TrustedSmsCatalog;
