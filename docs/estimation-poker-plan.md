# Plan: "Hatjitsu-style" planning poker for daily ticket estimation

> **Status: Phase 0–2 built and verified.** Playable poker (Phase 0–1) + OIDC
> gate (Phase 2). Next: Phase 3 (persistence) / Phase 4 (deploy).
>
> ### Running it
> ```sh
> # one terminal — SvelteKit frontend on :5173 (realtime WebSocket included)
> cd frontend && npm install && npm run dev
> ```
> Open http://localhost:5173 in two tabs, create a room in one, join the same
> number in the other, vote, moderator reveals.
>
> The realtime WebSocket server now lives **inside** the SvelteKit app (it used
> to be a standalone `realtime/` service): the browser connects to the same
> origin on `/poker-ws`. See §3 for how it's wired.
>
> ### Auth modes (Phase 2)
> Auth defaults to **off** (no login) so local dev just works. Three modes via
> `VITE_AUTH_MODE` (see `frontend/.env.example`):
> - `off` — type a name (Phase 1).
> - `mock` — simulate a logged-in ZEIT user; demo the gated UX without real SSO.
> - `oidc` — real ZEIT SSO. Set `VITE_OIDC_CLIENT_ID` + start the frontend
>   server with `AUTH_MODE=oidc` (optionally `ALLOWED_EMAIL_DOMAINS=zeit.de` or
>   `ALLOWED_GROUP=planning-poker`). The WebSocket layer verifies the JWT against
>   Keycloak's JWKS and enforces the allow-rule before letting a socket join.
>
> **External dependency to actually log in:** a Keycloak client (e.g.
> `planning-poker`) must be registered on `openid.zeit.de/realms/zeit-online`
> with redirect URIs for `http://localhost:5173` (dev) + the deployed URL. Until
> then, use `mock` mode to see the flow.
>
> Verified: room + allow-rule unit tests (15, now vitest in `frontend/src/lib/
> server/poker/`), off-mode + oidc-mode WebSocket smoke tests (unauthenticated
> joins are rejected), `frontend` check/test/build.


A real-time planning-poker tool for the team to estimate tickets, gated behind
ZEIT SSO so only authorized people can join. Built on the stack this repo
already sets up (Postgres + PostgREST + SvelteKit + k8s/Tilt), reusing wally's
OIDC approach.

---

## 1. Scope (from the inspiration screenshots)

**Landing page**
- Enter a room number → **Join room**, or **Create new room**.
- First person to create the room is the **moderator**; they share the URL /
  room number with the team.

**Room page**
- A **deck** of cards (default: `0 1 2 3 5 8 13 ?` — a short Fibonacci scale).
- Each person picks a card = their estimate. Votes stay **hidden** ("You
  haven't estimated yet" / face-down cards for others).
- Moderator can **Reveal** (flip everyone's cards at once) and **Reset** (clear
  for the next ticket).
- Presence: see who is in the room and who has/hasn't voted.

That's the whole product surface. It is small and well-defined.

---

## 2. How complex is this? — **Low-to-moderate.**

Planning poker is a classic "small real-time app": little data, simple rules,
but it needs live sync and auth. Honest sizing for one developer already
comfortable with the stack:

| Piece | Difficulty | Notes |
|---|---|---|
| Room / vote / reveal / reset logic | **Easy** | Pure state machine, tiny payloads |
| Real-time sync (WebSocket, presence, reconnect) | **Moderate** | The main new muscle |
| OIDC login + gating the UI | **Easy** | `@zeitonline/svelte-oidc` does the heavy lifting |
| Restricting *who* can join (authorize, not just authenticate) | **Moderate** | Token verification + allow-rule on the socket server |
| Persistence / history (optional) | **Easy** | PostgREST + one table, reuse this repo's pattern |
| Deploy on k8s with WebSockets | **Moderate** | Needs ws upgrade through the gateway + single/sticky instance |

**Rough effort:** a usable MVP (create/join/vote/reveal/reset + SSO gate) is
**~3–5 focused days**. Fully polished + persisted history + deployed is
**~1.5–2 weeks**. The genuinely tricky bits are org dependencies (registering a
Keycloak client) and WebSockets-through-the-gateway, not the app logic.

---

## 3. Architecture (fits this repo)

```
  browser ──▶ frontend (SvelteKit, adapter-node)          UI + OIDC login
     │             │  ├── HTTP  ── SvelteKit routes
     │             │  └── WebSocket (/poker-ws) ─┐        live room state (in memory)
     │             │                             └── verifies the SSO token on connect
     │             └──▶ PostgREST :3000 ── Postgres       history/persistence (optional)
```

**Two services** (both already in the repo):

1. **`frontend/`** — the SvelteKit app. It serves:
   - `/` — create / join a room.
   - `/room/[id]` — the poker table.
   - the realtime **WebSocket** on `/poker-ws` (same origin, same port).
   Handles OIDC login and opens the WebSocket.

2. **`postgres` + `postgrest`** — *optional* persistence for estimation history
   (which ticket got what final estimate, when). MVP can skip this entirely.

> **Where the WebSocket runs.** It used to be a standalone `realtime/` Node
> service on :8080. It's now folded into the SvelteKit app: a
> `WebSocketServer({ noServer: true })` (`src/lib/server/poker/ws-server.ts`)
> whose HTTP `upgrade` is attached to Vite's server in dev/preview (a plugin in
> `vite.config.ts`) and to a custom Node entry (`src/server.ts` → `build/
> server.js`) in production. The pure room logic (`rooms.ts`) and OIDC
> verify/allow-rule (`auth.ts`) live next to it under `src/lib/server/poker/`.

