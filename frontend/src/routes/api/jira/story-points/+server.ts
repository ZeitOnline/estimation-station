// =============================================================================
// POST /api/jira/story-points — write a story-point estimate to a Jira issue.
//
// Body: { issue: string, points: number } where `issue` is a browse link or a
// bare key. The Jira token lives server-side only (see lib/server/jira). In
// oidc mode the caller must present the same Bearer token / allow-rule the
// WebSocket enforces — the browser is never trusted with the write itself.
// =============================================================================

import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { JiraError, jiraConfig, parseIssueKey, setStoryPoints } from '$lib/server/jira/jira';
import { STORY_POINT_VALUES, isStoryPointValue } from '$lib/story-points';
import { authorize, makeVerifier, type AuthPolicy } from '$lib/server/poker/auth';

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
	if (verify) {
		const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
		if (!token) error(401, 'authentication required');
		let claims;
		try {
			claims = await verify(token);
		} catch (err) {
			error(401, `invalid token: ${err instanceof Error ? err.message : String(err)}`);
		}
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

	return json({ ok: true, issueKey, points });
};
