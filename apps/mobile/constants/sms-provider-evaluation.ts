import { CONCURRENT_BATCHES } from "@/constants/sms-ai";

/** Mobile-only synthetic SMS evaluation request size. */
export const MOBILE_SMS_PROVIDER_EVALUATION_BATCH_SIZE = 15;

/** Maximum concurrent synthetic SMS evaluation HTTP requests (aliases the shared production cap). */
export const MOBILE_SMS_PROVIDER_EVALUATION_MAX_CONCURRENT_BATCHES =
  CONCURRENT_BATCHES;
