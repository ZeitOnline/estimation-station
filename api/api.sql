-- =============================================================================
-- api.sql  —  the API schema: VIEWS + FUNCTIONS that PostgREST turns into HTTP.
-- =============================================================================
-- PostgREST is pointed at the `api` schema only. Every view here becomes a REST
-- endpoint; every function becomes an RPC endpoint under /rpc/<name>.
--
--   view  api.notes        ->  GET/POST/PATCH/DELETE  http://localhost:3000/notes
--   func  api.health()     ->  GET                    http://localhost:3000/rpc/health
--
-- This file is re-run on every migration (see migrations/migrate.sh), so it is
-- always `create or replace` — safe to run again and again.
-- =============================================================================

set client_encoding = 'utf8';
create schema if not exists api;

-- Health check: returns 200 with a smiley. Handy for k8s readiness probes.
create or replace function api.health() returns text as $$
begin
    return ':-)';
end;
$$ language plpgsql;

-- The main view. Right now it's a straight pass-through of public.notes, but
-- this is exactly where you'd hide columns, join tables, compute fields, etc.
-- Try: add `, char_length(body) as body_length` and refresh — the REST API
-- gains a new field with zero backend code.
create or replace view api.notes as
select id, title, body, created, modified
from public.notes;

-- Example of a computed/read-only view: the 5 most recently modified notes.
create or replace view api.recent_notes as
select id, title, modified
from public.notes
order by modified desc
limit 5;

-- =============================================================================
-- Access grants. For this learning repo the anonymous role can do everything,
-- so you can poke the API with plain curl and no auth. Tightening this (JWT,
-- per-role grants) is a great "level 2" exercise — see auth.sql.
-- =============================================================================
grant usage on schema api to anon;
grant usage, select on all sequences in schema public to anon;

grant select, insert, update, delete on public.notes to anon;
grant select, insert, update, delete on api.notes to anon;
grant select on api.recent_notes to anon;
