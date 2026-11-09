-- Manual migration only; never applied by application startup or build.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tobi_configurations (
  id text PRIMARY KEY CHECK (id = 'active'),
  config_version integer NOT NULL CHECK (config_version >= 1),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  updated_at timestamptz NOT NULL
);
ALTER TABLE public.tobi_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tobi_configurations FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.tobi_configurations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.tobi_configurations FROM authenticated;
  END IF;
END $$;
-- No public policies. Only a trusted server DB owner/BYPASSRLS role may access.
COMMIT;
