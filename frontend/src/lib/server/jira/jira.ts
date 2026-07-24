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

function headers(cfg: JiraConfig): Record<string, string> {
	return {
		authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`,
		'content-type': 'application/json',
		accept: 'application/json'
	};
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
		headers: headers(cfg),
		body: JSON.stringify({ fields: { [cfg.storyPointsField]: points } })
	});
	if (res.ok) return;
	throw new JiraError(await errorMessage(res), res.status);
}

/**
 * Move an issue to the workflow status named `statusName` (e.g. "Refined").
 *
 * Status is not an editable field in Jira — it only changes through workflow
 * transitions, and which transitions exist depends on the issue's *current*
 * status. So: list the transitions available right now, pick the one landing
 * on the wanted status, execute it. Returns true if the issue was moved,
 * false if the workflow offers no transition to that status from here (also
 * the case when the issue is already there). Throws JiraError on HTTP errors.
 */
export async function transitionTo(
	cfg: JiraConfig,
	issueKey: string,
	statusName: string,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	const url = `${cfg.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
	const list = await fetchFn(url, { headers: headers(cfg) });
	if (!list.ok) throw new JiraError(await errorMessage(list), list.status);

	const body: { transitions?: Array<{ id: string; to?: { name?: string } }> } = await list.json();
	const wanted = statusName.trim().toLowerCase();
	const transition = (body.transitions ?? []).find(
		(t) => t.to?.name?.trim().toLowerCase() === wanted
	);
	if (!transition) return false;

	const res = await fetchFn(url, {
		method: 'POST',
		headers: headers(cfg),
		body: JSON.stringify({ transition: { id: transition.id } })
	});
	if (res.ok) return true;
	throw new JiraError(await errorMessage(res), res.status);
}

export interface IssuePreview {
	key: string;
	summary: string;
	description: string;
}

/**
 * Plain text from an Atlassian Document Format tree (Jira API v3 returns
 * descriptions as ADF, not strings). Marks, media and layout are dropped;
 * block nodes end in a newline so paragraphs and list items stay separated.
 */
export function adfToText(node: unknown): string {
	if (!node || typeof node !== 'object') return '';
	const n = node as { type?: string; text?: string; content?: unknown[] };
	if (n.type === 'text') return n.text ?? '';
	if (n.type === 'hardBreak') return '\n';
	const inner = (n.content ?? []).map(adfToText).join('');
	const isBlock = ['paragraph', 'heading', 'listItem', 'taskItem', 'tableRow'].includes(
		n.type ?? ''
	);
	return isBlock ? `${inner}\n` : inner;
}

/**
 * Fetch summary + description of one issue for the room preview. Some
 * projects keep their text in a custom field instead of `description`
 * (e.g. ENG's "Beschreibung ENG-Task"), so `descriptionFields` is the
 * ordered list of fields to try — the first non-empty one wins.
 */
export async function getIssuePreview(
	cfg: JiraConfig,
	issueKey: string,
	descriptionFields: string[] = ['description'],
	fetchFn: typeof fetch = fetch
): Promise<IssuePreview> {
	const fields = ['summary', ...descriptionFields].join(',');
	const res = await fetchFn(`${cfg.baseUrl}/rest/api/3/issue/${issueKey}?fields=${fields}`, {
		headers: headers(cfg)
	});
	if (!res.ok) throw new JiraError(await errorMessage(res), res.status);

	const body: { key?: string; fields?: Record<string, unknown> } = await res.json();
	const summary = typeof body.fields?.summary === 'string' ? body.fields.summary : '';
	let description = '';
	for (const field of descriptionFields) {
		const value = body.fields?.[field];
		description = (typeof value === 'string' ? value : adfToText(value))
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		if (description) break;
	}
	return { key: body.key ?? issueKey, summary, description };
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
