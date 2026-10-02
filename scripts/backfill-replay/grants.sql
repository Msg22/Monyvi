-- Harness-only grants for the Metals backfill replay harness. Applies AFTER
-- replaying supabase/migrations 001-074 so every replayed table exists.
-- Mirrors the Supabase platform defaults, then re-applies the revokes that
-- the blanket grant would otherwise override. Disposable database only.

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
REVOKE ALL ON public.financial_action_groups FROM anon;
REVOKE ALL ON public.financial_action_groups FROM authenticated;
GRANT SELECT ON public.financial_action_groups TO authenticated;
REVOKE ALL ON public.sms_ai_scan_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sms_ai_usage_events FROM anon, authenticated;
REVOKE ALL ON public.sms_ai_work_requests FROM anon, authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
