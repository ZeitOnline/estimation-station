// =============================================================================
// GET /api/jira/preview?issue=… — title + description of a ticket, so the
// room can show what is being estimated. `issue` is a browse link or a bare
// key. Same auth as the story-points write: the Jira token is server-side
// only, and ticket content is internal, so a production build requires the
// same Bearer token the WebSocket enforces.
//
// Projects whose text lives in a custom field instead of `description` are
// covered by JIRA_DESCRIPTION_FIELDS (comma-separated, first non-empty field
// wins — e.g. "customfield_11371,description").
// =============================================================================

import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireApiUser } from '$lib/server/api-auth';
import { getIssuePreview, JiraError, jiraConfig, parseIssueKey } from '$lib/server/jira/jira';
import type { RequestHandler } from './$types';

// Previews are teasers, not the full ticket — keep them scannable.
const MAX_DESCRIPTION = 500;

export const GET: RequestHandler = async ({ request, url }) => {
	await requireApiUser(request);

	const issueKey = parseIssueKey(url.searchParams.get('issue') ?? '');
	if (!issueKey) {
		error(400, 'issue must be a Jira link (…/browse/ENG-958) or an issue key');
	}

	const cfg = jiraConfig(env);
	if (!cfg) {
		error(503, 'Jira ist nicht konfiguriert (siehe docs/jira-story-points-plan.md).');
	}

	const descriptionFields = (env.JIRA_DESCRIPTION_FIELDS || 'description')
		.split(',')
		.map((f) => f.trim())
		.filter(Boolean);

	try {
		const preview = await getIssuePreview(cfg, issueKey, descriptionFields);
		const description =
			preview.description.length > MAX_DESCRIPTION
				? `${preview.description.slice(0, MAX_DESCRIPTION)}…`
				: preview.description;
		return json({ ok: true, key: preview.key, summary: preview.summary, description });
	} catch (err) {
		if (err instanceof JiraError) {
			error(err.status >= 400 && err.status < 500 ? err.status : 502, `Jira: ${err.message}`);
		}
		error(502, `Jira request failed: ${err instanceof Error ? err.message : String(err)}`);
	}
};
