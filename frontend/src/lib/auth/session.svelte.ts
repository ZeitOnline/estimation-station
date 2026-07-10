// =============================================================================
// session.svelte.ts — the app's view of "who is logged in", across three modes.
// =============================================================================
//   off   — no gate. Identity is a name the user types (Phase 1). Local default.
//   mock  — simulate a logged-in ZEIT user, no real SSO. For demoing the gated
//           UX locally without registering a Keycloak client.
//   oidc  — real ZEIT SSO. Requires a registered Keycloak client (see docs).
//
// The reactive bridge from the `oidc` wrapper into `auth` lives in +layout.svelte
// (runes need a component/effect scope); this module holds the shared state.
// =============================================================================

import { oidc } from './oidc.svelte';

export type AuthMode = 'off' | 'mock' | 'oidc';

export const AUTH_MODE: AuthMode = (import.meta.env.VITE_AUTH_MODE as AuthMode) || 'off';
export const OIDC_AUTHORITY =
	import.meta.env.VITE_OIDC_AUTHORITY || 'https://openid.zeit.de/realms/zeit-online';
export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'planning-poker';

export interface SessionUser {
	id: string;
	name: string;
	email?: string;
	token: string | null;
}

export const auth = $state({
	mode: AUTH_MODE,
	// off/mock are "ready and authenticated" from the start; oidc waits for the flow.
	ready: AUTH_MODE !== 'oidc',
	authenticated: AUTH_MODE !== 'oidc',
	user: null as SessionUser | null,
	error: null as string | null
});

// Set the fake user eagerly (at module load, before any component mounts) so
// identity is available on first render — not deferred to onMount ordering.
if (AUTH_MODE === 'mock') {
	auth.user = { id: 'mock-user', name: 'Test Userin', email: 'test.userin@zeit.de', token: null };
}

/** Called once on mount. Kicks off the redirect flow (oidc only). */
export function initAuth(): void {
	if (AUTH_MODE === 'oidc') {
		// The redirect/callback handling; layout mirrors oidc → auth afterwards.
		oidc.manage({ authority: OIDC_AUTHORITY, client_id: OIDC_CLIENT_ID });
	}
	// 'off' and 'mock' need nothing further.
}

export function login(): void {
	oidc.login();
}
