// =============================================================================
// server.js — WebSocket wiring around the pure room logic in rooms.js.
//
// Protocol (all JSON):
//   client -> server:
//     { type: 'join',      roomId, userId, name }   (must be first message)
//     { type: 'vote',      card }
//     { type: 'reveal' }                             (moderator only)
//     { type: 'reset' }                              (moderator only)
//     { type: 'setTicket', title }                   (moderator only)
//   server -> client:
//     { type: 'state', room }                        (full room, per-recipient)
//     { type: 'error', message }
//
// State is in-memory and per-instance (see docs/estimation-poker-plan.md §7).
// Phase 2 will add OIDC token verification at the `join` step.
// =============================================================================

import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.js';
import { authorize, identityFromClaims, makeVerifier } from './auth.js';

const PORT = Number(process.env.PORT || 8080);
const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 60_000;

// --- Auth config (all env-driven; off by default so local dev just works) ---
// AUTH_MODE=oidc turns on real token verification; anything else = trust client.
const AUTH_MODE = process.env.AUTH_MODE || 'off';
const policy = {
	allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '')
		.split(',')
		.map((d) => d.trim().toLowerCase())
		.filter(Boolean),
	allowedGroup: process.env.ALLOWED_GROUP || undefined
};
const verify =
	AUTH_MODE === 'oidc'
		? makeVerifier({
				issuer: process.env.OIDC_ISSUER || 'https://openid.zeit.de/realms/zeit-online',
				jwksUrl: process.env.OIDC_JWKS_URL,
				audience: process.env.OIDC_AUDIENCE
			})
		: null;

console.log(`auth mode: ${AUTH_MODE}`);

const rooms = new Rooms();
/** roomId -> Set<ws> of sockets currently in that room */
const connections = new Map();

const wss = new WebSocketServer({ port: PORT });
console.log(`realtime server listening on :${PORT}`);

function send(ws, obj) {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Broadcast room state to everyone in the room, serialized per-recipient so
// each person only sees the votes they're allowed to see.
function broadcast(roomId) {
	const room = rooms.get(roomId);
	const sockets = connections.get(roomId);
	if (!room || !sockets) return;
	for (const ws of sockets) {
		send(ws, { type: 'state', room: rooms.serialize(room, ws.userId) });
	}
}

wss.on('connection', (ws) => {
	ws.isAlive = true;
	ws.userId = null;
	ws.roomId = null;

	ws.on('pong', () => {
		ws.isAlive = true;
	});

	ws.on('message', async (raw) => {
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
					return send(ws, { type: 'error', message: `invalid token: ${err.message}` });
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
			connections.get(ws.roomId).add(ws);
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
	for (const ws of wss.clients) {
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

wss.on('close', () => {
	clearInterval(heartbeat);
	clearInterval(sweeper);
});
