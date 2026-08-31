-- Generic durable financial-action identity, replay, and outbox foundation.
-- Account effects and account revision CAS remain disabled until migration 069.

CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.financial_action_escape_json_string_v1(
  p_value text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result text := '"';
  v_character text;
  v_code_point integer;
BEGIN
  FOR v_index IN 1..char_length(p_value) LOOP
    v_character := substr(p_value, v_index, 1);
    v_code_point := ascii(v_character);
    IF v_character = '"' THEN
      v_result := v_result || chr(92) || '"';
    ELSIF v_character = chr(92) THEN
      v_result := v_result || chr(92) || chr(92);
    ELSIF v_character = chr(8) THEN
      v_result := v_result || chr(92) || 'b';
    ELSIF v_character = chr(12) THEN
      v_result := v_result || chr(92) || 'f';
    ELSIF v_character = chr(10) THEN
      v_result := v_result || chr(92) || 'n';
    ELSIF v_character = chr(13) THEN
      v_result := v_result || chr(92) || 'r';
    ELSIF v_character = chr(9) THEN
      v_result := v_result || chr(92) || 't';
    ELSIF v_code_point BETWEEN 1 AND 31 THEN
      v_result := v_result || chr(92) || 'u' || lpad(to_hex(v_code_point), 4, '0');
    ELSE
      v_result := v_result || v_character;
    END IF;
  END LOOP;
  RETURN v_result || '"';
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_assert_json_grammar_v1(
  p_value json
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text := json_typeof(p_value);
  v_duplicate_key text;
  v_entry record;
BEGIN
  IF v_type = 'number' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_json_number_forbidden';
  ELSIF v_type = 'object' THEN
    SELECT entry.key INTO v_duplicate_key
    FROM json_each(p_value) AS entry
    GROUP BY entry.key
    HAVING count(*) > 1
    ORDER BY convert_to(entry.key, 'UTF8')
    LIMIT 1;

    IF v_duplicate_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_json_duplicate_key';
    END IF;

    FOR v_entry IN SELECT entry.key, entry.value FROM json_each(p_value) AS entry LOOP
      IF v_entry.key !~ '^[ -~]+$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'financial_action_json_non_ascii_key';
      END IF;
      PERFORM private.financial_action_assert_json_grammar_v1(v_entry.value);
    END LOOP;
  ELSIF v_type = 'array' THEN
    FOR v_entry IN SELECT entry.value FROM json_array_elements(p_value) AS entry LOOP
      PERFORM private.financial_action_assert_json_grammar_v1(v_entry.value);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_encode_jsonb_v1(
  p_value jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text := jsonb_typeof(p_value);
  v_result text;
BEGIN
  IF v_type = 'null' THEN
    RETURN 'null';
  ELSIF v_type = 'boolean' THEN
    RETURN p_value::text;
  ELSIF v_type = 'string' THEN
    RETURN private.financial_action_escape_json_string_v1(p_value #>> '{}');
  ELSIF v_type = 'number' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_json_number_forbidden';
  ELSIF v_type = 'array' THEN
    SELECT '[' || COALESCE(
      string_agg(private.financial_action_encode_jsonb_v1(entry.value), ',' ORDER BY entry.ordinality),
      ''
    ) || ']'
    INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS entry(value, ordinality);
    RETURN v_result;
  ELSIF v_type = 'object' THEN
    SELECT '{' || COALESCE(
      string_agg(
        private.financial_action_escape_json_string_v1(entry.key) || ':' ||
        private.financial_action_encode_jsonb_v1(entry.value),
        ',' ORDER BY convert_to(entry.key, 'UTF8')
      ),
      ''
    ) || '}'
    INTO v_result
    FROM jsonb_each(p_value) AS entry(key, value);
    RETURN v_result;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_json_invalid_type';
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_canonical_json_value_v1(
  p_raw_text text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_json json;
  v_jsonb jsonb;
  v_canonical text;
BEGIN
  BEGIN
    v_json := p_raw_text::json;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_json';
  END;
  PERFORM private.financial_action_assert_json_grammar_v1(v_json);
  v_jsonb := v_json::jsonb;
  v_canonical := private.financial_action_encode_jsonb_v1(v_jsonb);
  IF p_raw_text <> v_canonical THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_json_not_canonical';
  END IF;
  RETURN v_canonical;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_metals_sell_payload_v1(
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_payload) AS key)
    IS DISTINCT FROM ARRAY[
      'feeMinorUnits', 'grossProceedsDecimal', 'holdingId',
      'includeAccountCredit', 'netProceedsMinorUnits', 'notes',
      'rateReferenceIds'
    ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF jsonb_typeof(p_payload -> 'feeMinorUnits') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'grossProceedsDecimal') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'holdingId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'includeAccountCredit') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_payload -> 'netProceedsMinorUnits') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload -> 'notes') IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF (p_payload ->> 'feeMinorUnits') !~ '^(0|[1-9][0-9]*)$'
    OR length(p_payload ->> 'feeMinorUnits') > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF (p_payload ->> 'grossProceedsDecimal') !~ '^([1-9][0-9]*|(0|[1-9][0-9]*)\.[0-9]*[1-9])$'
    OR length(replace(p_payload ->> 'grossProceedsDecimal', '.', '')) > 50
    OR length(split_part(p_payload ->> 'grossProceedsDecimal', '.', 2)) > 18 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF (p_payload ->> 'holdingId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_payload -> 'includeAccountCredit' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF (p_payload ->> 'netProceedsMinorUnits') !~ '^(0|[1-9][0-9]*)$'
    OR length(p_payload ->> 'netProceedsMinorUnits') > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF octet_length(p_payload ->> 'notes') > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF jsonb_typeof(p_payload -> 'rateReferenceIds') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF jsonb_array_length(p_payload -> 'rateReferenceIds') > 16 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'rateReferenceIds') AS reference(value)
    WHERE jsonb_typeof(reference.value) IS DISTINCT FROM 'string'
      OR (reference.value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_payload';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_registered_payload_v1(
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_value ->> 'domain' = 'metals'
    AND p_value ->> 'kind' = 'sell'
    AND p_value ->> 'payloadVersion' = 'metals.sell/v1'
  THEN
    PERFORM private.financial_action_validate_metals_sell_payload_v1(p_value -> 'payload');
    RETURN;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'financial_action_unknown_definition';
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_envelope_v1(
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timestamp timestamptz;
BEGIN
  IF jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_value) AS key)
    IS DISTINCT FROM ARRAY[
      'actionId', 'domain', 'domainReferenceId', 'envelopeVersion',
      'expectedAccountRevision', 'kind', 'occurredAt', 'payload',
      'payloadVersion', 'userId'
    ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF jsonb_typeof(p_value -> 'actionId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'userId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'domain') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'domainReferenceId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'kind') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'envelopeVersion') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'payloadVersion') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'occurredAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_value -> 'expectedAccountRevision') IS DISTINCT FROM 'null'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF (p_value ->> 'actionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_value ->> 'domain' NOT IN ('metals', 'transactions', 'transfers', 'recurring_payments', 'sms')
    OR (p_value ->> 'domainReferenceId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_value ->> 'envelopeVersion' <> 'monyvi.financial-action/v1'
    OR length(btrim(p_value ->> 'kind')) = 0
    OR length(btrim(p_value ->> 'payloadVersion')) = 0
    OR (p_value ->> 'userId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  IF (p_value ->> 'occurredAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;
  BEGIN
    v_timestamp := (p_value ->> 'occurredAt')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END;
  IF to_char(v_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    <> p_value ->> 'occurredAt'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_envelope';
  END IF;

  PERFORM private.financial_action_validate_registered_payload_v1(p_value);
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_canonical_json_v1(
  p_raw_text text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_json json;
  v_jsonb jsonb;
  v_canonical text;
BEGIN
  IF octet_length(p_raw_text) > 65536 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_payload_too_large';
  END IF;

  BEGIN
    v_json := p_raw_text::json;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'financial_action_invalid_json';
  END;
  PERFORM private.financial_action_assert_json_grammar_v1(v_json);
  v_jsonb := v_json::jsonb;
  PERFORM private.financial_action_validate_envelope_v1(v_jsonb);
  v_canonical := private.financial_action_encode_jsonb_v1(v_jsonb);
  IF p_raw_text <> v_canonical THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_json_not_canonical';
  END IF;
  RETURN v_canonical;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_assert_transition_v1(
  p_from_state text,
  p_to_state text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    (p_from_state = 'pending_local' AND p_to_state IN ('local_complete', 'reconciliation_incomplete'))
    OR (p_from_state = 'local_complete' AND p_to_state IN ('sync_pending', 'reconciliation_incomplete'))
    OR (p_from_state = 'sync_pending' AND p_to_state IN ('sync_failed', 'accepted', 'rejected_compensating', 'reconciliation_incomplete'))
    OR (p_from_state = 'sync_failed' AND p_to_state IN ('sync_pending', 'reconciliation_incomplete'))
    OR (p_from_state = 'rejected_compensating' AND p_to_state IN ('reconciled', 'reconciliation_incomplete'))
    OR (p_from_state = 'reconciliation_incomplete' AND p_to_state IN ('accepted', 'rejected_compensating'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_transition';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_state_evidence_v1(
  p_state text,
  p_server_outcome text,
  p_outcome_json text,
  p_rejection_code text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_outcome boolean := p_server_outcome IS NOT NULL;
  v_has_outcome_json boolean := p_outcome_json IS NOT NULL;
  v_has_rejection boolean := p_rejection_code ~ '^[a-z][a-z0-9_]*$';
  v_is_valid boolean := false;
BEGIN
  IF p_outcome_json IS NOT NULL THEN
    PERFORM private.financial_action_canonical_json_value_v1(p_outcome_json);
  END IF;

  IF p_state IN ('pending_local', 'local_complete', 'sync_pending') THEN
    v_is_valid := NOT v_has_outcome AND NOT v_has_outcome_json AND p_rejection_code IS NULL;
  ELSIF p_state = 'sync_failed' THEN
    v_is_valid := NOT v_has_outcome AND NOT v_has_outcome_json AND v_has_rejection;
  ELSIF p_state = 'accepted' THEN
    v_is_valid := p_server_outcome IN ('accepted', 'idempotent')
      AND v_has_outcome_json AND p_rejection_code IS NULL;
  ELSIF p_state IN ('rejected_compensating', 'reconciled') THEN
    v_is_valid := p_server_outcome IN ('stale', 'rejected')
      AND v_has_outcome_json AND v_has_rejection;
  ELSIF p_state = 'reconciliation_incomplete' THEN
    v_is_valid := v_has_outcome = v_has_outcome_json
      AND v_has_rejection
      AND (NOT v_has_outcome OR p_server_outcome IN ('accepted', 'idempotent', 'stale', 'rejected'));
  END IF;

  IF NOT COALESCE(v_is_valid, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_invalid_state_evidence';
  END IF;
END;
$$;

CREATE TABLE public.financial_action_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  kind text NOT NULL,
  domain_reference_id uuid NOT NULL,
  payload_json text NOT NULL,
  payload_hash text NOT NULL,
  expected_account_revision text,
  state text NOT NULL DEFAULT 'pending_local',
  server_outcome text,
  outcome_json text,
  rejection_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT financial_action_groups_domain CHECK (
    domain IN ('metals', 'transactions', 'transfers', 'recurring_payments', 'sms')
  ),
  CONSTRAINT financial_action_groups_kind_not_blank CHECK (length(btrim(kind)) > 0),
  CONSTRAINT financial_action_groups_hash_format CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT financial_action_expected_revision_invalid CHECK (
    expected_account_revision IS NULL
      OR expected_account_revision ~ '^(0|[1-9][0-9]*)$'
  ),
  CONSTRAINT financial_action_groups_foundation_revision_disabled CHECK (
    expected_account_revision IS NULL
  ),
  CONSTRAINT financial_action_groups_state CHECK (state IN (
    'pending_local', 'local_complete', 'sync_pending', 'sync_failed', 'accepted',
    'rejected_compensating', 'reconciled', 'reconciliation_incomplete'
  )),
  CONSTRAINT financial_action_groups_server_outcome CHECK (
    server_outcome IS NULL OR server_outcome IN ('accepted', 'idempotent', 'stale', 'rejected')
  ),
  CONSTRAINT financial_action_groups_retained CHECK (deleted = false),
  CONSTRAINT financial_action_groups_outcome_pair CHECK (
    (server_outcome IS NULL) = (outcome_json IS NULL)
  ),
  CONSTRAINT financial_action_groups_rejection_code CHECK (
    rejection_code IS NULL OR rejection_code ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT financial_action_groups_state_evidence CHECK (
    (
      state IN ('pending_local', 'local_complete', 'sync_pending')
      AND server_outcome IS NULL AND outcome_json IS NULL AND rejection_code IS NULL
    ) OR (
      state = 'sync_failed'
      AND server_outcome IS NULL AND outcome_json IS NULL AND rejection_code IS NOT NULL
    ) OR (
      state = 'accepted'
      AND server_outcome IN ('accepted', 'idempotent')
      AND outcome_json IS NOT NULL AND rejection_code IS NULL
    ) OR (
      state IN ('rejected_compensating', 'reconciled')
      AND server_outcome IN ('stale', 'rejected')
      AND outcome_json IS NOT NULL AND rejection_code IS NOT NULL
    ) OR (
      state = 'reconciliation_incomplete'
      AND rejection_code IS NOT NULL
      AND (
        (server_outcome IS NULL AND outcome_json IS NULL)
        OR (server_outcome IS NOT NULL AND outcome_json IS NOT NULL)
      )
    )
  ),
  CONSTRAINT financial_action_groups_outcome_canonical CHECK (
    outcome_json IS NULL
      OR outcome_json = private.financial_action_canonical_json_value_v1(outcome_json)
  ),
  CONSTRAINT financial_action_groups_payload_canonical CHECK (
    payload_json = private.financial_action_canonical_json_v1(payload_json)
  ),
  CONSTRAINT financial_action_groups_payload_hash_matches CHECK (
    payload_hash = encode(
      extensions.digest(convert_to(payload_json, 'UTF8'), 'sha256'),
      'hex'
    )
  )
);

CREATE UNIQUE INDEX financial_action_groups_user_action_unique
  ON public.financial_action_groups (user_id, action_id);
CREATE INDEX financial_action_groups_user_state_updated
  ON public.financial_action_groups (user_id, state, updated_at);
CREATE INDEX financial_action_groups_user_domain_created
  ON public.financial_action_groups (user_id, domain, created_at);

CREATE OR REPLACE FUNCTION private.financial_action_assert_root_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_envelope jsonb;
BEGIN
  PERFORM private.financial_action_canonical_json_v1(NEW.payload_json);
  v_envelope := NEW.payload_json::jsonb;

  IF NEW.action_id::text IS DISTINCT FROM v_envelope ->> 'actionId'
    OR NEW.user_id::text IS DISTINCT FROM v_envelope ->> 'userId'
    OR NEW.domain IS DISTINCT FROM v_envelope ->> 'domain'
    OR NEW.domain_reference_id::text IS DISTINCT FROM v_envelope ->> 'domainReferenceId'
    OR NEW.kind IS DISTINCT FROM v_envelope ->> 'kind'
    OR NEW.expected_account_revision IS DISTINCT FROM
      v_envelope ->> 'expectedAccountRevision'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_root_binding_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_action_groups_assert_root_binding
  BEFORE INSERT OR UPDATE ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_assert_root_binding_v1();

CREATE OR REPLACE FUNCTION private.financial_action_assert_evidence_update_v1(
  p_old_state text,
  p_old_server_outcome text,
  p_old_outcome_json text,
  p_old_rejection_code text,
  p_new_state text,
  p_new_server_outcome text,
  p_new_outcome_json text,
  p_new_rejection_code text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_old_state = 'reconciliation_incomplete'
    AND p_new_state = 'accepted'
    AND p_old_server_outcome IN ('accepted', 'idempotent')
    AND p_new_server_outcome IS NOT DISTINCT FROM p_old_server_outcome
    AND p_new_outcome_json IS NOT DISTINCT FROM p_old_outcome_json
    AND p_old_rejection_code IS NOT NULL
    AND p_new_rejection_code IS NULL
  THEN
    RETURN;
  END IF;

  IF p_old_server_outcome IS NOT NULL
    AND (
      p_new_server_outcome IS DISTINCT FROM p_old_server_outcome
      OR p_new_outcome_json IS DISTINCT FROM p_old_outcome_json
      OR p_new_rejection_code IS DISTINCT FROM p_old_rejection_code
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_immutable_outcome_evidence';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_state_transition_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.deleted IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_root_delete_forbidden';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM private.financial_action_assert_evidence_update_v1(
      OLD.state,
      OLD.server_outcome,
      OLD.outcome_json,
      OLD.rejection_code,
      NEW.state,
      NEW.server_outcome,
      NEW.outcome_json,
      NEW.rejection_code
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state THEN
    PERFORM private.financial_action_assert_transition_v1(OLD.state, NEW.state);
  END IF;

  PERFORM private.financial_action_validate_state_evidence_v1(
    NEW.state,
    NEW.server_outcome,
    NEW.outcome_json,
    NEW.rejection_code
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_action_groups_validate_state_transition
  BEFORE INSERT OR UPDATE ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_validate_state_transition_v1();

CREATE OR REPLACE FUNCTION private.financial_action_guard_immutable_root_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.domain IS DISTINCT FROM OLD.domain
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.domain_reference_id IS DISTINCT FROM OLD.domain_reference_id
    OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.expected_account_revision IS DISTINCT FROM OLD.expected_account_revision
    OR (
      OLD.server_outcome IS NOT NULL
      AND NEW.server_outcome IS DISTINCT FROM OLD.server_outcome
    )
    OR (
      OLD.outcome_json IS NOT NULL
      AND NEW.outcome_json IS DISTINCT FROM OLD.outcome_json
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_immutable_root_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_action_groups_immutable_root
  BEFORE UPDATE ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_guard_immutable_root_v1();

CREATE TRIGGER handle_financial_action_groups_updated_at
  BEFORE UPDATE ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.financial_action_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own financial action groups"
  ON public.financial_action_groups FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.financial_action_groups FROM authenticated;
GRANT SELECT ON public.financial_action_groups TO authenticated;
REVOKE ALL ON public.financial_action_groups FROM anon;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_action_escape_json_string_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_assert_json_grammar_v1(json) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_encode_jsonb_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_canonical_json_value_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_metals_sell_payload_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_registered_payload_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_envelope_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_canonical_json_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_assert_transition_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_state_evidence_v1(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_assert_root_binding_v1() TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_assert_evidence_update_v1(text, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_state_transition_v1() TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_guard_immutable_root_v1() TO service_role;
