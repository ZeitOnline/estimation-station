// =============================================================================
// auth.js — OIDC token verification + the "who may join" allow-rule.
// =============================================================================
// Two independent pieces:
//   1. verify()    — cryptographically checks the JWT against the Keycloak JWKS
//                    (signature, expiry, issuer, optional audience). This is the
//                    security boundary: the browser can't fake a valid token.
//   2. authorize() — a PURE decision on the *verified* claims: is this user
//                    allowed in? By email domain and/or a group/role claim.
//
// Enabled only when AUTH_MODE=oidc (see server.js). Everything is env-driven so
// no secrets live in code.
// =============================================================================

import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Pure allow-rule. Given verified token claims and the configured policy,
 * decide whether the user may join. If no policy is configured, any validly
 * authenticated user is allowed (authentication-only).
 *
 * @param {object} claims  verified JWT payload
 * @param {{allowedDomains?: string[], allowedGroup?: string}} policy
 * @returns {{ok: boolean, reason?: string}}
 */
export function authorize(claims, policy = {}) {
	const { allowedDomains = [], allowedGroup } = policy;

	// No policy → authenticated is enough.
	if (allowedDomains.length === 0 && !allowedGroup) {
		return { ok: true };
	}

	if (allowedDomains.length > 0) {
		const email = String(claims.email || '').toLowerCase();
		const domain = email.split('@')[1];
		if (domain && allowedDomains.includes(domain)) return { ok: true };
	}

	if (allowedGroup) {
		// Keycloak may expose group membership as `groups` or roles under
		// `realm_access.roles` / `resource_access.<client>.roles`.
		const groups = [
			...(Array.isArray(claims.groups) ? claims.groups : []),
			...(claims.realm_access?.roles ?? []),
			...Object.values(claims.resource_access ?? {}).flatMap((r) => r?.roles ?? [])
		].map((g) => String(g).replace(/^\//, '')); // strip Keycloak's leading slash
		if (groups.includes(allowedGroup)) return { ok: true };
	}

	return { ok: false, reason: 'not in the allowed group or email domain' };
}

/** Pick a stable, human display name from the token claims. */
export function identityFromClaims(claims) {
	return {
		userId: claims.sub,
		name: claims.name || claims.preferred_username || claims.email || 'Anonym'
	};
}

/**
 * Build a token verifier bound to one issuer's JWKS. The remote key set is
 * fetched once and cached/rotated by jose.
 *
 * @param {{issuer: string, jwksUrl?: string, audience?: string}} cfg
 * @returns {(token: string) => Promise<object>} resolves to verified claims
 */
export function makeVerifier({ issuer, jwksUrl, audience }) {
	const url = jwksUrl || `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`;
	const JWKS = createRemoteJWKSet(new URL(url));
	return async function verify(token) {
		const { payload } = await jwtVerify(token, JWKS, {
			issuer,
			...(audience ? { audience } : {})
		});
		return payload;
	};
}
