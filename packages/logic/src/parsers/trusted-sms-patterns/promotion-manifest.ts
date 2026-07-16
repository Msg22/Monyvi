import type { TrustedSmsPromotionRecord } from "../trusted-sms-pattern-types";

const CATALOG_VERSION = 1;
const REVIEWER_ID = "mohamed";
const APPROVED_AT = "2026-07-16T00:00:00.000Z";
const PASSED_VALIDATION = {
  schema: "passed",
  privacy: "passed",
  exactPositive: "passed",
  nearMatch: "passed",
  intentionalNegative: "passed",
  ambiguity: "passed",
  integrity: "passed",
} as const;

interface PromotionIdentity {
  readonly candidateId: string;
  readonly evidenceDigest: string;
  readonly patternId: string;
}

function promote(identity: PromotionIdentity): TrustedSmsPromotionRecord {
  return {
    schemaVersion: 1,
    promotionId: `promotion-${identity.patternId}`,
    candidateId: identity.candidateId,
    evidenceDigest: identity.evidenceDigest,
    patternId: identity.patternId,
    patternVersion: 1,
    catalogVersion: CATALOG_VERSION,
    reviewerId: REVIEWER_ID,
    approvedAt: APPROVED_AT,
    decision: "promote",
    validation: PASSED_VALIDATION,
  };
}

