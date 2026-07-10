// =============================================================================
// rooms.js — pure in-memory room/game logic (no sockets in here, so it's easy
// to unit-test). The WebSocket wiring lives in server.js and calls into this.
// =============================================================================

export const DEFAULT_DECK = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'];

// How long an empty room (nobody connected) lingers before being swept.
export const ROOM_TTL_MS = 1000 * 60 * 30; // 30 minutes

export class Rooms {
	constructor() {
		/** @type {Map<string, Room>} */
		this.rooms = new Map();
	}

	/**
	 * Join (or create) a room. First joiner of a fresh room becomes moderator.
	 * Re-joining with the same userId keeps your identity and vote (reconnect).
	 */
	join(roomId, userId, name) {
		let room = this.rooms.get(roomId);
		if (!room) {
			room = {
				id: roomId,
				moderatorId: userId,
				ticket: null,
				revealed: false,
				deck: DEFAULT_DECK,
				participants: new Map(),
				lastActivity: Date.now()
			};
			this.rooms.set(roomId, room);
		}

		const existing = room.participants.get(userId);
		if (existing) {
			existing.connected = true;
			if (name) existing.name = name;
		} else {
			room.participants.set(userId, {
				userId,
				name: name || 'Anonym',
				role: userId === room.moderatorId ? 'moderator' : 'voter',
				vote: null,
				connected: true
			});
		}
		room.lastActivity = Date.now();
		return room;
	}

	get(roomId) {
		return this.rooms.get(roomId) ?? null;
	}

	vote(roomId, userId, card) {
		const room = this.rooms.get(roomId);
		if (!room || room.revealed) return room ?? null;
		const p = room.participants.get(userId);
		if (!p) return room;
		// only accept a card that's actually in the deck
		if (!room.deck.some((c) => c === card)) return room;
		p.vote = card;
		room.lastActivity = Date.now();
		return room;
	}

	reveal(roomId, userId) {
		return this._moderatorAction(roomId, userId, (room) => {
			room.revealed = true;
		});
	}

	reset(roomId, userId) {
		return this._moderatorAction(roomId, userId, (room) => {
			room.revealed = false;
			for (const p of room.participants.values()) p.vote = null;
		});
	}

	setTicket(roomId, userId, title) {
		return this._moderatorAction(roomId, userId, (room) => {
			room.ticket = title || null;
		});
	}

	/** Mark a participant disconnected. Hand off moderator if they left. */
	disconnect(roomId, userId) {
		const room = this.rooms.get(roomId);
		if (!room) return null;
		const p = room.participants.get(userId);
		if (p) p.connected = false;
		room.lastActivity = Date.now();

		if (room.moderatorId === userId) {
			const next = [...room.participants.values()].find((x) => x.connected);
			if (next) {
				room.moderatorId = next.userId;
				next.role = 'moderator';
				if (p) p.role = 'voter';
			}
		}
		return room;
	}

	/** Remove rooms that have been empty (nobody connected) past the TTL. */
	sweep(now = Date.now(), ttl = ROOM_TTL_MS) {
		for (const [id, room] of this.rooms) {
			const anyoneConnected = [...room.participants.values()].some((p) => p.connected);
			if (!anyoneConnected && now - room.lastActivity > ttl) {
				this.rooms.delete(id);
			}
		}
	}

	/**
	 * Serialize a room for one recipient. Other people's votes are hidden until
	 * `revealed` — you only see that they *have* voted. You always see your own.
	 */
	serialize(room, forUserId) {
		return {
			id: room.id,
			moderatorId: room.moderatorId,
			ticket: room.ticket,
			revealed: room.revealed,
			deck: room.deck,
			youAreModerator: forUserId === room.moderatorId,
			participants: [...room.participants.values()].map((p) => ({
				userId: p.userId,
				name: p.name,
				role: p.role,
				connected: p.connected,
				hasVoted: p.vote !== null,
				vote: room.revealed || p.userId === forUserId ? p.vote : null
			}))
		};
	}

	_moderatorAction(roomId, userId, fn) {
		const room = this.rooms.get(roomId);
		if (!room || room.moderatorId !== userId) return room ?? null;
		fn(room);
		room.lastActivity = Date.now();
		return room;
	}
}

/**
 * @typedef {Object} Participant
 * @property {string} userId
 * @property {string} name
 * @property {'moderator'|'voter'|'observer'} role
 * @property {number|string|null} vote
 * @property {boolean} connected
 *
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} moderatorId
 * @property {string|null} ticket
 * @property {boolean} revealed
 * @property {(number|string)[]} deck
 * @property {Map<string, Participant>} participants
 * @property {number} lastActivity
 */
