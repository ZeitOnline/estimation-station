-- Initial schema. Mirrors api/schema.sql (kept in sync by hand for this repo).
-- This is what actually builds the database in compose/k8s.

create table if not exists public.notes (
    id          serial primary key,
    title       text not null,
    body        text not null default '',
    created     timestamp with time zone not null default now(),
    modified    timestamp with time zone not null default now()
);

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

-- A couple of seed rows so the app shows something on first run.
insert into public.notes (title, body) values
    ('Welcome', 'This note came from the initial migration.'),
    ('Try me', 'Edit me via the API, or add a new table and migration.')
on conflict do nothing;
