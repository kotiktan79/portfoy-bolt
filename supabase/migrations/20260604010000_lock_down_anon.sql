/*
  # Lock down the anon role (RLS hardening)

  The app previously used the public anon key with permissive RLS policies
  (USING true), so anyone with the project URL + anon key could read/write all
  financial data. The app now authenticates via Supabase Auth (see AuthGate),
  so every legitimate request runs as the `authenticated` role.

  This revokes ALL table/sequence privileges from `anon` in the public schema —
  an unauthenticated request (anon key only) is denied at the GRANT level, before
  RLS is even evaluated. `authenticated` (logged-in app) and `service_role`
  (crons / serverless via SUPABASE_SERVICE_ROLE_KEY) keep their privileges.

  Applied to the live project via the Management API on 2026-06-04 after
  confirming login + authenticated reads work. Kept as a tracked migration.
*/

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Future tables/sequences created in this schema should not grant to anon either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Ask PostgREST to reload its schema/role cache so the change takes effect now.
NOTIFY pgrst, 'reload schema';
