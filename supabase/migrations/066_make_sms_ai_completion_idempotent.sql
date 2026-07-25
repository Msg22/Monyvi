CREATE OR REPLACE FUNCTION public.sms_ai_complete_work(
  p_request_id uuid,
  p_completed_with_provider_error boolean,
  p_decision_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_status text := CASE
    WHEN p_completed_with_provider_error THEN 'completed_with_provider_error'
    ELSE 'completed'
  END;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sms_ai_complete_work requires service_role';
  END IF;

  UPDATE public.sms_ai_work_requests
  SET
    status = v_target_status,
    decision_code = p_decision_code,
    updated_at = clock_timestamp()
  WHERE id = p_request_id
    AND status = 'provider_started';

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.sms_ai_work_requests
    WHERE id = p_request_id
      AND status = v_target_status
      AND decision_code IS NOT DISTINCT FROM p_decision_code
  );
END;
$$;
