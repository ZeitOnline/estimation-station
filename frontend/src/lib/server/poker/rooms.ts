// =============================================================================
// rooms.ts — pure in-memory room/game logic (no sockets in here, so it's easy
// to unit-test). The WebSocket wiring lives in ws-server.ts and calls into this.
//
// Ported from the standalone `realtime/` service. The serialized shape returned
// by `serialize()` matches `RoomState` in $types; the internal Room/Participant
// below keep the raw fields (vote/connected) the server needs.
// =============================================================================

import type { Card, RoomState } from '../../../types';

export const DEFAULT_DECK: Card[] = [0, 1, 2, 3, 5, 8, 13, '?'];

// How long an empty room (nobody connected) lingers before being swept.
export const ROOM_TTL_MS = 1000 * 60 * 30; // 30 minutes

export interface Participant {
	userId: string;
	name: string;
	role: 'moderator' | 'voter' | 'observer';
	vote: Card | null;
	connected: boolean;
}

export interface Room {
	id: string;
	moderatorId: string;
	ticket: string | null;
	revealed: boolean;
	deck: Card[];
	participants: Map<string, Participant>;
	lastActivity: number;
}

export class Rooms {
	private rooms = new Map<string, Room>();

	/**
	 * Join (or create) a room. First joiner of a fresh room becomes moderator.
	 * Re-joining with the same userId keeps your identity and vote (reconnect).
	 */
	join(roomId: string, userId: string, name?: string): Room {
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

	get(roomId: string): Room | null {
		return this.rooms.get(roomId) ?? null;
	}

	vote(roomId: string, userId: string, card: Card): Room | null {
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

	reveal(roomId: string, userId: string): Room | null {
		return this.moderatorAction(roomId, userId, (room) => {
			room.revealed = true;
		});
	}

	reset(roomId: string, userId: string): Room | null {
		return this.moderatorAction(roomId, userId, (room) => {
			room.revealed = false;
			for (const p of room.participants.values()) p.vote = null;
		});
	}

	setTicket(roomId: string, userId: string, title: string): Room | null {
		return this.moderatorAction(roomId, userId, (room) => {
			room.ticket = title || null;
		});
	}

	/** Mark a participant disconnected. Hand off moderator if they left. */
	disconnect(roomId: string, userId: string): Room | null {
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
	sweep(now = Date.now(), ttl = ROOM_TTL_MS): void {
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
	serialize(room: Room, forUserId: string): RoomState {
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

	private moderatorAction(roomId: string, userId: string, fn: (room: Room) => void): Room | null {
		const room = this.rooms.get(roomId);
		if (!room || room.moderatorId !== userId) return room ?? null;
		fn(room);
		room.lastActivity = Date.now();
		return room;
	}
}
