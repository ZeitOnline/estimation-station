-- =============================================================================
-- auth.sql  —  database roles PostgREST logs in as.
-- =============================================================================
-- PostgREST connects as `authenticator` (a login role with almost no rights),
-- then switches to `anon` for unauthenticated requests. That switch is the
-- security boundary: anon only gets what api.sql explicitly grants it.
--
-- This is re-run on every migration and is written to be idempotent.
--
-- LEVEL-2 EXERCISE: add a second role (e.g. `staff`), give it write access in
-- api.sql, keep `anon` read-only, and gate it behind a JWT. That mirrors how
-- the real ZEIT services (wally, merkl) do authorization.
-- =============================================================================

set client_encoding = 'utf8';

do $$
begin
    -- The role PostgREST authenticates as. NOINHERIT so it must explicitly
    -- SET ROLE to anon/staff/etc.
    if 'authenticator' != all(select rolname from pg_roles) then
        create role authenticator noinherit login password 'postgrest_pw';
    end if;

    -- The role used for unauthenticated requests.
    if 'anon' != all(select rolname from pg_roles) then
        create role anon nologin;
    end if;

    -- Let authenticator become anon.
    grant anon to authenticator;
end
$$;
