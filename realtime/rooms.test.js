import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, DEFAULT_DECK } from './rooms.js';

test('first joiner becomes moderator', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.join('r1', 'bob', 'Bob');
	const room = rooms.get('r1');
	assert.equal(room.moderatorId, 'alice');
	assert.equal(room.participants.get('alice').role, 'moderator');
	assert.equal(room.participants.get('bob').role, 'voter');
});

test('votes are hidden from others until revealed, but you see your own', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.join('r1', 'bob', 'Bob');
	rooms.vote('r1', 'alice', 5);
	rooms.vote('r1', 'bob', 8);

	const forBob = rooms.serialize(rooms.get('r1'), 'bob');
	const alice = forBob.participants.find((p) => p.userId === 'alice');
	const bob = forBob.participants.find((p) => p.userId === 'bob');

	assert.equal(alice.hasVoted, true);
	assert.equal(alice.vote, null, "should not see Alice's card before reveal");
	assert.equal(bob.vote, 8, 'should see own card');
});

test('reveal exposes all votes', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.join('r1', 'bob', 'Bob');
	rooms.vote('r1', 'alice', 5);
	rooms.vote('r1', 'bob', 8);
	rooms.reveal('r1', 'alice');

	const view = rooms.serialize(rooms.get('r1'), 'bob');
	assert.equal(view.revealed, true);
	assert.equal(view.participants.find((p) => p.userId === 'alice').vote, 5);
});

test('only the moderator can reveal or reset', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.join('r1', 'bob', 'Bob');
	rooms.vote('r1', 'alice', 5);

	rooms.reveal('r1', 'bob'); // bob is not moderator
	assert.equal(rooms.get('r1').revealed, false);

	rooms.reveal('r1', 'alice');
	assert.equal(rooms.get('r1').revealed, true);
});

test('reset clears votes and hides again', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.vote('r1', 'alice', 13);
	rooms.reveal('r1', 'alice');
	rooms.reset('r1', 'alice');
	const room = rooms.get('r1');
	assert.equal(room.revealed, false);
	assert.equal(room.participants.get('alice').vote, null);
});

test('cards outside the deck are ignored', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.vote('r1', 'alice', 7); // 7 is not a Fibonacci card
	assert.equal(rooms.get('r1').participants.get('alice').vote, null);
	assert.ok(DEFAULT_DECK.includes(8));
});

test('moderator hands off when they disconnect', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.join('r1', 'bob', 'Bob');
	rooms.disconnect('r1', 'alice');
	assert.equal(rooms.get('r1').moderatorId, 'bob');
	assert.equal(rooms.get('r1').participants.get('bob').role, 'moderator');
});

test('reconnect keeps identity and vote', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.vote('r1', 'alice', 21);
	rooms.disconnect('r1', 'alice');
	rooms.join('r1', 'alice', 'Alice'); // reconnect
	const p = rooms.get('r1').participants.get('alice');
	assert.equal(p.connected, true);
	assert.equal(p.vote, 21);
});

test('sweep removes empty rooms past TTL', () => {
	const rooms = new Rooms();
	rooms.join('r1', 'alice', 'Alice');
	rooms.disconnect('r1', 'alice');
	const room = rooms.get('r1');
	room.lastActivity = 0; // pretend it's old
	rooms.sweep(Date.now(), 1000);
	assert.equal(rooms.get('r1'), null);
});
