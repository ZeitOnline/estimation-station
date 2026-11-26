import { describe, expect, it } from 'vitest';
import type { Participant } from '#types';
import { voteSummary } from './summary';

const p = (userId: string, vote: Participant['vote']): Participant => ({
	userId,
	name: userId,
	role: 'voter',
	connected: true,
	hasVoted: vote !== null,
	vote,
	avatar: null
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

	it('names the majority card and the range', () => {
		const s = voteSummary([p('a', 5), p('b', 5), p('c', 3), p('d', 8), p('e', null)]);
		expect(s.voted).toBe(4);
		expect(s.majority).toBe(5);
		expect(s.lowest).toBe(3);
		expect(s.highest).toBe(8);
	});

	it('has no majority when the top spot is tied', () => {
		const s = voteSummary([p('a', 3), p('b', 3), p('c', 8), p('d', 8)]);
		expect(s.majority).toBe(null);
	});

	it('counts "?" as a vote, but not in the range', () => {
		const s = voteSummary([p('a', '?'), p('b', '?'), p('c', 2)]);
		expect(s.voted).toBe(3);
		expect(s.majority).toBe('?');
		expect(s.lowest).toBe(2);
		expect(s.highest).toBe(2);
	});

	it('handles nobody having voted', () => {
		const s = voteSummary([p('a', null), p('b', null)]);
		expect(s.count).toBe(0);
		expect(s.average).toBe(null);
		expect(s.consensus).toBe(false);
		expect(s.voted).toBe(0);
		expect(s.majority).toBe(null);
		expect(s.lowest).toBe(null);
		expect(s.highest).toBe(null);
	});
});
