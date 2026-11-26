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
export { issueBrowseUrl, normalizeTicket, parseIssueKey } from '../../jira-link';

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

export interface TransitionResult {
	/** True when the issue was actually moved to the wanted status. */
	moved: boolean;
	/** Status names the workflow offers from the issue's current status. */
	available: string[];
}

/**
 * Move an issue to the workflow status named `statusName` (e.g. "Refined").
 *
 * Status is not an editable field in Jira — it only changes through workflow
 * transitions, and which transitions exist depends on the issue's *current*
 * status. So: list the transitions available right now, pick the one landing
 * on the wanted status, execute it. `moved` is false when the workflow offers
 * no transition to that status from here; `available` then says what it does
 * offer, which is the only way to tell a misconfigured JIRA_REFINED_STATUS
 * from a workflow dead end. Throws JiraError on HTTP errors.
 */
export async function transitionTo(
	cfg: JiraConfig,
	issueKey: string,
	statusName: string,
	fetchFn: typeof fetch = fetch
): Promise<TransitionResult> {
	const url = `${cfg.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
	const list = await fetchFn(url, { headers: headers(cfg) });
	if (!list.ok) throw new JiraError(await errorMessage(list), list.status);

	const body: { transitions?: Array<{ id: string; to?: { name?: string } }> } = await list.json();
	const transitions = body.transitions ?? [];
	const available = transitions.map((t) => t.to?.name?.trim()).filter((n): n is string => !!n);
	const wanted = statusName.trim().toLowerCase();
	const transition = transitions.find((t) => t.to?.name?.trim().toLowerCase() === wanted);
	if (!transition) return { moved: false, available };

	const res = await fetchFn(url, {
		method: 'POST',
		headers: headers(cfg),
		body: JSON.stringify({ transition: { id: transition.id } })
	});
	if (res.ok) return { moved: true, available };
	throw new JiraError(await errorMessage(res), res.status);
}

export interface IssuePreview {
	key: string;
	summary: string;
	/** Workflow status name, e.g. "Waiting for Ref" (empty if Jira sent none). */
	status: string;
	/** Plain text of the description (empty when the ticket has none). */
	description: string;
	/** The same description as safe HTML, keeping headings, lists and links. */
	descriptionHtml: string;
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

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** An `<a>` for http(s) URLs only — anything else (javascript:, data:) is dropped to its label. */
function safeLink(url: unknown, labelHtml: string): string {
	if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return labelHtml;
	return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
}

const MARK_TAGS: Record<string, string> = {
	strong: 'strong',
	em: 'em',
	code: 'code',
	strike: 's',
	underline: 'u',
	subsup: 'sub'
};

// Block nodes that map 1:1 onto an element.
const BLOCK_TAGS: Record<string, string> = {
	paragraph: 'p',
	bulletList: 'ul',
	listItem: 'li',
	blockquote: 'blockquote',
	panel: 'blockquote',
	table: 'table',
	tableRow: 'tr',
	tableHeader: 'th',
	tableCell: 'td'
};

/**
 * HTML from an Atlassian Document Format tree, for the room's ticket preview.
 *
 * Safe to inject: the output is built from a fixed set of tags, every piece
 * of ticket text is escaped, and links are limited to http(s). Structure the
 * estimators need survives (headings, lists, checklists, links, inline code,
 * tables); media and unknown nodes are reduced to whatever text they contain.
 */
export function adfToHtml(node: unknown): string {
	if (!node || typeof node !== 'object') return '';
	const n = node as {
		type?: string;
		text?: string;
		content?: unknown[];
		attrs?: Record<string, unknown>;
		marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
	};
	const attrs = n.attrs ?? {};
	const inner = () => (n.content ?? []).map(adfToHtml).join('');

	switch (n.type) {
		case 'text': {
			let html = escapeHtml(n.text ?? '');
			for (const mark of n.marks ?? []) {
				const tag = MARK_TAGS[mark.type ?? ''];
				if (tag) html = `<${tag}>${html}</${tag}>`;
				else if (mark.type === 'link') html = safeLink(mark.attrs?.href, html);
			}
			return html;
		}
		case 'hardBreak':
			return '<br>';
		case 'rule':
			return '<hr>';
		case 'heading': {
			// The preview sits under the page's h1/h2 and its own title, so
			// ticket headings start at h3.
			const level = Math.min(6, Math.max(1, Number(attrs.level) || 1) + 2);
			return `<h${level}>${inner()}</h${level}>`;
		}
		case 'orderedList': {
			const start = Number(attrs.order);
			return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ''}>${inner()}</ol>`;
		}
		case 'taskList':
			return `<ul class="adf-tasks">${inner()}</ul>`;
		case 'taskItem': {
			const done = attrs.state === 'DONE';
			return `<li><input type="checkbox" disabled${done ? ' checked' : ''}> <span>${inner()}</span></li>`;
		}
		case 'codeBlock':
			return `<pre><code>${inner()}</code></pre>`;
		case 'inlineCard':
		case 'blockCard':
		case 'embedCard': {
			// A smart link carries only its URL; show the issue key for Jira
			// links, the bare URL otherwise.
			const url = typeof attrs.url === 'string' ? attrs.url : '';
			const label = escapeHtml(url.match(/\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)/)?.[1] ?? url);
			return n.type === 'inlineCard' ? safeLink(url, label) : `<p>${safeLink(url, label)}</p>`;
		}
		case 'emoji':
		case 'mention':
		case 'status':
			return escapeHtml(String(attrs.text ?? attrs.shortName ?? ''));
		case 'date': {
			const time = Number(attrs.timestamp);
			return Number.isFinite(time) ? escapeHtml(new Date(time).toISOString().slice(0, 10)) : '';
		}
		default: {
			const tag = BLOCK_TAGS[n.type ?? ''];
			return tag ? `<${tag}>${inner()}</${tag}>` : inner();
		}
	}
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
	const fields = ['summary', 'status', ...descriptionFields].join(',');
	const res = await fetchFn(`${cfg.baseUrl}/rest/api/3/issue/${issueKey}?fields=${fields}`, {
		headers: headers(cfg)
	});
	if (!res.ok) throw new JiraError(await errorMessage(res), res.status);

	const body: { key?: string; fields?: Record<string, unknown> } = await res.json();
	const summary = typeof body.fields?.summary === 'string' ? body.fields.summary : '';
	const statusName = (body.fields?.status as { name?: unknown } | undefined)?.name;
	const status = typeof statusName === 'string' ? statusName : '';
	let description = '';
	let descriptionHtml = '';
	for (const field of descriptionFields) {
		const value = body.fields?.[field];
		description = (typeof value === 'string' ? value : adfToText(value))
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		if (!description) continue;
		// Plain-string fields have no structure beyond their line breaks.
		descriptionHtml =
			typeof value === 'string'
				? `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>`
				: adfToHtml(value);
		break;
	}
	return { key: body.key ?? issueKey, summary, status, description, descriptionHtml };
}

