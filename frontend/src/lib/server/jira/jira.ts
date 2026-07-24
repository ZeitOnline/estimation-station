// =============================================================================
// jira.ts — minimal Jira Cloud client: write story points to an issue.
//
// Server-only (holds the API token). Config is env-driven like the poker auth
// (non-VITE_ vars, see frontend/.env). The story-points field is a per-instance
// custom field, so its id (`customfield_XXXXX`) comes from env too — see
// docs/jira-story-points-plan.md §0 for how to look it up.
// =============================================================================

export interface JiraConfig {
	baseUrl: string;
	email: string;
	apiToken: string;
	storyPointsField: string;
}

/** Read the Jira config from env; null (= integration disabled) if incomplete. */
export function jiraConfig(
	env: Record<string, string | undefined> = process.env
): JiraConfig | null {
	const baseUrl = env.JIRA_BASE_URL;
	const email = env.JIRA_EMAIL;
	const apiToken = env.JIRA_API_TOKEN;
	const storyPointsField = env.JIRA_STORY_POINTS_FIELD;
	if (!baseUrl || !email || !apiToken || !storyPointsField) return null;
	return { baseUrl: baseUrl.replace(/\/+$/, ''), email, apiToken, storyPointsField };
}

// Key parsing lives in the client-safe shared module; re-exported here so the
// server side keeps one import for everything Jira.
export { parseIssueKey } from '../../jira-link';

/** A non-2xx answer from Jira, with the HTTP status and a readable message. */
export class JiraError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'JiraError';
		this.status = status;
	}
}

/**
 * Set the story points of one issue. Resolves on success, throws JiraError
 * with Jira's own explanation otherwise (wrong key → 404, unknown field or
 * field not on the edit screen → 400, bad token → 401).
 */
export async function setStoryPoints(
	cfg: JiraConfig,
	issueKey: string,
	points: number,
	fetchFn: typeof fetch = fetch
): Promise<void> {
	const res = await fetchFn(`${cfg.baseUrl}/rest/api/3/issue/${issueKey}`, {
		method: 'PUT',
		headers: {
			authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`,
			'content-type': 'application/json',
			accept: 'application/json'
		},
		body: JSON.stringify({ fields: { [cfg.storyPointsField]: points } })
	});
	if (res.ok) return;
	throw new JiraError(await errorMessage(res), res.status);
}

// Jira error bodies look like { errorMessages: [...], errors: { field: msg } }.
async function errorMessage(res: Response): Promise<string> {
	let detail = '';
	try {
		const body = await res.json();
		detail = [
			...(Array.isArray(body.errorMessages) ? body.errorMessages : []),
			...Object.entries(body.errors ?? {}).map(([field, msg]) => `${field}: ${msg}`)
		].join('; ');
	} catch {
		// non-JSON body (e.g. HTML from a proxy) — fall through
	}
	return detail || `Jira responded with ${res.status}`;
}
