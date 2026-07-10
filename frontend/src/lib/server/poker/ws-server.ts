// =============================================================================
// ws-server.ts — WebSocket wiring around the pure room logic in rooms.ts.
//
// This is the same protocol the old standalone `realtime/` service spoke, now
// living inside the SvelteKit app. It runs in two places:
//   • dev / preview — attached to Vite's HTTP server (see vite.config.ts)
//   • production    — attached to the custom Node entry (see src/server.ts)
// In both cases the WebSocketServer is created with `noServer: true` and driven
// by `onHttpServerUpgrade`, so it shares the app's single HTTP port.
//
// Protocol (all JSON):
//   client -> server:
//     { type: 'join',      roomId, userId, name, token }  (must be first message)
//     { type: 'vote',      card }
//     { type: 'reveal' }                                   (moderator only)
//     { type: 'reset' }                                    (moderator only)
//     { type: 'setTicket', title }                         (moderator only)
//   server -> client:
//     { type: 'state', room }                              (full room, per-recipient)
//     { type: 'error', message }
//
// State is in-memory and per-instance (see docs/estimation-poker-plan.md §7):
// run a single replica.
// =============================================================================

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Rooms } from './rooms';
import { authorize, identityFromClaims, makeVerifier, type AuthPolicy } from './auth';
import { WS_PATH } from '../../poker/ws-path';

const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 60_000;

// A socket carries the identity it established at `join`.
interface PokerSocket extends WebSocket {
	isAlive: boolean;
	userId: string | null;
	roomId: string | null;
}

// The WSS (plus its rooms + intervals) is stashed on globalThis so a Vite
// module reload during dev doesn't spin up a second server or leak intervals.
const WSS_KEY = Symbol.for('poker.wss');
interface PokerGlobal {
	wss: WebSocketServer;
	rooms: Rooms;
	connections: Map<string, Set<PokerSocket>>;
	heartbeat: ReturnType<typeof setInterval>;
	sweeper: ReturnType<typeof setInterval>;
}
const globalStore = globalThis as typeof globalThis & { [WSS_KEY]?: PokerGlobal };

// --- Auth config (all env-driven; off by default so local dev just works) ---
// AUTH_MODE=oidc turns on real token verification; anything else = trust client.
function buildVerifier(): ((token: string) => Promise<Record<string, unknown>>) | null {
	const authMode = process.env.AUTH_MODE || 'off';
	if (authMode !== 'oidc') return null;
	return makeVerifier({
		issuer: process.env.OIDC_ISSUER || 'https://openid.zeit.de/realms/zeit-online',
		jwksUrl: process.env.OIDC_JWKS_URL,
		audience: process.env.OIDC_AUDIENCE
	});
}

function buildPolicy(): AuthPolicy {
	return {
		allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '')
			.split(',')
			.map((d) => d.trim().toLowerCase())
			.filter(Boolean),
		allowedGroup: process.env.ALLOWED_GROUP || undefined
	};
}

/**
 * Create the (single) WebSocketServer and wire up all connection handling,
 * heartbeat, and room-sweeping. Idempotent: repeated calls return the same
 * instance, so the Vite dev plugin and hooks/prod entry can both call it.
 */