export interface BacklogIssue {
	key: string;
	summary: string;
	/** Workflow status name, e.g. "Waiting for Ref" — the room filters on it. */
	status: string;
}

// Jira caps a search page at 100 issues once fields are requested.
const SEARCH_PAGE_SIZE = 100;

/**
 * The tickets a room steps through, in the order of `jql` (which should carry
 * its own ORDER BY — `Rank ASC` mirrors the board). Only key, summary and
 * status: the text of the ticket being shown comes from getIssuePreview.
 * Follows Jira's page tokens until the list is complete or `maxResults` long.
 */
export async function getBacklog(
	cfg: JiraConfig,
	jql: string,
	maxResults = 300,
	fetchFn: typeof fetch = fetch
): Promise<BacklogIssue[]> {
	const issues: BacklogIssue[] = [];
	let nextPageToken: string | undefined;
	do {
		const res = await fetchFn(`${cfg.baseUrl}/rest/api/3/search/jql`, {
			method: 'POST',
			headers: headers(cfg),
			body: JSON.stringify({
				jql,
				maxResults: Math.min(SEARCH_PAGE_SIZE, maxResults - issues.length),
				fields: ['summary', 'status'],
				...(nextPageToken ? { nextPageToken } : {})
			})
		});
		if (!res.ok) throw new JiraError(await errorMessage(res), res.status);

		const body: {
			issues?: Array<{
				key?: string;
				fields?: { summary?: unknown; status?: { name?: unknown } };
			}>;
			nextPageToken?: string;
		} = await res.json();
		for (const issue of body.issues ?? []) {
			if (!issue.key) continue;
			issues.push({
				key: issue.key,
				summary: typeof issue.fields?.summary === 'string' ? issue.fields.summary : '',
				status: typeof issue.fields?.status?.name === 'string' ? issue.fields.status.name : ''
			});
		}
		// An empty page with a token would loop forever — treat it as the end.
		nextPageToken = body.issues?.length ? body.nextPageToken : undefined;
	} while (nextPageToken && issues.length < maxResults);
	return issues.slice(0, maxResults);
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
