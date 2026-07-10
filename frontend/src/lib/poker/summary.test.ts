import { describe, it, expect } from 'vitest';
import { voteSummary } from './summary';
import type { Participant } from '$types';

const p = (userId: string, vote: Participant['vote']): Participant => ({
	userId,
	name: userId,
	role: 'voter',
	connected: true,
	hasVoted: vote !== null,
	vote
});

describe('voteSummary', () => {
	it('averages the numeric votes', () => {
		const s = voteSummary([p('a', 3), p('b', 5), p('c', 13)]);
		expect(s.count).toBe(3);
		expect(s.average).toBe(7);
		expect(s.consensus).toBe(false);
	});

	it('detects consensus', () => {
		const s = voteSummary([p('a', 8), p('b', 8)]);
		expect(s.consensus).toBe(true);
	});

	it('ignores non-numeric cards in the average', () => {
		const s = voteSummary([p('a', 5), p('b', '?')]);
		expect(s.count).toBe(1);
		expect(s.average).toBe(5);
	});

	it('handles nobody having voted', () => {
		const s = voteSummary([p('a', null), p('b', null)]);
		expect(s.count).toBe(0);
		expect(s.average).toBe(null);
		expect(s.consensus).toBe(false);
	});
});
