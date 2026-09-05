export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      account_sms_senders: {
        Row: {
          account_id: string;
          created_at: string;
          deleted: boolean;
          id: string;
          normalized_sender_name: string;
          sender_name: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          normalized_sender_name: string;
          sender_name: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          normalized_sender_name?: string;
          sender_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_sms_senders_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          balance: number;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"];
          deleted: boolean;
          id: string;
          institution_id: string | null;
          is_default: boolean;
          name: string;
          provider_display_name: string | null;
          type: Database["public"]["Enums"]["account_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          balance?: number;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          id?: string;
          institution_id?: string | null;
          is_default?: boolean;
          name: string;
          provider_display_name?: string | null;
          type: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          id?: string;
          institution_id?: string | null;
          is_default?: boolean;
          name?: string;
          provider_display_name?: string | null;
          type?: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      asset_metals: {
        Row: {
          asset_id: string;
          created_at: string;
          deleted: boolean;
          id: string;
          item_form: string | null;
          metal_type: Database["public"]["Enums"]["metal_type"];
          purity_catalog_version: string | null;
          purity_code: string | null;
          purity_factor_decimal: string | null;
          purity_fraction: number;
          updated_at: string;
          weight_grams: number;
          weight_grams_decimal: string | null;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          item_form?: string | null;
          metal_type: Database["public"]["Enums"]["metal_type"];
          purity_catalog_version?: string | null;
          purity_code?: string | null;
          purity_factor_decimal?: string | null;
          purity_fraction?: number;
          updated_at?: string;
          weight_grams: number;
          weight_grams_decimal?: string | null;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          item_form?: string | null;
          metal_type?: Database["public"]["Enums"]["metal_type"];
          purity_catalog_version?: string | null;
          purity_code?: string | null;
          purity_factor_decimal?: string | null;
          purity_fraction?: number;
          updated_at?: string;
          weight_grams?: number;
          weight_grams_decimal?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_metals_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: true;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          acquisition_action_id: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"];
          deleted: boolean;
          id: string;
          is_liquid: boolean;
          name: string;
          notes: string | null;
          purchase_currency: string | null;
          purchase_date: string;
          purchase_price: number;
          purchase_price_decimal: string | null;
          type: Database["public"]["Enums"]["asset_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          acquisition_action_id?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          id?: string;
          is_liquid?: boolean;
          name: string;
          notes?: string | null;
          purchase_currency?: string | null;
          purchase_date: string;
          purchase_price: number;
          purchase_price_decimal?: string | null;
          type: Database["public"]["Enums"]["asset_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          acquisition_action_id?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          id?: string;
          is_liquid?: boolean;
          name?: string;
          notes?: string | null;
          purchase_currency?: string | null;
          purchase_date?: string;
          purchase_price?: number;
          purchase_price_decimal?: string | null;
          type?: Database["public"]["Enums"]["asset_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_acquisition_action_holding_fk";
            columns: ["user_id", "acquisition_action_id", "id"];
            isOneToOne: false;
            referencedRelation: "metal_action_evidence";
            referencedColumns: ["user_id", "action_id", "holding_id"];
          },
        ];
      };
      bank_details: {
        Row: {
          account_id: string;
          account_number: string | null;
          card_last_4: number | null;
          created_at: string;
          deleted: boolean;
          id: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          account_number?: string | null;
          card_last_4?: number | null;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          account_number?: string | null;
          card_last_4?: number | null;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_details_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          alert_fired_level:
            | Database["public"]["Enums"]["alert_fired_level"]
            | null;
          alert_threshold: number;
          amount: number;
          category_id: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"] | null;
          deleted: boolean;
          id: string;
          name: string;
          pause_intervals: Json;
          paused_at: string | null;
          period: Database["public"]["Enums"]["budget_period"];
          period_end: string | null;
          period_start: string | null;
          status: Database["public"]["Enums"]["budget_status"];
          type: Database["public"]["Enums"]["budget_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          alert_fired_level?:
            | Database["public"]["Enums"]["alert_fired_level"]
            | null;
          alert_threshold?: number;
          amount: number;
          category_id?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"] | null;
          deleted?: boolean;
          id?: string;
          name: string;
          pause_intervals?: Json;
          paused_at?: string | null;
          period: Database["public"]["Enums"]["budget_period"];
          period_end?: string | null;
          period_start?: string | null;
          status?: Database["public"]["Enums"]["budget_status"];
          type: Database["public"]["Enums"]["budget_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          alert_fired_level?:
            | Database["public"]["Enums"]["alert_fired_level"]
            | null;
          alert_threshold?: number;
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"] | null;
          deleted?: boolean;
          id?: string;
          name?: string;
          pause_intervals?: Json;
          paused_at?: string | null;
          period?: Database["public"]["Enums"]["budget_period"];
          period_end?: string | null;
          period_start?: string | null;
          status?: Database["public"]["Enums"]["budget_status"];
          type?: Database["public"]["Enums"]["budget_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          deleted: boolean;
          display_name: string;
          icon: string;
          icon_library: string;
          id: string;
          is_hidden: boolean;
          is_internal: boolean;
          is_system: boolean;
          level: number;
          nature: Database["public"]["Enums"]["category_nature"] | null;
          parent_id: string | null;
          sort_order: number | null;
          system_name: string;
          type: Database["public"]["Enums"]["transaction_type"] | null;
          updated_at: string;
          usage_count: number;
          user_id: string | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          deleted?: boolean;
          display_name: string;
          icon: string;
          icon_library?: string;
          id?: string;
          is_hidden?: boolean;
          is_internal?: boolean;
          is_system?: boolean;
          level: number;
          nature?: Database["public"]["Enums"]["category_nature"] | null;
          parent_id?: string | null;
          sort_order?: number | null;
          system_name: string;
          type?: Database["public"]["Enums"]["transaction_type"] | null;
          updated_at?: string;
          usage_count?: number;
          user_id?: string | null;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          deleted?: boolean;
          display_name?: string;
          icon?: string;
          icon_library?: string;
          id?: string;
          is_hidden?: boolean;
          is_internal?: boolean;
          is_system?: boolean;
          level?: number;
          nature?: Database["public"]["Enums"]["category_nature"] | null;
          parent_id?: string | null;
          sort_order?: number | null;
          system_name?: string;
          type?: Database["public"]["Enums"]["transaction_type"] | null;
          updated_at?: string;
          usage_count?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_snapshot_assets: {
        Row: {
          created_at: string;
          id: string;
          snapshot_date: string;
          total_assets_usd: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_assets_usd: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_assets_usd?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_snapshot_balance: {
        Row: {
          created_at: string;
          id: string;
          snapshot_date: string;
          total_accounts_usd: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_accounts_usd: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_accounts_usd?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_snapshot_net_worth: {
        Row: {
          created_at: string;
          id: string;
          snapshot_date: string;
          total_accounts: number;
          total_assets: number;
          total_net_worth: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_accounts?: number;
          total_assets?: number;
          total_net_worth?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          snapshot_date?: string;
          total_accounts?: number;
          total_assets?: number;
          total_net_worth?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      debts: {
        Row: {
          account_id: string;
          created_at: string;
          date: string;
          deleted: boolean;
          due_date: string | null;
          id: string;
          notes: string | null;
          original_amount: number;
          outstanding_amount: number;
          party_name: string;
          status: Database["public"]["Enums"]["debt_status"];
          type: Database["public"]["Enums"]["debt_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          date: string;
          deleted?: boolean;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          original_amount: number;
          outstanding_amount: number;
          party_name: string;
          status?: Database["public"]["Enums"]["debt_status"];
          type: Database["public"]["Enums"]["debt_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          date?: string;
          deleted?: boolean;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          original_amount?: number;
          outstanding_amount?: number;
          party_name?: string;
          status?: Database["public"]["Enums"]["debt_status"];
          type?: Database["public"]["Enums"]["debt_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "debts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_action_groups: {
        Row: {
          account_guards_json: Json;
          action_id: string;
          created_at: string;
          deleted: boolean;
          domain: string;
          domain_reference_id: string;
          id: string;
          kind: string;
          outcome_json: string | null;
          payload_hash: string;
          payload_json: string;
          rejection_code: string | null;
          server_outcome: string | null;
          state: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_guards_json?: Json;
          action_id: string;
          created_at?: string;
          deleted?: boolean;
          domain: string;
          domain_reference_id: string;
          id?: string;
          kind: string;
          outcome_json?: string | null;
          payload_hash: string;
          payload_json: string;
          rejection_code?: string | null;
          server_outcome?: string | null;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_guards_json?: Json;
          action_id?: string;
          created_at?: string;
          deleted?: boolean;
          domain?: string;
          domain_reference_id?: string;
          id?: string;
          kind?: string;
          outcome_json?: string | null;
          payload_hash?: string;
          payload_json?: string;
          rejection_code?: string | null;
          server_outcome?: string | null;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      market_rate_observations: {
        Row: {
          batch_id: string;
          created_at: string;
          id: string;
          instrument_code: string;
          orientation: string;
          provider_observed_at: string | null;
          quality: string;
          source: string | null;
          unit: string;
          value_decimal: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          id?: string;
          instrument_code: string;
          orientation: string;
          provider_observed_at?: string | null;
          quality: string;
          source?: string | null;
          unit: string;
          value_decimal: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          id?: string;
          instrument_code?: string;
          orientation?: string;
          provider_observed_at?: string | null;
          quality?: string;
          source?: string | null;
          unit?: string;
          value_decimal?: string;
        };
        Relationships: [];
      };
      market_rates: {
        Row: {
          aed_usd: number;
          aud_usd: number;
          bhd_usd: number;
          btc_usd: number;
          cad_usd: number;
          chf_usd: number;
          cny_usd: number;
          created_at: string;
          dkk_usd: number;
          dzd_usd: number;
          egp_usd: number;
          eur_usd: number;
          gbp_usd: number;
          gold_usd_per_gram: number;
          hkd_usd: number;
          id: string;
          inr_usd: number;
          iqd_usd: number;
          isk_usd: number;
          jod_usd: number;
          jpy_usd: number;
          kpw_usd: number;
          krw_usd: number;
          kwd_usd: number;
          lyd_usd: number;
          mad_usd: number;
          myr_usd: number;
          nok_usd: number;
          nzd_usd: number;
          omr_usd: number;
          palladium_usd_per_gram: number;
          platinum_usd_per_gram: number;
          qar_usd: number;
          rub_usd: number;
          sar_usd: number;
          sek_usd: number;
          sgd_usd: number;
          silver_usd_per_gram: number;
          timestamp_currency: string | null;
          timestamp_metal: string | null;
          tnd_usd: number;
          try_usd: number;
          updated_at: string;
          zar_usd: number;
        };
        Insert: {
          aed_usd: number;
          aud_usd: number;
          bhd_usd: number;
          btc_usd: number;
          cad_usd: number;
          chf_usd: number;
          cny_usd: number;
          created_at?: string;
          dkk_usd: number;
          dzd_usd: number;
          egp_usd: number;
          eur_usd: number;
          gbp_usd: number;
          gold_usd_per_gram: number;
          hkd_usd: number;
          id?: string;
          inr_usd: number;
          iqd_usd: number;
          isk_usd: number;
          jod_usd: number;
          jpy_usd: number;
          kpw_usd: number;
          krw_usd: number;
          kwd_usd: number;
          lyd_usd: number;
          mad_usd: number;
          myr_usd: number;
          nok_usd: number;
          nzd_usd: number;
          omr_usd: number;
          palladium_usd_per_gram: number;
          platinum_usd_per_gram: number;
          qar_usd: number;
          rub_usd: number;
          sar_usd: number;
          sek_usd: number;
          sgd_usd: number;
          silver_usd_per_gram: number;
          timestamp_currency?: string | null;
          timestamp_metal?: string | null;
          tnd_usd: number;
          try_usd: number;
          updated_at?: string;
          zar_usd: number;
        };
        Update: {
          aed_usd?: number;
          aud_usd?: number;
          bhd_usd?: number;
          btc_usd?: number;
          cad_usd?: number;
          chf_usd?: number;
          cny_usd?: number;
          created_at?: string;
          dkk_usd?: number;
          dzd_usd?: number;
          egp_usd?: number;
          eur_usd?: number;
          gbp_usd?: number;
          gold_usd_per_gram?: number;
          hkd_usd?: number;
          id?: string;
          inr_usd?: number;
          iqd_usd?: number;
          isk_usd?: number;
          jod_usd?: number;
          jpy_usd?: number;
          kpw_usd?: number;
          krw_usd?: number;
          kwd_usd?: number;
          lyd_usd?: number;
          mad_usd?: number;
          myr_usd?: number;
          nok_usd?: number;
          nzd_usd?: number;
          omr_usd?: number;
          palladium_usd_per_gram?: number;
          platinum_usd_per_gram?: number;
          qar_usd?: number;
          rub_usd?: number;
          sar_usd?: number;
          sek_usd?: number;
          sgd_usd?: number;
          silver_usd_per_gram?: number;
          timestamp_currency?: string | null;
          timestamp_metal?: string | null;
          tnd_usd?: number;
          try_usd?: number;
          updated_at?: string;
          zar_usd?: number;
        };
        Relationships: [];
      };
      metal_action_evidence: {
        Row: {
          action_id: string;
          canonical_holding_revision: string | null;
          created_at: string;
          deleted: boolean;
          domain_payload_json: Json;
          expected_holding_revision: string | null;
          holding_id: string;
          id: string;
          kind: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_id: string;
          canonical_holding_revision?: string | null;
          created_at?: string;
          deleted?: boolean;
          domain_payload_json: Json;
          expected_holding_revision?: string | null;
          holding_id: string;
          id?: string;
          kind: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_id?: string;
          canonical_holding_revision?: string | null;
          created_at?: string;
          deleted?: boolean;
          domain_payload_json?: Json;
          expected_holding_revision?: string | null;
          holding_id?: string;
          id?: string;
          kind?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_action_evidence_user_id_action_id_holding_id_fkey";
            columns: ["user_id", "action_id", "holding_id"];
            isOneToOne: true;
            referencedRelation: "financial_action_groups";
            referencedColumns: ["user_id", "action_id", "domain_reference_id"];
          },
          {
            foreignKeyName: "metal_action_evidence_user_id_holding_id_fkey";
            columns: ["user_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      metal_holding_states: {
        Row: {
          created_at: string;
          deleted: boolean;
          effective_action_id: string | null;
          effective_event_id: string | null;
          financial_revision: string;
          holding_id: string;
          id: string;
          is_visible: boolean;
          reconciliation_state: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean;
          effective_action_id?: string | null;
          effective_event_id?: string | null;
          financial_revision?: string;
          holding_id: string;
          id: string;
          is_visible?: boolean;
          reconciliation_state?: string;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted?: boolean;
          effective_action_id?: string | null;
          effective_event_id?: string | null;
          financial_revision?: string;
          holding_id?: string;
          id?: string;
          is_visible?: boolean;
          reconciliation_state?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_holding_states_effective_event_fk";
            columns: ["effective_event_id"];
            isOneToOne: false;
            referencedRelation: "metal_lifecycle_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metal_holding_states_effective_action_fk";
            columns: ["user_id", "effective_action_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "metal_action_evidence";
            referencedColumns: ["user_id", "action_id", "holding_id"];
          },
          {
            foreignKeyName: "metal_holding_states_user_id_holding_id_fkey";
            columns: ["user_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      metal_lifecycle_events: {
        Row: {
          action_id: string;
          created_at: string;
          deleted: boolean;
          holding_id: string;
          id: string;
          is_effective: boolean;
          is_history_visible: boolean;
          kind: string;
          occurred_at: string;
          payload_json: Json;
          predecessor_event_id: string | null;
          reverses_event_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          deleted?: boolean;
          holding_id: string;
          id?: string;
          is_effective?: boolean;
          is_history_visible?: boolean;
          kind: string;
          occurred_at: string;
          payload_json: Json;
          predecessor_event_id?: string | null;
          reverses_event_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          deleted?: boolean;
          holding_id?: string;
          id?: string;
          is_effective?: boolean;
          is_history_visible?: boolean;
          kind?: string;
          occurred_at?: string;
          payload_json?: Json;
          predecessor_event_id?: string | null;
          reverses_event_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_lifecycle_events_predecessor_event_id_fkey";
            columns: ["predecessor_event_id"];
            isOneToOne: false;
            referencedRelation: "metal_lifecycle_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metal_lifecycle_events_reverses_event_id_fkey";
            columns: ["reverses_event_id"];
            isOneToOne: false;
            referencedRelation: "metal_lifecycle_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metal_lifecycle_events_user_id_action_id_holding_id_fkey";
            columns: ["user_id", "action_id", "holding_id"];
            isOneToOne: true;
            referencedRelation: "metal_action_evidence";
            referencedColumns: ["user_id", "action_id", "holding_id"];
          },
          {
            foreignKeyName: "metal_lifecycle_events_user_id_holding_id_fkey";
            columns: ["user_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      metal_rate_references: {
        Row: {
          action_id: string;
          captured_at: string;
          captured_freshness: string;
          created_at: string;
          deleted: boolean;
          holding_id: string;
          id: string;
          instrument_code: string;
          kind: string;
          orientation: string;
          provider_observed_at: string | null;
          quality: string;
          role: string;
          source: string | null;
          unit: string;
          updated_at: string;
          user_id: string;
          value_decimal: string;
        };
        Insert: {
          action_id: string;
          captured_at: string;
          captured_freshness: string;
          created_at?: string;
          deleted?: boolean;
          holding_id: string;
          id?: string;
          instrument_code: string;
          kind: string;
          orientation: string;
          provider_observed_at?: string | null;
          quality: string;
          role: string;
          source?: string | null;
          unit: string;
          updated_at?: string;
          user_id: string;
          value_decimal: string;
        };
        Update: {
          action_id?: string;
          captured_at?: string;
          captured_freshness?: string;
          created_at?: string;
          deleted?: boolean;
          holding_id?: string;
          id?: string;
          instrument_code?: string;
          kind?: string;
          orientation?: string;
          provider_observed_at?: string | null;
          quality?: string;
          role?: string;
          source?: string | null;
          unit?: string;
          updated_at?: string;
          user_id?: string;
          value_decimal?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_rate_references_user_id_action_id_holding_id_fkey";
            columns: ["user_id", "action_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "metal_action_evidence";
            referencedColumns: ["user_id", "action_id", "holding_id"];
          },
          {
            foreignKeyName: "metal_rate_references_user_id_holding_id_fkey";
            columns: ["user_id", "holding_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      profiles: {
        Row: {
          ai_processing_consent: Json | null;
          avatar_url: string | null;
          created_at: string;
          deleted: boolean;
          display_name: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          notification_settings: Json | null;
          onboarding_completed: boolean;
          onboarding_flags: Json;
          preferred_currency: Database["public"]["Enums"]["currency_type"];
          preferred_language: Database["public"]["Enums"]["preferred_language_code"];
          setup_guide_completed: boolean;
          sms_detection_enabled: boolean;
          theme: Database["public"]["Enums"]["theme_preference"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_processing_consent?: Json | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted?: boolean;
          display_name?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          notification_settings?: Json | null;
          onboarding_completed?: boolean;
          onboarding_flags?: Json;
          preferred_currency?: Database["public"]["Enums"]["currency_type"];
          preferred_language?: Database["public"]["Enums"]["preferred_language_code"];
          setup_guide_completed?: boolean;
          sms_detection_enabled?: boolean;
          theme?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_processing_consent?: Json | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted?: boolean;
          display_name?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          notification_settings?: Json | null;
          onboarding_completed?: boolean;
          onboarding_flags?: Json;
          preferred_currency?: Database["public"]["Enums"]["currency_type"];
          preferred_language?: Database["public"]["Enums"]["preferred_language_code"];
          setup_guide_completed?: boolean;
          sms_detection_enabled?: boolean;
          theme?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      recurring_payments: {
        Row: {
          account_id: string;
          action: Database["public"]["Enums"]["recurring_action"];
          amount: number;
          category_id: string;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"];
          deleted: boolean;
          end_date: string | null;
          frequency: Database["public"]["Enums"]["recurring_frequency"];
          frequency_value: number | null;
          id: string;
          linked_debt_id: string | null;
          name: string;
          next_due_date: string;
          notes: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["recurring_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          action?: Database["public"]["Enums"]["recurring_action"];
          amount: number;
          category_id: string;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          end_date?: string | null;
          frequency: Database["public"]["Enums"]["recurring_frequency"];
          frequency_value?: number | null;
          id?: string;
          linked_debt_id?: string | null;
          name: string;
          next_due_date: string;
          notes?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["recurring_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          action?: Database["public"]["Enums"]["recurring_action"];
          amount?: number;
          category_id?: string;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          deleted?: boolean;
          end_date?: string | null;
          frequency?: Database["public"]["Enums"]["recurring_frequency"];
          frequency_value?: number | null;
          id?: string;
          linked_debt_id?: string | null;
          name?: string;
          next_due_date?: string;
          notes?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["recurring_status"];
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_payments_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_payments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_payments_linked_debt_id_fkey";
            columns: ["linked_debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_ai_negative_outcomes: {
        Row: {
          created_at: string;
          deleted: boolean;
          id: string;
          is_terminal: boolean;
          last_classified_at: string;
          original_received_at: string;
          sms_fingerprint: string;
          strike_count: number;
          terminal_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted?: boolean;
          id?: string;
          is_terminal?: boolean;
          last_classified_at?: string;
          original_received_at: string;
          sms_fingerprint: string;
          strike_count?: number;
          terminal_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted?: boolean;
          id?: string;
          is_terminal?: boolean;
          last_classified_at?: string;
          original_received_at?: string;
          sms_fingerprint?: string;
          strike_count?: number;
          terminal_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sms_ai_scan_sessions: {
        Row: {
          accepted_scan_started_at: string;
          client_scan_started_at: string;
          created_at: string;
          scan_kind: string;
          scan_session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted_scan_started_at: string;
          client_scan_started_at: string;
          created_at?: string;
          scan_kind: string;
          scan_session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_scan_started_at?: string;
          client_scan_started_at?: string;
          created_at?: string;
          scan_kind?: string;
          scan_session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sms_ai_usage_events: {
        Row: {
          capability: string;
          id: string;
          request_id: string;
          started_at: string;
          unit_count: number;
          user_id: string;
        };
        Insert: {
          capability: string;
          id?: string;
          request_id: string;
          started_at?: string;
          unit_count: number;
          user_id: string;
        };
        Update: {
          capability?: string;
          id?: string;
          request_id?: string;
          started_at?: string;
          unit_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sms_ai_usage_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "sms_ai_work_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_ai_work_requests: {
        Row: {
          available_at: string | null;
          capability: string;
          created_at: string;
          decision_code: string;
          estimated_input_tokens: number;
          history_cooldown_seconds: number;
          id: string;
          payload_bytes: number;
          provider_started_at: string | null;
          request_digest: string | null;
          request_key: string;
          reservation_expires_at: string | null;
          scan_kind: string | null;
          scan_session_id: string | null;
          status: string;
          unit_count: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          available_at?: string | null;
          capability: string;
          created_at?: string;
          decision_code: string;
          estimated_input_tokens: number;
          history_cooldown_seconds?: number;
          id?: string;
          payload_bytes: number;
          provider_started_at?: string | null;
          request_digest?: string | null;
          request_key: string;
          reservation_expires_at?: string | null;
          scan_kind?: string | null;
          scan_session_id?: string | null;
          status: string;
          unit_count: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          available_at?: string | null;
          capability?: string;
          created_at?: string;
          decision_code?: string;
          estimated_input_tokens?: number;
          history_cooldown_seconds?: number;
          id?: string;
          payload_bytes?: number;
          provider_started_at?: string | null;
          request_digest?: string | null;
          request_key?: string;
          reservation_expires_at?: string | null;
          scan_kind?: string | null;
          scan_session_id?: string | null;
          status?: string;
          unit_count?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          account_id: string;
          amount: number;
          category_id: string;
          counterparty: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"];
          date: string;
          deleted: boolean;
          id: string;
          is_draft: boolean;
          linked_asset_id: string | null;
          linked_debt_id: string | null;
          linked_recurring_id: string | null;
          note: string | null;
          sms_fingerprint: string | null;
          source: Database["public"]["Enums"]["transaction_source"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          amount: number;
          category_id: string;
          counterparty?: string | null;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_type"];
          date: string;
          deleted?: boolean;
          id?: string;
          is_draft?: boolean;
          linked_asset_id?: string | null;
          linked_debt_id?: string | null;
          linked_recurring_id?: string | null;
          note?: string | null;
          sms_fingerprint?: string | null;
          source?: Database["public"]["Enums"]["transaction_source"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          category_id?: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          date?: string;
          deleted?: boolean;
          id?: string;
          is_draft?: boolean;
          linked_asset_id?: string | null;
          linked_debt_id?: string | null;
          linked_recurring_id?: string | null;
          note?: string | null;
          sms_fingerprint?: string | null;
          source?: Database["public"]["Enums"]["transaction_source"];
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_linked_asset_id_fkey";
            columns: ["linked_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_linked_debt_id_fkey";
            columns: ["linked_debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_linked_recurring_id_fkey";
            columns: ["linked_recurring_id"];
            isOneToOne: false;
            referencedRelation: "recurring_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      transfers: {
        Row: {
          amount: number;
          converted_amount: number | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_type"];
          date: string;
          deleted: boolean;
          exchange_rate: number | null;
          from_account_id: string;
          id: string;
          notes: string | null;
          sms_fingerprint: string | null;
          to_account_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          converted_amount?: number | null;
          created_at?: string;
          currency: Database["public"]["Enums"]["currency_type"];
          date: string;
          deleted?: boolean;
          exchange_rate?: number | null;
          from_account_id: string;
          id?: string;
          notes?: string | null;
          sms_fingerprint?: string | null;
          to_account_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          converted_amount?: number | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_type"];
          date?: string;
          deleted?: boolean;
          exchange_rate?: number | null;
          from_account_id?: string;
          id?: string;
          notes?: string | null;
          sms_fingerprint?: string | null;
          to_account_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey";
            columns: ["from_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey";
            columns: ["to_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      user_category_settings: {
        Row: {
          category_id: string;
          created_at: string;
          deleted: boolean;
          id: string;
          is_hidden: boolean;
          nature: Database["public"]["Enums"]["category_nature"] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          is_hidden?: boolean;
          nature?: Database["public"]["Enums"]["category_nature"] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          deleted?: boolean;
          id?: string;
          is_hidden?: boolean;
          nature?: Database["public"]["Enums"]["category_nature"] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_category_settings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      pull_metal_observations_page_v1: {
        Args: {
          p_after_created_at?: string | null;
          p_after_id?: string | null;
          p_limit?: number;
          p_upper_watermark?: string | null;
        };
        Returns: Json;
      };
      recalculate_account_balance: {
        Args: { account_id_param: string };
        Returns: number;
      };
      recalculate_all_account_balances: { Args: never; Returns: number };
      recalculate_daily_snapshot_assets: { Args: never; Returns: undefined };
      recalculate_daily_snapshot_balance: { Args: never; Returns: undefined };
      recalculate_daily_snapshot_net_worth: { Args: never; Returns: undefined };
      run_daily_snapshots: { Args: never; Returns: undefined };
      sms_ai_cleanup_safeguards: {
        Args: { p_ledger_retention_days?: number; p_lookback_days?: number };
        Returns: undefined;
      };
      sms_ai_complete_work: {
        Args: {
          p_completed_with_provider_error: boolean;
          p_decision_code: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      sms_ai_get_availability: {
        Args: {
          p_burst_window_seconds: number;
          p_history_cooldown_seconds: number;
          p_max_provider_starts_per_burst: number;
          p_max_units_per_rolling_window: number;
          p_rolling_window_seconds: number;
          p_user_id: string;
        };
        Returns: {
          available_at: string;
          burst_available_at: string;
          history_cooldown_available_at: string;
          reason: string;
          rolling_available_at: string;
          server_now: string;
        }[];
      };
      sms_ai_mark_provider_started: {
        Args: { p_request_id: string };
        Returns: {
          decision_code: string;
          started: boolean;
        }[];
      };
      sms_ai_mark_provider_started_v3: {
        Args: { p_candidate_fingerprints: string[]; p_request_id: string };
        Returns: {
          available_at: string;
          decision_code: string;
          started: boolean;
          terminal_fingerprints: string[];
        }[];
      };
      sms_ai_reconcile_outcomes: {
        Args: {
          p_negative_outcomes: Json;
          p_positive_fingerprints: string[];
          p_strike_threshold?: number;
          p_user_id: string;
        };
        Returns: {
          is_terminal: boolean;
          sms_fingerprint: string;
          strike_count: number;
        }[];
      };
      sms_ai_release_work: {
        Args: { p_decision_code?: string; p_request_id: string };
        Returns: boolean;
      };
      sms_ai_reserve_work: {
        Args: {
          p_burst_window_seconds: number;
          p_capability: string;
          p_estimated_input_tokens: number;
          p_history_cooldown_seconds: number;
          p_max_provider_starts_per_burst: number;
          p_max_units_per_rolling_window: number;
          p_max_units_per_scan: number;
          p_payload_bytes: number;
          p_request_key: string;
          p_reservation_lease_seconds: number;
          p_rolling_window_seconds: number;
          p_scan_kind: string;
          p_scan_session_id: string;
          p_unit_count: number;
          p_user_id: string;
        };
        Returns: {
          accepted: boolean;
          available_at: string;
          decision_code: string;
          is_replay: boolean;
          request_id: string;
        }[];
      };
      sms_ai_reserve_work_v2: {
        Args: {
          p_burst_window_seconds: number;
          p_candidate_fingerprints: string[];
          p_capability: string;
          p_estimated_input_tokens: number;
          p_history_cooldown_seconds: number;
          p_max_provider_starts_per_burst: number;
          p_max_units_per_rolling_window: number;
          p_max_units_per_scan: number;
          p_payload_bytes: number;
          p_request_digest: string;
          p_request_key: string;
          p_reservation_lease_seconds: number;
          p_rolling_window_seconds: number;
          p_scan_kind: string;
          p_scan_session_id: string;
          p_unit_count: number;
          p_user_id: string;
        };
        Returns: {
          accepted: boolean;
          available_at: string;
          decision_code: string;
          is_replay: boolean;
          request_id: string;
        }[];
      };
      sms_ai_resolve_scan_window: {
        Args: {
          p_client_scan_started_at: string;
          p_edge_grace_seconds: number;
          p_max_future_skew_seconds: number;
          p_scan_kind: string;
          p_scan_session_id: string;
          p_user_id: string;
        };
        Returns: {
          accepted_scan_started_at: string;
        }[];
      };
    };
    Enums: {
      account_type: "CASH" | "BANK" | "DIGITAL_WALLET";
      alert_fired_level: "WARNING" | "DANGER";
      asset_type: "METAL" | "CRYPTO" | "REAL_ESTATE";
      budget_period: "WEEKLY" | "MONTHLY" | "CUSTOM";
      budget_status: "ACTIVE" | "PAUSED";
      budget_type: "CATEGORY" | "GLOBAL";
      category_nature: "WANT" | "NEED" | "MUST";
      currency_type:
        | "EGP"
        | "SAR"
        | "AED"
        | "KWD"
        | "QAR"
        | "BHD"
        | "OMR"
        | "JOD"
        | "IQD"
        | "LYD"
        | "TND"
        | "MAD"
        | "DZD"
        | "USD"
        | "EUR"
        | "GBP"
        | "JPY"
        | "CHF"
        | "CNY"
        | "INR"
        | "KRW"
        | "KPW"
        | "SGD"
        | "HKD"
        | "MYR"
        | "AUD"
        | "NZD"
        | "CAD"
        | "SEK"
        | "NOK"
        | "DKK"
        | "ISK"
        | "TRY"
        | "RUB"
        | "ZAR"
        | "BTC";
      debt_status: "ACTIVE" | "PARTIALLY_PAID" | "SETTLED" | "WRITTEN_OFF";
      debt_type: "LENT" | "BORROWED";
      gold_karat_enum: "24" | "22" | "21" | "18" | "14" | "10";
      metal_type: "GOLD" | "SILVER" | "PLATINUM" | "PALLADIUM";
      preferred_language_code: "en" | "ar";
      recurring_action: "AUTO_CREATE" | "NOTIFY";
      recurring_frequency:
        | "DAILY"
        | "WEEKLY"
        | "MONTHLY"
        | "QUARTERLY"
        | "YEARLY"
        | "CUSTOM";
      recurring_status: "ACTIVE" | "PAUSED" | "COMPLETED";
      silver_fineness_enum: "999" | "950" | "925" | "900" | "850" | "800";
      theme_preference: "LIGHT" | "DARK" | "SYSTEM";
      transaction_source: "MANUAL" | "VOICE" | "SMS" | "RECURRING";
      transaction_type: "EXPENSE" | "INCOME";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_type: ["CASH", "BANK", "DIGITAL_WALLET"],
      alert_fired_level: ["WARNING", "DANGER"],
      asset_type: ["METAL", "CRYPTO", "REAL_ESTATE"],
      budget_period: ["WEEKLY", "MONTHLY", "CUSTOM"],
      budget_status: ["ACTIVE", "PAUSED"],
      budget_type: ["CATEGORY", "GLOBAL"],
      category_nature: ["WANT", "NEED", "MUST"],
      currency_type: [
        "EGP",
        "SAR",
        "AED",
        "KWD",
        "QAR",
        "BHD",
        "OMR",
        "JOD",
        "IQD",
        "LYD",
        "TND",
        "MAD",
        "DZD",
        "USD",
        "EUR",
        "GBP",
        "JPY",
        "CHF",
        "CNY",
        "INR",
        "KRW",
        "KPW",
        "SGD",
        "HKD",
        "MYR",
        "AUD",
        "NZD",
        "CAD",
        "SEK",
        "NOK",
        "DKK",
        "ISK",
        "TRY",
        "RUB",
        "ZAR",
        "BTC",
      ],
      debt_status: ["ACTIVE", "PARTIALLY_PAID", "SETTLED", "WRITTEN_OFF"],
      debt_type: ["LENT", "BORROWED"],
      gold_karat_enum: ["24", "22", "21", "18", "14", "10"],
      metal_type: ["GOLD", "SILVER", "PLATINUM", "PALLADIUM"],
      preferred_language_code: ["en", "ar"],
      recurring_action: ["AUTO_CREATE", "NOTIFY"],
      recurring_frequency: [
        "DAILY",
        "WEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "YEARLY",
        "CUSTOM",
      ],
      recurring_status: ["ACTIVE", "PAUSED", "COMPLETED"],
      silver_fineness_enum: ["999", "950", "925", "900", "850", "800"],
      theme_preference: ["LIGHT", "DARK", "SYSTEM"],
      transaction_source: ["MANUAL", "VOICE", "SMS", "RECURRING"],
      transaction_type: ["EXPENSE", "INCOME"],
    },
  },
} as const;
