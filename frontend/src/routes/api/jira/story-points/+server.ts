// =============================================================================
// POST /api/jira/story-points — write a story-point estimate to a Jira issue
// and move it to the "Refined" workflow status (JIRA_REFINED_STATUS to
// override the name).
//
// Body: { issue: string, points: number } where `issue` is a browse link or a
// bare key. The Jira token lives server-side only (see lib/server/jira). In
// oidc mode the caller must present the same Bearer token / allow-rule the
// WebSocket enforces — the browser is never trusted with the write itself.
// =============================================================================

import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	JiraError,
	jiraConfig,
	parseIssueKey,
	setStoryPoints,
	transitionTo
} from '$lib/server/jira/jira';
import { type AuthPolicy, authorize, makeVerifier } from '$lib/server/poker/auth';
import { isStoryPointValue, STORY_POINT_VALUES } from '$lib/story-points';
import type { RequestHandler } from './$types';

// `$env/dynamic/private` (not raw process.env): it also picks up frontend/.env
// in dev, where Vite does not populate process.env.

// Same env-driven auth switches as ws-server.ts: AUTH_MODE=oidc verifies
// tokens, anything else trusts the caller (local dev).
function buildVerifier() {
	if ((env.AUTH_MODE || 'off') !== 'oidc') return null;
	return makeVerifier({
		issuer: env.OIDC_ISSUER || 'https://openid.zeit.de/realms/zeit-online',
		jwksUrl: env.OIDC_JWKS_URL,
		audience: env.OIDC_AUDIENCE
	});
}

function buildPolicy(): AuthPolicy {
	return {
		allowedDomains: (env.ALLOWED_EMAIL_DOMAINS || '')
			.split(',')
			.map((d) => d.trim().toLowerCase())
			.filter(Boolean),
		allowedGroup: env.ALLOWED_GROUP || undefined
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const verify = buildVerifier();
	// Fail closed: this route writes to Jira with a privileged server-side
	// token, so a production build must never run it unauthenticated. Only a
	// dev build may skip verification (AUTH_MODE=off for local work).
	if (!verify && !dev) {
		error(503, 'auth is not configured (set AUTH_MODE=oidc) — refusing Jira writes');
	}
	if (verify) {
		const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
		if (!token) error(401, 'authentication required');
		const claims = await verify(token).catch((err: unknown) =>
			error(401, `invalid token: ${err instanceof Error ? err.message : String(err)}`)
		);
		const decision = authorize(claims, buildPolicy());
		if (!decision.ok) error(403, `access denied: ${decision.reason}`);
	}

	let body: { issue?: unknown; points?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400, 'invalid JSON body');
	}

	const issueKey = typeof body.issue === 'string' ? parseIssueKey(body.issue) : null;
	if (!issueKey) {
		error(400, 'issue must be a Jira link (…/browse/ENG-958) or an issue key');
	}
	const points = body.points;
	if (!isStoryPointValue(points)) {
		error(400, `points must be a Fibonacci value up to 13 (${STORY_POINT_VALUES.join(', ')})`);
	}

	const cfg = jiraConfig(env);
	if (!cfg) {
		error(
			503,
			'Jira ist nicht konfiguriert — JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN und ' +
				'JIRA_STORY_POINTS_FIELD setzen (siehe docs/jira-story-points-plan.md).'
		);
	}

	try {
		await setStoryPoints(cfg, issueKey, points);
	} catch (err) {
		if (err instanceof JiraError) {
			// Client-caused Jira errors (bad key, field not editable, bad token)
			// keep their status; everything else is a bad gateway from our side.
			error(err.status >= 400 && err.status < 500 ? err.status : 502, `Jira: ${err.message}`);
		}
		error(502, `Jira request failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Estimated tickets also move to "Refined". The points are saved at this
	// point, so a transition problem must not fail the request — the workflow
	// may simply not offer the transition from the ticket's current status
	// (or the ticket is already Refined). Report what happened instead.
	const refinedStatus = env.JIRA_REFINED_STATUS || 'Refined';
	let transitioned = false;
	let transitionError: string | undefined;
	try {
		transitioned = await transitionTo(cfg, issueKey, refinedStatus);
	} catch (err) {
		transitionError = err instanceof JiraError ? err.message : String(err);
	}

	return json({ ok: true, issueKey, points, transitioned, transitionError });
};
