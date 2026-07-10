-- =============================================================================
-- schema.sql  —  the PUBLIC schema: your real tables live here.
-- =============================================================================
-- This is the raw data model. It is loaded once when the database is first
-- created (see migrations/versions/000000000000_initial_schema.sql, which is
-- literally a copy of this file for the very first migration).
--
-- LEARNING NOTE:
--   * `public`  = where tables physically live.
--   * `api`     = a thin layer of VIEWS/FUNCTIONS on top (see api.sql). PostgREST
--                 only exposes the `api` schema, so `public` stays private.
--   This split is the whole trick behind "SQL becomes a REST API".
-- =============================================================================

set client_encoding = 'utf8';

-- One tiny table to start. Break it, rename columns, add tables — then write a
-- migration to make the change permanent (see README "Add a table").
create table if not exists public.notes (
    id          serial primary key,
    title       text not null,
    body        text not null default '',
    created     timestamp with time zone not null default now(),
    modified    timestamp with time zone not null default now()
);

-- A trigger that bumps `modified` on every update. A gentle intro to triggers.
create or replace function public.touch_modified() returns trigger as $$
begin
    new.modified = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists notes_touch_modified on public.notes;
create trigger notes_touch_modified
    before update on public.notes
    for each row
    execute procedure public.touch_modified();
