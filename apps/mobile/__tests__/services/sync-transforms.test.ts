jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {},
  },
}));

import {
  transformFromSupabase,
  transformToSupabase,
} from "../../services/sync/transforms";

describe("sync transforms", () => {
  it("serializes profile JSON fields for WatermelonDB and converts date fields to timestamps", () => {
    const transformed = transformFromSupabase("profiles", {
      id: "profile-1",
      onboarding_flags: { cash_account_tooltip_dismissed: true },
      notification_settings: { sms_transaction_confirmation: true },
      created_at: "2026-05-18T08:00:00.000Z",
      updated_at: "2026-05-18T09:00:00.000Z",
    });

    expect(transformed).toEqual(
      expect.objectContaining({
        onboarding_flags: '{"cash_account_tooltip_dismissed":true}',
        notification_settings: '{"sms_transaction_confirmation":true}',
        created_at: Date.UTC(2026, 4, 18, 8),
        updated_at: Date.UTC(2026, 4, 18, 9),
      })
    );
  });

  it("parses profile JSON fields for Supabase and removes local-only sync fields", () => {
    const transformed = transformToSupabase(
      "profiles",
      {
        id: "profile-1",
        user_id: "previous-user",
        onboarding_flags: '{"cash_account_tooltip_dismissed":true}',
        notification_settings: null,
        created_at: Date.UTC(2026, 4, 18, 8),
        updated_at: Date.UTC(2026, 4, 18, 9),
        _status: "updated",
        _changed: "onboarding_flags",
        sms_body_hash: "legacy-hash",
      },
      "current-user"
    );

    expect(transformed).toEqual(
      expect.objectContaining({
        id: "profile-1",
        user_id: "current-user",
        onboarding_flags: { cash_account_tooltip_dismissed: true },
        notification_settings: null,
        created_at: "2026-05-18T08:00:00.000Z",
        updated_at: "2026-05-18T09:00:00.000Z",
      })
    );
    expect(transformed).not.toHaveProperty("_status");
    expect(transformed).not.toHaveProperty("_changed");
    expect(transformed).not.toHaveProperty("sms_body_hash");
  });

  it("omits unchanged AI processing consent from profile update payloads", () => {
    const transformed = transformToSupabase(
      "profiles",
      {
        id: "profile-1",
        ai_processing_consent:
          '{"version":"2026-07-ai-processing-v1","consentedAt":"2026-07-04T10:00:00.000Z"}',
        onboarding_flags: '{"cash_account_tooltip_dismissed":true}',
        notification_settings: null,
        _status: "updated",
        _changed: "onboarding_flags",
      },
      "current-user"
    );

    expect(transformed).not.toHaveProperty("ai_processing_consent");
  });

  it("keeps AI processing consent when the consent column changed", () => {
    const transformed = transformToSupabase(
      "profiles",
      {
        id: "profile-1",
        ai_processing_consent:
          '{"version":"2026-07-ai-processing-v1","consentedAt":"2026-07-04T10:00:00.000Z"}',
        onboarding_flags: "{}",
        notification_settings: null,
        _status: "updated",
        _changed: "ai_processing_consent",
      },
      "current-user"
    );

    expect(transformed).toEqual(
      expect.objectContaining({
        ai_processing_consent: {
          version: "2026-07-ai-processing-v1",
          consentedAt: "2026-07-04T10:00:00.000Z",
        },
      })
    );
  });

  it("leaves child-table records without forced user_id during Supabase transforms", () => {
    const transformed = transformToSupabase(
      "asset_metals",
      {
        id: "metal-1",
        asset_id: "asset-1",
        created_at: Date.UTC(2026, 0, 15, 10),
        updated_at: Date.UTC(2026, 0, 15, 11),
      },
      "current-user",
      true
    );

    expect(transformed).toEqual(
      expect.objectContaining({
        id: "metal-1",
        asset_id: "asset-1",
        created_at: "2026-01-15T10:00:00.000Z",
        updated_at: "2026-01-15T11:00:00.000Z",
      })
    );
    expect(transformed).not.toHaveProperty("user_id");
  });

  it("removes legacy bank details columns that no longer exist remotely", () => {
    const transformed = transformToSupabase(
      "bank_details",
      {
        id: "bank-detail-1",
        account_id: "account-1",
        card_last_4: 1234,
        bank_name: "Legacy Bank",
        sms_sender_name: "LEGACY",
        created_at: Date.UTC(2026, 0, 15, 10),
        updated_at: Date.UTC(2026, 0, 15, 11),
      },
      "current-user",
      true
    );

    expect(transformed).toEqual(
      expect.objectContaining({
        id: "bank-detail-1",
        account_id: "account-1",
        card_last_4: 1234,
      })
    );
    expect(transformed).not.toHaveProperty("bank_name");
    expect(transformed).not.toHaveProperty("sms_sender_name");
  });
});
