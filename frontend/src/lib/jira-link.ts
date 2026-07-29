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

/** Browse URL for an issue key on the given Jira base URL. */
export function issueBrowseUrl(baseUrl: string, key: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/browse/${key}`;
}

/**
 * Canonical form of whatever was typed into the ticket field, so a bare key and
 * a browse link end up as the same room ticket: a browse link when we recognise
 * an issue key and know the Jira base URL, the bare key when we don't, and the
 * trimmed text as-is for free-form titles. Empty input (field cleared) is null.
 */
export function normalizeTicket(input: string, baseUrl?: string | null): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const key = parseIssueKey(trimmed);
	if (!key) return trimmed;
	return baseUrl ? issueBrowseUrl(baseUrl, key) : key;
}