export const TRUSTED_SMS_PROMOTION_RECORDS = [
  promote({
    candidateId: "qa-candidate-060abe17-ca2c-4aae-a182-d2300566b76b",
    evidenceDigest:
      "7ad513f740117a8837c7ac63b5a63eae070b4c69131050d184e90f29941aea4d",
    patternId: "qnb-egypt-refund-card-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-146599e9-eb01-49fb-a6ed-91f91954bf9a",
    evidenceDigest:
      "f9f1382de3f2254d0b6e106beff8723fe5ba129f79c2454ca60bc424c0635d5f",
    patternId: "qnb-egypt-refund-ipn-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-3f9a8589-0545-4f29-aaf3-36c86dce39c1",
    evidenceDigest:
      "96b8bb6622c3f06277439eeea5799d098934b1392342f47285196cd7dc635f42",
    patternId: "qnb-egypt-refund-card-usd-v1",
  }),
  promote({
    candidateId: "qa-candidate-066dcd38-edf0-4ba9-ba99-adad420f3066",
    evidenceDigest:
      "ba1525640e3d1e97ed15883d150c9956519eb417e3456d792c296f7e01f9ffb6",
    patternId: "qnb-alahli-promotional-certificate-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-1ee8ac52-d4fc-4999-b3b2-b50955ed1167",
    evidenceDigest:
      "1e3390069af72aac80ba52503d509e753f26949469983b28384e2cddfeab120a",
    patternId: "qnb-egypt-informational-card-pickup-30d-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-4820cfcf-4987-4739-948d-ca51fd636af4",
    evidenceDigest:
      "9e8150f19ee462e0120173b9b5850809d6e3654ce84573fde71d8e3596f8b850",
    patternId: "qnb-alahli-promotional-bebasata-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-4cbe015c-95cf-4329-8c12-6a937a4dafda",
    evidenceDigest:
      "8df967c4a5fc8ae0130ef9d73622d3a6f36a86d875ccae273d351d807cf58623",
    patternId: "qnb-alahli-otp-bebasata-v1",
  }),
  promote({
    candidateId: "qa-candidate-8a046f19-54ec-4526-a29b-b578420e1eaf",
    evidenceDigest:
      "3e0179ac3ee6b7aad698bc25ac556f1b5cffa6c6f49d837a32e31bdc77bb03f8",
    patternId: "qnb-alahli-informational-card-fee-refund-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-8db97c52-d4b4-4aac-a731-f5026e31023c",
    evidenceDigest:
      "acb3ef0899efa5ca2a0bca1090b9544e0e18d07f6f6c1da9e6e224be677b4d98",
    patternId: "qnb-alahli-informational-foreign-currency-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-9fde9e32-30ef-493a-af41-95ecd516d39f",
    evidenceDigest:
      "21405ec2605c25916a78ca59454f6a71a9de316c2140d3f3dff3442ba648ecdc",
    patternId: "qnb-egypt-informational-fees-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-f0757622-b9dd-467f-80b4-cd6dddb1370e",
    evidenceDigest:
      "f9eefc89c8d13b597c0b7fb4f0408f59298d263d4c509dddbeee3e16206595f4",
    patternId: "qnb-egypt-promotional-olympics-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-0364a81c-58aa-46a8-ac41-3a2a3b531844",
    evidenceDigest:
      "9620b3f0a461683d4d1ffa8c73a03d6398181ba65d8bc8a1035d9598c25e61d8",
    patternId: "qnb-egypt-card-purchase-usd-v1",
  }),
  promote({
    candidateId: "qa-candidate-24ef875d-926d-4a4a-8235-718447f34286",
    evidenceDigest:
      "b352cc5e0ea99171c1164955a862c7d28720cd9df6ad87282a0f753f1168bb22",
    patternId: "qnb-egypt-otp-card-purchase-v1",
  }),
  promote({
    candidateId: "qa-candidate-39622c2a-46f6-4825-8218-1e47427b20fc",
    evidenceDigest:
      "39f9f6362c0e1e4500e6a90ffc354cbcd770a26a9930c81b1428aa19558ad781",
    patternId: "qnb-egypt-atm-card-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-424c7a74-bf72-4f7b-a229-afa4ff6d40c6",
    evidenceDigest:
      "9acea832b33e37093a016d06d7150b6506f575e1e1cc3935d7d1e95bca820b56",
    patternId: "qnb-egypt-atm-account-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-47a803d3-d53a-493a-9f2f-df3be4d52b6b",
    evidenceDigest:
      "0f83ad6d6e39cfa61a2915b710845491e2fbe3707f504366e9f49a791aa30e3c",
    patternId: "qnb-egypt-incoming-ipn-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-8761d4df-2d73-4760-b8dc-03ad11b85c0e",
    evidenceDigest:
      "465e2652dd69bccc04203433705ed54e0f27d9c400e358f1074e1c7a5c828d6a",
    patternId: "qnb-egypt-outgoing-ipn-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-a975715d-6d1d-4d4a-bdf7-cd409afe3ed4",
    evidenceDigest:
      "e4266bdf45d8bd4edc90c5c60a63c08177a713baa1d9b105cf88b4f361bd9050",
    patternId: "qnb-egypt-informational-card-pickup-45d-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-ad840bba-cb45-4d03-8bd3-263bc600389d",
    evidenceDigest:
      "7d24925f28878b2d61cec89d9c0cee537705918c631c6a755001b5af0165b93d",
    patternId: "qnb-egypt-informational-card-pickup-60d-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-c925d4ba-4409-48fb-b619-647860e0eb24",
    evidenceDigest:
      "51eeb3cebc359f1b3a0819e34164102f60c4da5bc39423d347bd3704db649157",
    patternId: "qnb-egypt-card-purchase-egp-v1",
  }),
  promote({
    candidateId: "qa-candidate-e6628fd6-26db-42d4-a71c-a53676a3bc85",
    evidenceDigest:
      "9cb96b6c7eaafee903476bbc5a45bc6cedb23e1da417dec92520fdad6151a162",
    patternId: "qnb-egypt-informational-phishing-warning-ar-v1",
  }),
  promote({
    candidateId: "qa-candidate-fda5e682-a1a3-4739-b4e4-2b57b98ccbd9",
    evidenceDigest:
      "9b98972dc9b7651abc983bef5244ff4325a9f1fbe511c4c1ae7b7d215861c9bd",
    patternId: "qnb-egypt-informational-scam-warning-ar-v1",
  }),
] as const satisfies readonly TrustedSmsPromotionRecord[];

export const TRUSTED_SMS_CATALOG_VERSION = CATALOG_VERSION;

export const TRUSTED_SMS_DISABLED_PATTERN_IDS: readonly string[] = [];
