CREATE TABLE public.gst_einvoice_connections (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  provider text NOT NULL DEFAULT 'iris',
  environment text NOT NULL DEFAULT 'sandbox',
  connection_status text NOT NULL DEFAULT 'not_connected',
  authorization_status text NOT NULL DEFAULT 'not_connected',
  authorized_gstin text NOT NULL DEFAULT '',
  provider_reference text,
  validated_legal_name text,
  validated_trade_name text,
  validated_address jsonb,
  gstin_validated_at timestamptz,
  last_connection_attempt_at timestamptz,
  last_successful_connection_at timestamptz,
  authorization_updated_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gst_einvoice_connections_provider_check CHECK (provider = 'iris'),
  CONSTRAINT gst_einvoice_connections_environment_check CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT gst_einvoice_connections_status_check CHECK (connection_status IN ('not_connected', 'connected', 'failed')),
  CONSTRAINT gst_einvoice_connections_authorization_check CHECK (authorization_status IN ('not_connected', 'pending_authorization', 'authorized', 'failed', 'revoked'))
);

GRANT SELECT ON public.gst_einvoice_connections TO authenticated;
GRANT ALL ON public.gst_einvoice_connections TO service_role;
ALTER TABLE public.gst_einvoice_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own einvoice connection select" ON public.gst_einvoice_connections FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER gst_einvoice_connections_set_updated_at BEFORE UPDATE ON public.gst_einvoice_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gst_invoices
  ADD COLUMN einvoice_provider text,
  ADD COLUMN einvoice_environment text,
  ADD COLUMN provider_request_id text,
  ADD COLUMN provider_document_id text,
  ADD COLUMN idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN submission_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN submission_lock_token uuid,
  ADD COLUMN submission_lock_expires_at timestamptz,
  ADD CONSTRAINT gst_invoices_environment_check CHECK (einvoice_environment IS NULL OR einvoice_environment IN ('sandbox', 'production')),
  ADD CONSTRAINT gst_invoices_submission_state_check CHECK (submission_state IN ('idle', 'submitting', 'cancelling'));

CREATE UNIQUE INDEX gst_invoices_user_idempotency_idx ON public.gst_invoices (user_id, idempotency_key);

ALTER TABLE public.gst_einvoice_logs
  ADD COLUMN gstin text,
  ADD COLUMN api_environment text,
  ADD COLUMN request_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN provider_request_id text,
  ADD COLUMN document_key text,
  ADD COLUMN payload_hash text,
  ADD COLUMN irn text,
  ADD COLUMN ack_no text,
  ADD COLUMN ack_date timestamptz,
  ADD COLUMN retry_attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN request_started_at timestamptz,
  ADD COLUMN response_received_at timestamptz,
  ADD CONSTRAINT gst_einvoice_logs_environment_check CHECK (api_environment IS NULL OR api_environment IN ('sandbox', 'production')),
  ADD CONSTRAINT gst_einvoice_logs_request_status_check CHECK (request_status IN ('started', 'succeeded', 'failed', 'rejected'));

CREATE OR REPLACE FUNCTION public.claim_einvoice_submission(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token uuid := gen_random_uuid();
BEGIN
  UPDATE public.gst_invoices
  SET submission_state = 'submitting',
      submission_lock_token = _token,
      submission_lock_expires_at = now() + interval '2 minutes'
  WHERE id = _invoice_id
    AND user_id = auth.uid()
    AND einvoice_required = true
    AND einvoice_status IN ('pending', 'failed')
    AND irn IS NULL
    AND (submission_state = 'idle' OR submission_lock_expires_at < now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_einvoice_cancellation(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token uuid := gen_random_uuid();
BEGIN
  UPDATE public.gst_invoices
  SET submission_state = 'cancelling',
      submission_lock_token = _token,
      submission_lock_expires_at = now() + interval '2 minutes'
  WHERE id = _invoice_id
    AND user_id = auth.uid()
    AND einvoice_status = 'generated'
    AND irn IS NOT NULL
    AND (submission_state = 'idle' OR submission_lock_expires_at < now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_einvoice_claim(_invoice_id uuid, _lock_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gst_invoices
  SET submission_state = 'idle', submission_lock_token = NULL, submission_lock_expires_at = NULL
  WHERE id = _invoice_id AND user_id = auth.uid() AND submission_lock_token = _lock_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_einvoice_submission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_einvoice_cancellation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_einvoice_claim(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_einvoice_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_einvoice_cancellation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_einvoice_claim(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_einvoice_submission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_einvoice_cancellation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_einvoice_claim(uuid, uuid) TO service_role;