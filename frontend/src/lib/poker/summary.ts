import type { Card, Participant } from '#types';

export interface Summary {
	count: number; // how many numeric votes
	average: number | null;
	consensus: boolean; // everyone who voted picked the same card
	/** How many participants voted at all (numeric or `?`). */
	voted: number;
	/** The card picked most often; null without votes or when the top spot is tied. */
	majority: Card | null;
	/** Lowest / highest numeric vote; null without numeric votes. */
	lowest: number | null;
	highest: number | null;
}

// Compute the stats shown after a reveal. Pure function → easy to unit-test.
export function voteSummary(participants: Participant[]): Summary {
	const voted = participants.filter((p) => p.vote !== null);
	const numeric = voted.map((p) => p.vote).filter((v): v is number => typeof v === 'number');

	const count = numeric.length;
	const average = count ? numeric.reduce((a, b) => a + b, 0) / count : null;

	const tally = new Map<Card, number>();
	for (const p of voted) {
		const vote = p.vote as Card;
		tally.set(vote, (tally.get(vote) ?? 0) + 1);
	}
	const consensus = voted.length > 0 && tally.size === 1;

	// A majority needs a single card on top — two cards with the same number of
	// votes are a split, not a result.
	const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
	const majority = ranked.length > 0 && ranked[0][1] !== ranked[1]?.[1] ? ranked[0][0] : null;

	return {
		count,
		average,
		consensus,
		voted: voted.length,
		majority,
		lowest: count ? Math.min(...numeric) : null,
		highest: count ? Math.max(...numeric) : null
	};
}
