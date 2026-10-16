/**
 * #395-only device-local column declaration. The schema transform consumes
 * this module; the field is deliberately absent from Supabase Row/Insert/Update
 * and all generated base models. Legacy financial roots retain NULL.
 */
export const ACCOUNT_REVIEW_LOCAL_RECOVERY_ROOT_TABLE =
  "financial_action_groups" as const;

export const ACCOUNT_REVIEW_LOCAL_RECOVERY_COLUMNS = [
  { name: "local_recovery_snapshot_json", type: "string", isOptional: true },
] as const;
