// Jira issue-key parsing. Client-safe (no secrets) — used by the room page to
// linkify the current ticket and by the server module to address the API call.

const ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Extract an issue key from a browse link (`https://…/browse/ENG-958`) or a
 * bare key (`ENG-958`, case-insensitive). Null if it's neither.
 */
export function parseIssueKey(input: string): string | null {
	const trimmed = input.trim();
	if (ISSUE_KEY.test(trimmed.toUpperCase())) return trimmed.toUpperCase();
	try {
		const url = new URL(trimmed);
		const match = url.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)(?:\/|$)/);
		return match ? match[1].toUpperCase() : null;
	} catch {
		return null;
	}
}
