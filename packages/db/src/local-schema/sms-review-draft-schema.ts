import { tableSchema } from "@nozbe/watermelondb";

export const SMS_REVIEW_DRAFT_TABLES = [
  tableSchema({
    name: "sms_review_queues",
    columns: [
      { name: "user_id", type: "string", isIndexed: true },
      { name: "created_at", type: "number" },
      { name: "updated_at", type: "number" },
    ],
  }),
  tableSchema({
    name: "sms_review_draft_items",
    columns: [
      { name: "queue_id", type: "string", isIndexed: true },
      { name: "user_id", type: "string", isIndexed: true },
      { name: "sms_fingerprint", type: "string", isIndexed: true },
      { name: "payload_version", type: "number" },
      { name: "payload_json", type: "string" },
      { name: "selection_override", type: "boolean", isOptional: true },
      { name: "position", type: "number" },
      { name: "parsed_at", type: "number", isIndexed: true },
      { name: "created_at", type: "number" },
      { name: "updated_at", type: "number" },
    ],
  }),
  tableSchema({
    name: "dismissed_sms_fingerprints",
    columns: [
      { name: "user_id", type: "string", isIndexed: true },
      { name: "sms_fingerprint", type: "string", isIndexed: true },
      { name: "created_at", type: "number" },
      { name: "updated_at", type: "number" },
    ],
  }),
] as const;