export function createWSSGlobalInstance(): WebSocketServer {
	if (globalStore[WSS_KEY]) return globalStore[WSS_KEY].wss;

	const wss = new WebSocketServer({ noServer: true });
	const rooms = new Rooms();
	/** roomId -> Set<ws> of sockets currently in that room */
	const connections = new Map<string, Set<PokerSocket>>();

	const verify = buildVerifier();
	const policy = buildPolicy();
	console.log(
		`[poker] realtime WebSocket ready on ${WS_PATH} (auth mode: ${verify ? 'oidc' : 'off'})`
	);

	function send(ws: WebSocket, obj: unknown) {
		if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
	}

	// Broadcast room state to everyone in the room, serialized per-recipient so
	// each person only sees the votes they're allowed to see.
	function broadcast(roomId: string) {
		const room = rooms.get(roomId);
		const sockets = connections.get(roomId);
		if (!room || !sockets) return;
		for (const ws of sockets) {
			send(ws, { type: 'state', room: rooms.serialize(room, ws.userId ?? '') });
		}
	}

	wss.on('connection', (socket: WebSocket) => {
		const ws = socket as PokerSocket;
		ws.isAlive = true;
		ws.userId = null;
		ws.roomId = null;

		ws.on('pong', () => {
			ws.isAlive = true;
		});

		ws.on('message', async (raw: RawData) => {
			let msg;
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				return send(ws, { type: 'error', message: 'invalid JSON' });
			}

			// The very first message must establish who and where.
			if (msg.type === 'join') {
				if (!msg.roomId) {
					return send(ws, { type: 'error', message: 'join requires roomId' });
				}

				// Identity: from a verified token (oidc mode) or trusted client (off).
				let userId = msg.userId;
				let name = msg.name;
				if (verify) {
					if (!msg.token) {
						return send(ws, { type: 'error', message: 'authentication required' });
					}
					let claims;
					try {
						claims = await verify(msg.token);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						return send(ws, { type: 'error', message: `invalid token: ${message}` });
					}
					const decision = authorize(claims, policy);
					if (!decision.ok) {
						return send(ws, { type: 'error', message: `access denied: ${decision.reason}` });
					}
					({ userId, name } = identityFromClaims(claims));
				}
				if (!userId) {
					return send(ws, { type: 'error', message: 'join requires userId' });
				}

				ws.userId = String(userId);
				ws.roomId = String(msg.roomId);
				if (!connections.has(ws.roomId)) connections.set(ws.roomId, new Set());
				connections.get(ws.roomId)!.add(ws);
				rooms.join(ws.roomId, ws.userId, name);
				return broadcast(ws.roomId);
			}

			if (!ws.roomId || !ws.userId) {
				return send(ws, { type: 'error', message: 'send join first' });
			}

			switch (msg.type) {
				case 'vote':
					rooms.vote(ws.roomId, ws.userId, msg.card);
					break;
				case 'reveal':
					rooms.reveal(ws.roomId, ws.userId);
					break;
				case 'reset':
					rooms.reset(ws.roomId, ws.userId);
					break;
				case 'setTicket':
					rooms.setTicket(ws.roomId, ws.userId, msg.title);
					break;
				default:
					return send(ws, { type: 'error', message: `unknown type: ${msg.type}` });
			}
			broadcast(ws.roomId);
		});

		ws.on('close', () => {
			if (ws.roomId && ws.userId) {
				rooms.disconnect(ws.roomId, ws.userId);
				connections.get(ws.roomId)?.delete(ws);
				broadcast(ws.roomId);
			}
		});
	});

	// Heartbeat: drop sockets that stopped answering pings.
	const heartbeat = setInterval(() => {
		for (const client of wss.clients) {
			const ws = client as PokerSocket;
			if (!ws.isAlive) {
				ws.terminate();
				continue;
			}
			ws.isAlive = false;
			ws.ping();
		}
	}, HEARTBEAT_MS);

	// Periodically sweep empty rooms.
	const sweeper = setInterval(() => rooms.sweep(), SWEEP_MS);

	// These intervals should never keep the process alive on their own — the
	// HTTP server does that. Un-referencing them also lets test/dev tooling
	// exit cleanly.
	heartbeat.unref?.();
	sweeper.unref?.();

	wss.on('close', () => {
		clearInterval(heartbeat);
		clearInterval(sweeper);
	});

	globalStore[WSS_KEY] = { wss, rooms, connections, heartbeat, sweeper };
	return wss;
}

/**
 * HTTP `upgrade` handler. Only claims WebSocket upgrades for our own path so
 * Vite's HMR socket (and anything else) keeps working — for any other path we
 * return without touching the socket and let other listeners handle it.
 *
 * We match on `endsWith(WS_PATH)` rather than an exact compare so it works both
 * at the root (`/poker-ws`, dev) and under a base path (`/frontend/poker-ws`,
 * production) — the client connects to `${base}${WS_PATH}` (see room.svelte.ts).
 */
export function onHttpServerUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
	const pathname = new URL(req.url ?? '', 'http://localhost').pathname;
	if (pathname !== WS_PATH && !pathname.endsWith(WS_PATH)) return;

	const wss = createWSSGlobalInstance();
	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit('connection', ws, req);
	});
}
