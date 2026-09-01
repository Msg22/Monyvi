-- Issue #242 Slice 3B preparatory account-financial cutover.
--
-- This migration deliberately does not register an action payload schema and does
-- not expose an accepted mutation RPC. Those activation steps remain fail-closed
-- until the versioned action-payload decision matrix is approved.

ALTER TABLE public.accounts
  ADD COLUMN financial_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_financial_revision_range CHECK (
    financial_revision >= 0
    AND financial_revision <= 9223372036854775807
  ),
  ADD CONSTRAINT accounts_user_id_id_key UNIQUE (user_id, id);

CREATE OR REPLACE FUNCTION private.financial_action_account_revision_from_text_v1(
  p_value text
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision bigint;
BEGIN
  IF p_value !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  BEGIN
    v_revision := p_value::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END;

  IF v_revision < 0 OR v_revision > 9223372036854775807 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_validate_account_guards_v1(
  p_guards jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guard jsonb;
  v_account_id text;
  v_previous_account_id text;
BEGIN
  IF jsonb_typeof(p_guards) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'financial_action_account_guards_invalid';
  END IF;

  FOR v_guard IN
    SELECT guard.value
    FROM jsonb_array_elements(p_guards) WITH ORDINALITY AS guard(value, position)
    ORDER BY guard.position
  LOOP
    IF jsonb_typeof(v_guard) IS DISTINCT FROM 'object'
      OR (
        SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_guard) AS key
      ) IS DISTINCT FROM ARRAY['accountId', 'expectedRevision']::text[]
      OR jsonb_typeof(v_guard -> 'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_guard -> 'expectedRevision') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;

    v_account_id := v_guard ->> 'accountId';
    IF v_account_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;

    PERFORM private.financial_action_account_revision_from_text_v1(
      v_guard ->> 'expectedRevision'
    );

    IF v_previous_account_id IS NOT NULL
      AND (v_previous_account_id COLLATE "C") >= (v_account_id COLLATE "C")
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'financial_action_account_guards_invalid';
    END IF;
    v_previous_account_id := v_account_id;
  END LOOP;
END;
$$;

ALTER TABLE public.financial_action_groups
  DROP CONSTRAINT financial_action_groups_foundation_guards_empty;

CREATE OR REPLACE FUNCTION private.financial_action_validate_root_account_guards_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.financial_action_validate_account_guards_v1(
    NEW.account_guards_json
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_action_groups_account_guards_valid
  BEFORE INSERT OR UPDATE OF account_guards_json
  ON public.financial_action_groups
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_validate_root_account_guards_v1();

CREATE TABLE public.account_financial_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action_id uuid NOT NULL,
  account_id uuid NOT NULL,
  domain text NOT NULL,
  kind text NOT NULL,
  amount_minor_units bigint NOT NULL,
  currency public.currency_type NOT NULL,
  accepted_account_revision bigint NOT NULL,
  reverses_effect_id uuid,
  is_effective boolean NOT NULL DEFAULT true,
  compensated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT account_financial_effect_domain CHECK (
    domain IN ('metals', 'transactions', 'transfers', 'recurring_payments', 'sms')
  ),
  CONSTRAINT account_financial_effect_kind_not_blank CHECK (
    length(btrim(kind)) > 0
  ),
  CONSTRAINT account_financial_effect_amount_nonzero CHECK (
    amount_minor_units <> 0
  ),
  CONSTRAINT account_financial_effect_amount_range CHECK (
    amount_minor_units >= -9223372036854775807
    AND amount_minor_units <= 9223372036854775807
  ),
  CONSTRAINT account_financial_effect_revision_positive CHECK (
    accepted_account_revision > 0
  ),
  CONSTRAINT account_financial_effect_revision_range CHECK (
    accepted_account_revision <= 9223372036854775807
  ),
  CONSTRAINT account_financial_effect_retained CHECK (deleted = false),
  CONSTRAINT account_financial_effect_compensation_state CHECK (
    (is_effective = true AND compensated_at IS NULL)
    OR (is_effective = false AND compensated_at IS NOT NULL)
  ),
  CONSTRAINT account_financial_effect_not_self_reversing CHECK (
    reverses_effect_id IS NULL OR reverses_effect_id <> id
  ),
  CONSTRAINT account_financial_effect_action_owner_fk
    FOREIGN KEY (user_id, action_id)
    REFERENCES public.financial_action_groups (user_id, action_id)
    ON DELETE RESTRICT,
  CONSTRAINT account_financial_effect_account_owner_fk
    FOREIGN KEY (user_id, account_id)
    REFERENCES public.accounts (user_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX account_financial_effects_user_id_id_key
  ON public.account_financial_effects (user_id, id);

ALTER TABLE public.account_financial_effects
  ADD CONSTRAINT account_financial_effect_reversal_owner_fk
  FOREIGN KEY (user_id, reverses_effect_id)
  REFERENCES public.account_financial_effects (user_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX account_financial_effects_user_action_account_kind_unique
  ON public.account_financial_effects (user_id, action_id, account_id, kind);

CREATE UNIQUE INDEX account_financial_effects_reversal_once_unique
  ON public.account_financial_effects (user_id, reverses_effect_id)
  WHERE reverses_effect_id IS NOT NULL;

CREATE INDEX account_financial_effects_user_account_revision_idx
  ON public.account_financial_effects (
    user_id,
    account_id,
    accepted_account_revision
  );

CREATE INDEX account_financial_effects_user_action_idx
  ON public.account_financial_effects (user_id, action_id);

CREATE OR REPLACE FUNCTION private.financial_action_account_effects_match_guards_v1(
  p_user_id uuid,
  p_action_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guards jsonb;
  v_domain text;
BEGIN
  SELECT root.account_guards_json, root.domain
  INTO v_guards, v_domain
  FROM public.financial_action_groups AS root
  WHERE root.user_id = p_user_id
    AND root.action_id = p_action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'financial_action_account_effect_root_missing';
  END IF;

  PERFORM private.financial_action_validate_account_guards_v1(v_guards);

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(v_guards)
  ) IS DISTINCT FROM (
    SELECT count(*)
    FROM public.account_financial_effects AS effect
    WHERE effect.user_id = p_user_id
      AND effect.action_id = p_action_id
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_guards) AS guard(value)
    LEFT JOIN public.account_financial_effects AS effect
      ON effect.user_id = p_user_id
      AND effect.action_id = p_action_id
      AND effect.account_id = (guard.value ->> 'accountId')::uuid
    LEFT JOIN public.accounts AS account
      ON account.user_id = effect.user_id
      AND account.id = effect.account_id
    WHERE effect.id IS NULL
      OR effect.domain IS DISTINCT FROM v_domain
      OR effect.currency IS DISTINCT FROM account.currency
      OR private.financial_action_account_revision_from_text_v1(
        guard.value ->> 'expectedRevision'
      ) = 9223372036854775807
      OR effect.accepted_account_revision IS DISTINCT FROM
        private.financial_action_account_revision_from_text_v1(
          guard.value ->> 'expectedRevision'
        ) + 1
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial_action_account_effects_mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_action_check_effects_match_guards_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_action_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_action_id := OLD.action_id;
  ELSE
    v_user_id := NEW.user_id;
    v_action_id := NEW.action_id;
  END IF;

  PERFORM private.financial_action_account_effects_match_guards_v1(
    v_user_id,
    v_action_id
  );
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER financial_action_groups_effects_match_guards
  AFTER INSERT OR UPDATE OF account_guards_json
  ON public.financial_action_groups
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_check_effects_match_guards_v1();

CREATE CONSTRAINT TRIGGER account_financial_effects_match_guards
  AFTER INSERT OR UPDATE OR DELETE
  ON public.account_financial_effects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_action_check_effects_match_guards_v1();

CREATE OR REPLACE FUNCTION private.account_financial_effect_guard_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_delete_forbidden';
  END IF;

  IF NEW.deleted IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_delete_forbidden';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.domain IS DISTINCT FROM OLD.domain
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.amount_minor_units IS DISTINCT FROM OLD.amount_minor_units
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.accepted_account_revision IS DISTINCT FROM OLD.accepted_account_revision
    OR NEW.reverses_effect_id IS DISTINCT FROM OLD.reverses_effect_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.is_effective IS DISTINCT FROM true
    OR NEW.is_effective IS DISTINCT FROM false
    OR OLD.compensated_at IS NOT NULL
    OR NEW.compensated_at IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'account_financial_effect_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER account_financial_effects_immutable
  BEFORE UPDATE OR DELETE ON public.account_financial_effects
  FOR EACH ROW
  EXECUTE FUNCTION private.account_financial_effect_guard_immutable_v1();

CREATE TRIGGER handle_account_financial_effects_updated_at
  BEFORE UPDATE ON public.account_financial_effects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION private.accounts_protect_financial_columns_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' AND (
      NEW.balance IS DISTINCT FROM 0::numeric
      OR NEW.financial_revision IS DISTINCT FROM 0::bigint
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'account_financial_action_rpc_required';
    END IF;

    IF TG_OP = 'UPDATE' AND (
      NEW.balance IS DISTINCT FROM OLD.balance
      OR NEW.financial_revision IS DISTINCT FROM OLD.financial_revision
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'account_financial_action_rpc_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_protect_financial_columns
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION private.accounts_protect_financial_columns_v1();

REVOKE ALL ON FUNCTION public.recalculate_all_account_balances()
  FROM PUBLIC, anon, authenticated;

-- Preserve the existing owner-scoped account CRUD contract explicitly so
-- metadata writes reach the protected-column trigger on every Supabase bootstrap.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;

ALTER TABLE public.account_financial_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own account financial effects"
  ON public.account_financial_effects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.account_financial_effects FROM authenticated;
GRANT SELECT ON public.account_financial_effects TO authenticated;
REVOKE ALL ON public.account_financial_effects FROM anon;

REVOKE ALL ON FUNCTION private.financial_action_account_revision_from_text_v1(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_validate_account_guards_v1(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_validate_root_account_guards_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_account_effects_match_guards_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.financial_action_check_effects_match_guards_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.account_financial_effect_guard_immutable_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.accounts_protect_financial_columns_v1()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.financial_action_account_revision_from_text_v1(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_validate_account_guards_v1(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.financial_action_account_effects_match_guards_v1(uuid, uuid)
  TO service_role;
