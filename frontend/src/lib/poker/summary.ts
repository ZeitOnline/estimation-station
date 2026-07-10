import type { Participant } from '$types';

export interface Summary {
	count: number; // how many numeric votes
	average: number | null;
	consensus: boolean; // everyone who voted picked the same card
}

// Compute the stats shown after a reveal. Pure function → easy to unit-test.
export function voteSummary(participants: Participant[]): Summary {
	const voted = participants.filter((p) => p.vote !== null);
	const numeric = voted
		.map((p) => p.vote)
		.filter((v): v is number => typeof v === 'number');

	const count = numeric.length;
	const average = count ? numeric.reduce((a, b) => a + b, 0) / count : null;

	const distinct = new Set(voted.map((p) => String(p.vote)));
	const consensus = voted.length > 0 && distinct.size === 1;

	return { count, average, consensus };
}
