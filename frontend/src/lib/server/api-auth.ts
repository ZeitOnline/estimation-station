// =============================================================================
// api-auth.ts — request guard for the Jira API routes.
//
// Same env-driven switches as ws-server.ts: AUTH_MODE=oidc verifies Bearer
// tokens against the poker auth policy, anything else trusts the caller
// (local dev only — production fails closed). Throws SvelteKit errors, so
// route handlers just `await requireApiUser(request)`.
// =============================================================================

import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { type AuthPolicy, authorize, makeVerifier } from '$lib/server/poker/auth';

// `$env/dynamic/private` (not raw process.env): it also picks up frontend/.env
// in dev, where Vite does not populate process.env.

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

export async function requireApiUser(request: Request): Promise<void> {
	const verify = buildVerifier();
	// Fail closed: these routes talk to Jira with a privileged server-side
	// token, so a production build must never run them unauthenticated. Only
	// a dev build may skip verification (AUTH_MODE=off for local work).
	if (!verify && !dev) {
		error(503, 'auth is not configured (set AUTH_MODE=oidc) — refusing Jira access');
	}
	if (!verify) return;

	const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!token) error(401, 'authentication required');
	const claims = await verify(token).catch((err: unknown) =>
		error(401, `invalid token: ${err instanceof Error ? err.message : String(err)}`)
	);
	const decision = authorize(claims, buildPolicy());
	if (!decision.ok) error(403, `access denied: ${decision.reason}`);
}
