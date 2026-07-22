import { describe, it, expect } from 'vitest';
import { Rooms, DEFAULT_DECK } from './rooms';

describe('Rooms', () => {
	it('first joiner becomes moderator', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		const room = rooms.get('r1')!;
		expect(room.moderatorId).toBe('alice');
		expect(room.participants.get('alice')!.role).toBe('moderator');
		expect(room.participants.get('bob')!.role).toBe('voter');
	});

	it('votes are hidden from others until revealed, but you see your own', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		rooms.vote('r1', 'alice', 5);
		rooms.vote('r1', 'bob', 8);

		const forBob = rooms.serialize(rooms.get('r1')!, 'bob');
		const alice = forBob.participants.find((p) => p.userId === 'alice')!;
		const bob = forBob.participants.find((p) => p.userId === 'bob')!;

		expect(alice.hasVoted).toBe(true);
		expect(alice.vote).toBe(null); // should not see Alice's card before reveal
		expect(bob.vote).toBe(8); // should see own card
	});

	it('reveal exposes all votes', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		rooms.vote('r1', 'alice', 5);
		rooms.vote('r1', 'bob', 8);
		rooms.reveal('r1', 'alice');

		const view = rooms.serialize(rooms.get('r1')!, 'bob');
		expect(view.revealed).toBe(true);
		expect(view.participants.find((p) => p.userId === 'alice')!.vote).toBe(5);
	});

	it('only the moderator can reveal or reset', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		rooms.vote('r1', 'alice', 5);

		rooms.reveal('r1', 'bob'); // bob is not moderator
		expect(rooms.get('r1')!.revealed).toBe(false);

		rooms.reveal('r1', 'alice');
		expect(rooms.get('r1')!.revealed).toBe(true);
	});

	it('reset clears votes and hides again', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.vote('r1', 'alice', 13);
		rooms.reveal('r1', 'alice');
		rooms.reset('r1', 'alice');
		const room = rooms.get('r1')!;
		expect(room.revealed).toBe(false);
		expect(room.participants.get('alice')!.vote).toBe(null);
	});

	it('cards outside the deck are ignored', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.vote('r1', 'alice', 7); // 7 is not a Fibonacci card
		expect(rooms.get('r1')!.participants.get('alice')!.vote).toBe(null);
		expect(DEFAULT_DECK.includes(8)).toBe(true);
	});

	it('any participant can take over moderation', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		rooms.takeOver('r1', 'bob');
		const room = rooms.get('r1')!;
		expect(room.moderatorId).toBe('bob');
		expect(room.participants.get('bob')!.role).toBe('moderator');
		expect(room.participants.get('alice')!.role).toBe('voter');

		// and the new moderator can act
		rooms.reveal('r1', 'bob');
		expect(room.revealed).toBe(true);
	});

	it('take over by a non-participant is ignored', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.takeOver('r1', 'mallory');
		expect(rooms.get('r1')!.moderatorId).toBe('alice');
	});

	it('moderator hands off when they disconnect', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.join('r1', 'bob', 'Bob');
		rooms.disconnect('r1', 'alice');
		expect(rooms.get('r1')!.moderatorId).toBe('bob');
		expect(rooms.get('r1')!.participants.get('bob')!.role).toBe('moderator');
	});

	it('reconnect keeps identity and vote', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.vote('r1', 'alice', 13);
		rooms.disconnect('r1', 'alice');
		rooms.join('r1', 'alice', 'Alice'); // reconnect
		const p = rooms.get('r1')!.participants.get('alice')!;
		expect(p.connected).toBe(true);
		expect(p.vote).toBe(13);
	});

	it('sweep removes empty rooms past TTL', () => {
		const rooms = new Rooms();
		rooms.join('r1', 'alice', 'Alice');
		rooms.disconnect('r1', 'alice');
		rooms.get('r1')!.lastActivity = 0; // pretend it's old
		rooms.sweep(Date.now(), 1000);
		expect(rooms.get('r1')).toBe(null);
	});
});
