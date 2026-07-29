// Story-point values we accept for Jira: Fibonacci 1–8, the same cards the
// poker deck offers (rooms.ts DEFAULT_DECK). Client-safe — used by the room
// form (select options) and the API route (validation).

export const STORY_POINT_VALUES = [1, 2, 3, 5, 8] as const;

/** True if `value` is one of the allowed Fibonacci story points. */
export function isStoryPointValue(value: unknown): value is number {
	return typeof value === 'number' && (STORY_POINT_VALUES as readonly number[]).includes(value);
}

/** Snap an arbitrary number (e.g. a round average) to the nearest allowed value. */
export function nearestStoryPointValue(value: number): number {
	let best: number = STORY_POINT_VALUES[0];
	for (const p of STORY_POINT_VALUES) {
		if (Math.abs(p - value) < Math.abs(best - value)) best = p;
	}
	return best;
}
