// =============================================================================
// auth-fetch.ts — fetch our own API with the OIDC access token attached.
//
// Keycloak access tokens live for minutes while a planning session runs for an
// hour, so the token in hand may already be stale when the moderator finally
// saves the points. A 401 therefore triggers one silent renew and a single
// retry before giving up — the same pattern as wally's editor
// (frontend/src/lib/utils/editor.js there).
// =============================================================================

import { oidc } from '@zeitonline/svelte-oidc';
import { AUTH_MOCK, getToken } from '$lib/poker/identity';

/** Renewal failed — the user has to log in again. */
export class SessionExpiredError extends Error {
	constructor() {
		super('session expired');
		this.name = 'SessionExpiredError';
	}
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
	// Read the token per attempt, so the retry uses the renewed one.
	const request = () => {
		const headers = new Headers(options.headers);
		const token = getToken();
		if (token) headers.set('authorization', `Bearer ${token}`);
		return fetch(url, { ...options, headers });
	};

	const res = await request();
	// In mock mode there is no session to renew (and the API trusts the caller).
	if (res.status !== 401 || AUTH_MOCK) return res;

	try {
		await oidc.manager?.signinSilent();
	} catch {
		throw new SessionExpiredError();
	}
	const retried = await request();
	if (retried.status === 401) throw new SessionExpiredError();
	return retried;
}