> **Why WebSockets and not PostgREST?** PostgREST is request/response only — no
> push. The original Hatjitsu was a Node socket server for exactly this reason.
> In-memory state on a single instance is more than enough for a team; see §7
> for the scaling note.

**Transport choice:** plain [`ws`](https://github.com/websockets/ws) (tiny, no
magic) is recommended for learning; `socket.io` is the batteries-included
alternative (auto-reconnect, rooms, fallbacks) if you'd rather not hand-roll
those. Recommendation: **`ws`** — the reconnection logic is ~30 lines and you
learn what's happening.

---

## 4. Authentication & authorization (the "not everybody can join" part)

Reuse **exactly** what wally does.

**Provider (already known from wally):**
- Authority: `https://openid.zeit.de/realms/zeit-online` (Keycloak)
- Flow: authorization code + PKCE, scope `openid profile email`
- Per-app `client_id` — wally's is `"wally"`; **we register a new client**,
  e.g. `"planning-poker"`, with the ZEIT identity team (redirect URIs for
  local + deployed URLs). **This is an org dependency — start it early.**

**Frontend (copy wally's pattern, `Navigation.svelte` + `editor.js`):**
```svelte
import { oidc } from '@zeitonline/svelte-oidc';
onMount(() => oidc.manage({
  authority: 'https://openid.zeit.de/realms/zeit-online',
  client_id: 'planning-poker',
}));
// gate the whole app:
{#if oidc.loading} …loading…
{:else if !oidc.isAuthenticated} <button onclick={oidc.login}>Login</button>
{:else} <PokerApp /> {/if}
```

**Two layers of "who can join":**

1. **Authentication** — you must have a valid `zeit-online` Keycloak session.
   Being logged in already means you're a ZEIT user. `oidc.login()` handles it.

2. **Authorization** — to restrict to *the team* (not every ZEIT employee),
   check a claim on the token, verified server-side on the WebSocket server:
   - **Option A (simplest): email domain** — allow only `@zeit.de` (or a
     specific set). Good enough for "internal only".
   - **Option B (recommended): a Keycloak group/role** — ask identity to add a
     `planning-poker` client role or a group; check the `roles`/`groups` claim.
     This mirrors wally's `get_role()` in `api/auth.sql`.
   - **Option C: an allowlist table** in Postgres (emails), editable by a
     moderator. Most flexible, most work.

**Token verification on the socket server** (this is the security boundary — the
browser can't be trusted):
- On connect, the client sends `oidc.accessToken` (query param or first message).
- The server fetches Keycloak's JWKS once
  (`https://openid.zeit.de/realms/zeit-online/protocol/openid-connect/certs`,
  cached) and verifies the JWT signature, `exp`, and `aud` — using a lib like
  `jose`. This is the same trust model as PostgREST's `PGRST_JWT_SECRET`
  (which holds the same RSA public keys — see `k8s/base/postgrest`).
- Then apply the allow-rule (A/B/C). Reject the socket otherwise.
- Use `token.profile` (name/email) as the participant's display name.

**If you add persistence:** send `Authorization: Bearer <token>` to PostgREST and
reuse wally's `auth.sql` roles so only authorized users can write history.

---

## 5. Room model (in-memory on the realtime server)

```ts
type Card = number | '?';

interface Participant {
  userId: string;        // from token `sub`
  name: string;          // from token profile
  role: 'moderator' | 'voter' | 'observer';
  vote: Card | null;     // null = not voted yet
  connected: boolean;
}

interface Room {
  id: string;            // short room number, e.g. 5 digits
  moderatorId: string;
  deck: Card[];          // default Fibonacci
  ticket: string | null; // current ticket id/title (optional)
  revealed: boolean;
  participants: Map<string, Participant>;
  lastActivity: number;  // for TTL cleanup
}
```

- Rooms live in a `Map<roomId, Room>`; empty rooms are swept after a TTL.
- The server never exposes another player's `vote` value until `revealed` is
  true — hide it in the serialized state, just send `hasVoted: boolean`.

---

## 6. Realtime protocol (small + explicit)

Client → server messages:
- `join { roomId }` — (token already validated at connect)
- `vote { card }`
- `reveal` / `reset` — moderator only (server enforces)
- `setTicket { title }` — moderator only
- `changeDeck { deck }` — moderator only

Server → clients: a single `state` message = the full serialized room, broadcast
on every change. (Payloads are tiny; full-state broadcast avoids a whole class
of sync bugs.)

Cross-cutting: heartbeat ping/pong to detect drops; on disconnect mark
`connected=false` (keep the vote); moderator handoff if the moderator leaves.

---

## 7. Deployment

The realtime WebSocket is part of the SvelteKit app, so there's **no separate
realtime image/service** to deploy — it ships wherever the frontend ships. The
production server is the custom entry `build/server.js` (`npm start`), which
mounts adapter-node's handler and the WebSocket on one port.

- **Dockerfile / docker-compose / Tilt / k8s:** the old `realtime` target,
  service, workload, and Tilt resource have been removed. (The frontend itself
  has no production deploy target yet — it runs via `npm run dev`; adding a
  `frontend` Docker target + k8s manifest is a follow-up.)
- Two ws-specific points still apply, now to the **frontend** server:
  - The gateway/ingress must allow the **WebSocket upgrade** on `/poker-ws`
    (HTTPRoute is fine; just no buffering/early close). If the app is served
    under a base path (e.g. `/frontend`), the client connects to
    `<base>/poker-ws` — keep that path un-stripped through the gateway.
  - Run **a single replica** (in-memory state). If you ever need >1, add Redis
    pub/sub or Postgres `LISTEN/NOTIFY` to share state + sticky sessions. Note
    this as a deliberate MVP limit, don't build it up front.

---

## 8. Phased implementation plan

**Phase 0 — Skeleton (½ day)**
- `realtime/` Node service: ws server, accepts a connection, echoes.
- Frontend: `/room/[id]` route that opens a ws and logs messages.

**Phase 1 — Core poker, no auth yet (1–2 days)**
- Room create/join, participant list + presence.
- Deck rendering, voting, hidden votes, Reveal, Reset (moderator-gated).
- Full-state broadcast + reconnect. Landing page matching the screenshots.
- *Milestone: fully playable on localhost with fake names.*

**Phase 2 — OIDC gate (1 day)**
- Wire `@zeitonline/svelte-oidc` in the frontend (copy wally); gate the app.
- Register the Keycloak `client_id` (do this on day 1 — lead time).
- Verify the token on the ws server (`jose` + JWKS) and enforce the allow-rule
  (start with email domain, then group/role).
- *Milestone: only authorized ZEIT users can join.*

**Phase 3 — Persistence & polish (2–4 days, optional)**
- `history` table + PostgREST view; save each revealed round.
- History / stats view; deck presets; copy-link; keyboard shortcuts;
  moderator handoff; empty-room cleanup; consensus indicator.

**Phase 4 — Deploy (1–2 days)**
- Add a `frontend` Dockerfile target (build → `build/server.js`) + k8s manifest
  (single replica), ws-through-gateway on `/poker-ws`, logs. The realtime piece
  needs no service of its own — it's inside the frontend server.

---

## 9. Key decisions to confirm before building

1. **Persistence:** ephemeral-only (simplest) **or** persist estimation history?
   → *Recommend: ephemeral for MVP, add history in Phase 3.*
2. **Who may join:** email domain / Keycloak group / DB allowlist?
   → *Recommend: Keycloak group `planning-poker` (Option B).*
3. **Transport:** `ws` (learn it) vs `socket.io` (batteries included)?
   → *Recommend: `ws`.*
4. **Deck:** fixed Fibonacci vs moderator-selectable presets?
   → *Recommend: fixed for MVP.*

## 10. What this repo already gives us for free

- Postgres + PostgREST + migrations (history persistence, allowlist).
- SvelteKit frontend + `@zeitonline/design-system` (the UI shell).
- Multi-stage Dockerfile pattern, docker-compose, k8s base/overlay, Tiltfile —
  a `frontend` target can follow the existing `node` service as a template.
- wally's OIDC wrapper usage to copy verbatim.

The new real-time behaviour is a small WebSocket layer (~a few hundred lines)
folded into the SvelteKit app (`src/lib/server/poker/`). Everything else is
assembling patterns already in place.
