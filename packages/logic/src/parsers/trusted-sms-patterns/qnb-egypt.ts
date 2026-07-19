import type { TrustedSmsCatalog } from "../trusted-sms-pattern-types";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_01 } from "./qnb-egypt-patterns-01";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_02 } from "./qnb-egypt-patterns-02";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_03 } from "./qnb-egypt-patterns-03";
import { QNB_EGYPT_TRUSTED_SMS_PATTERNS_04 } from "./qnb-egypt-patterns-04";

export const QNB_EGYPT_TRUSTED_SMS_CATALOG = {
  schemaVersion: 1,
  catalogVersion: 2,
  patterns: [
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_01,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_02,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_03,
    ...QNB_EGYPT_TRUSTED_SMS_PATTERNS_04,
  ],
  integrityDigest:
    "308618a9b1154e317877892e1cd759bde2554891e295541395a2aecc2ac15c2e",
} as const satisfies TrustedSmsCatalog;
