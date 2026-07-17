# Planning Poker (ZEIT)

A small **Planning Poker** tool for estimating tickets as a team, built on a
readable mirror of the **ZEIT service structure** (like `wally` / `merkl`).

Open a room, share the number with the team, everyone picks an estimate, and the
moderator reveals all cards at once — the classic "estimate together, no
anchoring" flow. Access is gated behind ZEIT SSO so only the team can join.

- **App** — a **SvelteKit** frontend (`frontend/`) with a built-in realtime
  **WebSocket** layer for live rooms, presence, voting, and reveal/reset.
- **Auth** — ZEIT SSO (Keycloak/OIDC), with an off/mock mode for local dev.
- **Infra sandbox** — the same repo also inlines the ZEIT platform shapes so you
  can learn them: **Docker**, **PostgREST + Postgres**, **Alembic** migrations,
  and **k8s / Tilt**. (Estimation _history_ persistence is a planned use of this
  stack — see the plan doc.)

> **The product spec + roadmap live in
> [`docs/estimation-poker-plan.md`](docs/estimation-poker-plan.md).**

---

## Run the app

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173  (realtime WebSocket included)
```

Open http://localhost:5173 in two tabs (or two devices): create a room in one,
join the same number in the other, vote, and let the moderator reveal.

**Try it from your phone:** `npm run dev` binds to your network (`--host`), so
open the **Network** URL it prints (e.g. `http://10.70.4.83:5173`) on a device on
the same Wi‑Fi.

### Auth

Login is always on (like bitpoll): the app renders nothing but a login button
until you sign in with your ZEIT account. It uses
[`@zeitonline/svelte-oidc`](https://github.com/zeitonline/svelte-oidc) with the
Keycloak client `estimation-station` against
`https://openid.zeit.de/realms/zeit-online` — wired up in
`frontend/src/routes/+layout.svelte`. Your dev/prod origin must be a registered
redirect URI on that client.

Server-side, set `AUTH_MODE=oidc` (plain env, not `VITE_`) to also verify the
bearer token on the WebSocket and enforce who may join (email domain /
Keycloak group) — see `frontend/src/lib/server/poker/auth.ts`.

---

## Architecture

```
                      ┌───────────────────────────────────┐
   browser  ────────▶ │  frontend  (SvelteKit, :5173)      │   the Planning Poker app
      │  HTTP + WS     │  ├─ pages: landing + /room/[id]    │
      │                │  └─ realtime WebSocket (/poker-ws) │   live room state (in memory)
      │                └───────────────────────────────────┘
      │                        (optional / planned)
      └────────────────────────────────┐
                                        ▼
   ┌──────────┐     SQL    ┌───────────┐        estimation history
   │ postgres │ ◀───────── │ postgrest │        (reuses the sandbox below)
   └──────────┘            └───────────┘
```

The realtime server used to be a standalone Node service; it now lives **inside**
the SvelteKit app (`frontend/src/lib/server/poker/`) and is served on the same
port — attached to Vite's server in dev and to a small custom Node entry
(`build/server.js`) in production. Room state is in memory, so run a single
replica. Details in the plan doc, §3/§7.

---

## The infra sandbox (Postgres / PostgREST / k8s)

The repo also keeps a fully inlined "notes" stack so you can learn the ZEIT
platform shapes without a black box: the API _is_ SQL (tables in `public`, views
in the `api` schema served by **PostgREST**), migrations are **Alembic**, and
everything ships as plain **k8s** manifests + a **Tiltfile**. This is the stack
the Planning Poker _history_ feature will build on.

> **How this differs from the real ZEIT repos:** wally/merkl pull their core
> workloads from _remote_ `github.com/ZeitOnline/kustomize` components, so the
> actual Deployment YAML is hidden. Here everything is **inlined** so you can read
> and edit every line. Same shapes, no black box.

### Run the sandbox — docker-compose (easiest)

```sh
docker compose up --build
```

- **http://localhost:3001** — a page rendered by the Node server
- **http://localhost:3000/notes** — the raw REST API (JSON)
- **http://localhost:3000/rpc/health** — health function → `":-)"`

```sh
curl localhost:3000/notes                         # list
curl -X POST localhost:3000/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello","body":"from curl"}'        # create
curl localhost:3000/recent_notes                   # a computed view
```

Reset everything (fresh DB): `docker compose down -v && docker compose up --build`

### Run the sandbox — Tilt + local k8s

Needs a local cluster (`kind`, `minikube`, or Docker Desktop's k8s) and `tilt`.

```sh
tilt up          # dashboard at http://localhost:10350
```

Or straight kubectl:

```sh
docker build --target migrator -t app/migrator .
docker build --target node -t app/node .
kubectl apply -k k8s/devel
kubectl get pods -n learn        # or open k9s on namespace `learn`
```

The key idea: **you never write REST handlers for data.** You write a Postgres
`view` in `api/api.sql` and PostgREST exposes it as `GET/POST/PATCH/DELETE`
automatically.

---

## Layout

```
frontend/            the Planning Poker app (SvelteKit)
  src/routes/          landing page + /room/[id]
  src/lib/poker/       client room store, identity, vote summary
  src/lib/server/poker/  realtime WebSocket: rooms + OIDC auth (in-memory)
  src/lib/auth/        OIDC / session wiring
docs/
  estimation-poker-plan.md   product spec, roadmap, decisions

# — infra sandbox —
api/                 the SQL that defines everything
  schema.sql           tables (the `public` schema)
  api.sql              views + functions (the `api` schema PostgREST serves)
  auth.sql             database roles PostgREST logs in as
migrations/          Alembic (migrate.sh: alembic upgrade + re-apply auth/api.sql)
node/                a small Express server that renders a page from the API
k8s/base + k8s/devel plain manifests + namespace/image overlay (`learn`)
Dockerfile           multi-stage: targets `migrator`, `node`
docker-compose.yml   wires the sandbox services together
Tiltfile             live k8s dev loop
```

---

## Sandbox exercises (learn the ZEIT structure)

### 1. Change a view — no backend code

Edit `api/api.sql`, add `char_length(body) as length` to the `api.notes` view,
re-run migrations (`docker compose up migrator`, or Tilt does it live), then
`curl localhost:3000/notes` — the new field is just there.

### 2. Add a table + a migration

1. Pick a revision id (12 hex chars), e.g. `a1b2c3d4e5f6`.
2. Create `migrations/versions/a1b2c3d4e5f6_add_tags.sql` with your DDL:
   ```sql
   create table public.tags (
       id serial primary key,
       note_id integer references public.notes(id) on delete cascade,
       label text not null
   );
   ```
3. Create `migrations/versions/a1b2c3d4e5f6_add_tags.py` — copy an existing one
   and set `revision = 'a1b2c3d4e5f6'`, `down_revision = '000000000000'`.
4. Add a view in `api/api.sql` and grant access to `anon`.
5. Re-run the migrator. `curl localhost:3000/tags` works.

> Alembic can also autogenerate ids: `cd migrations && alembic revision -m "add tags"`.

### 3. Break it on purpose

Stop a container, corrupt a `.sql`, delete the postgres pod — then bring it back.
Storage is ephemeral, so `down -v` (compose) or deleting the pod (k8s) always
gives you a clean slate.

### 4. Level up (optional)

- Gate writes behind a JWT (`PGRST_JWT_SECRET`) — how the real services do it.
- Persist estimation history to a `history` table + PostgREST view (Plan §3/§8).
- Add a `frontend` Docker target + k8s manifest to deploy the app (Plan §7).
