# test-learn-zeit-structure

A deliberately tiny sandbox that mirrors the **ZEIT service structure** (like
`wally` / `merkl`) so you can learn the moving parts and break things freely:

- **Docker** — a multi-stage `Dockerfile` + `docker-compose.yml`
- **SQL & views** — the API *is* SQL: tables in `public`, views/functions in
  `api`, served over HTTP by **PostgREST**
- **Migrations** — **Alembic**, with the ZEIT convention of a `.py` revision
  that just runs a paired `.sql` file
- **Your own Node server** — a hand-written Express app that renders a page
  from the API
- **k8s / k9s** — plain, readable manifests + a `Tiltfile`

> **How this differs from the real ZEIT repos:** wally/merkl pull their core
> workloads from *remote* `github.com/ZeitOnline/kustomize` components, so the
> actual Deployment YAML is hidden (and that repo is private). Here everything
> is **inlined** so you can read and edit every line. Same shapes, no black box.

---

## The architecture

```
        ┌──────────┐     HTTP      ┌───────────┐   SQL    ┌──────────┐
 you ─▶ │  node    │ ────────────▶ │ postgrest │ ───────▶ │ postgres │
        │  :3001   │   (fetch)     │  :3000    │          │  :5432   │
        └──────────┘               └───────────┘          └──────────┘
         renders HTML          turns the `api` schema        tables live
         (your server)         into a REST API               in `public`
                                                                  ▲
                                                          ┌──────────────┐
                                                          │   migrator   │ runs once:
                                                          │ (alembic +   │ migrations,
                                                          │  auth/api.sql)│ then exits
                                                          └──────────────┘
```

The key idea: **you never write REST handlers for data.** You write a Postgres
`view` in `api/api.sql`, and PostgREST exposes it as `GET/POST/PATCH/DELETE`
automatically. The Node server is only for pages/UI that call that API.

---

## Run it — Option A: docker-compose (easiest)

```sh
docker compose up --build
```

Then open:

- **http://localhost:3001** — the page rendered by your Node server
- **http://localhost:3000/notes** — the raw REST API (JSON)
- **http://localhost:3000/rpc/health** — health function → `":-)"`

Talk to the API directly:

```sh
# list notes
curl localhost:3000/notes

# create one
curl -X POST localhost:3000/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello","body":"from curl"}'

# the computed view
curl localhost:3000/recent_notes
```

Reset everything (fresh DB): `docker compose down -v && docker compose up --build`

## Run it — Option B: Tilt + local k8s (to learn k8s / k9s)

Needs a local cluster (`kind`, `minikube`, or Docker Desktop's k8s) and `tilt`.

```sh
tilt up          # dashboard at http://localhost:10350
```

Or without Tilt, straight kubectl:

```sh
docker build --target migrator -t app/migrator .
docker build --target node -t app/node .
kubectl apply -k k8s/devel
kubectl get pods -n learn        # or open k9s and point it at namespace `learn`
```

Everything lands in the **`learn`** namespace — a perfect target to explore in
`k9s`.

---

## The layout

```
api/                 the SQL that defines everything
  schema.sql           tables (the `public` schema)
  api.sql              views + functions (the `api` schema PostgREST serves)
  auth.sql             database roles PostgREST logs in as
migrations/          Alembic
  migrate.sh           entrypoint: alembic upgrade + re-apply auth/api.sql
  env.py               connects via PG* env vars
  versions/            one <id>.py + <id>.sql per migration
node/                your own server (Express)
  server.js
k8s/
  base/                plain manifests: postgres, postgrest, migrator, node
  devel/               overlay: namespace `learn` + image names
Dockerfile           multi-stage: targets `migrator`, `node`
docker-compose.yml   wires the 4 services together
Tiltfile             live k8s dev loop
```

---

## Exercises (this is the point)

### 1. Change a view — no backend code
Edit `api/api.sql`, add `char_length(body) as length` to the `api.notes` view.
Re-run migrations (`docker compose up migrator` again, or Tilt does it live),
then `curl localhost:3000/notes` — the new field is just there.

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
   and set `revision = 'a1b2c3d4e5f6'`, `down_revision = '000000000000'` (the id
   it builds on).
4. Add a view in `api/api.sql`: `create or replace view api.tags as select * from public.tags;`
   and grant access to `anon`.
5. Re-run the migrator. `curl localhost:3000/tags` works.

> Alembic can also autogenerate ids: `cd migrations && alembic revision -m "add tags"`.

### 3. Break it on purpose
Stop a container, corrupt a `.sql`, delete the postgres pod — then bring it back.
Because storage is ephemeral, `down -v` (compose) or deleting the pod (k8s)
always gives you a clean slate.

### 4. Level up (optional)
- Add a `staff` role in `auth.sql`, make `anon` read-only in `api.sql`, and gate
  writes behind a JWT (`PGRST_JWT_SECRET`) — this is how the real services do it.
- Add a `staging/` overlay under `k8s/` that patches replicas/image tags.
```
