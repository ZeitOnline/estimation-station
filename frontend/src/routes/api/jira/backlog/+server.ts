// =============================================================================
// GET /api/jira/backlog — the tickets up for estimation, in board order, so a
// room can start on the first one and the moderator can step through the rest.
//
// Which tickets that is, is a JQL query in JIRA_BACKLOG_JQL (e.g.
// `project = ENG AND status in ("Waiting for Ref", Backlog) AND issuetype != Epic
// ORDER BY Rank ASC`). Every ticket comes with its status: the room offers one
// checkbox per status and searches across all of them.
// JIRA_BACKLOG_DEFAULT_STATUSES (comma-separated) names the statuses ticked to
// begin with; unset means all of them.
// Without the JQL the feature is simply off: the list is empty and the room
// behaves as before (ticket typed in by hand). Same auth as the other Jira
// routes.
// =============================================================================

import { error } from '@sveltejs/kit';
import { requireApiUser } from '#lib/server/api-auth.js';
import { getBacklog, JiraError, jiraConfig } from '#lib/server/jira/jira.js';
import {
	JIRA_API_TOKEN,
	JIRA_BACKLOG_DEFAULT_STATUSES,
	JIRA_BACKLOG_JQL,
	JIRA_BASE_URL,
	JIRA_EMAIL,
	JIRA_STORY_POINTS_FIELD
} from '$app/env/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	await requireApiUser(request);

	const cfg = jiraConfig({
		JIRA_BASE_URL,
		JIRA_EMAIL,
		JIRA_API_TOKEN,
		JIRA_STORY_POINTS_FIELD
	});
	if (!cfg) {
		error(503, 'Jira ist nicht konfiguriert (siehe docs/jira-story-points-plan.md).');
	}

	const jql = JIRA_BACKLOG_JQL.trim();
	const defaultStatuses = JIRA_BACKLOG_DEFAULT_STATUSES.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (!jql) return Response.json({ ok: true, issues: [], defaultStatuses });

	try {
		return Response.json({ ok: true, issues: await getBacklog(cfg, jql), defaultStatuses });
	} catch (err) {
		if (err instanceof JiraError) {
			error(err.status >= 400 && err.status < 500 ? err.status : 502, `Jira: ${err.message}`);
		}
		error(502, `Jira request failed: ${err instanceof Error ? err.message : String(err)}`);
	}
};
