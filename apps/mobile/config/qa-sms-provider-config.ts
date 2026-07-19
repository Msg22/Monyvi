interface QaSmsVerifiedProviderConfig {
  readonly id: "qnb-egypt";
  readonly displayName: string;
  readonly senderAliases: readonly string[];
}

const QA_SMS_PATTERN_INTAKE_PROVIDER: QaSmsVerifiedProviderConfig = {
  id: "qnb-egypt",
  displayName: "QNB EGYPT",
  senderAliases: ["QNB", "QNB EGYPT", "QNB ALAHLI"],
};

export { QA_SMS_PATTERN_INTAKE_PROVIDER };
export type { QaSmsVerifiedProviderConfig };
