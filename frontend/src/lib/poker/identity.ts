import { browser } from '$app/environment';
import { auth, AUTH_MODE } from '$lib/auth/session.svelte';

// In `off` mode identity is a locally-stored name + generated id. In mock/oidc
// mode it comes from the authenticated session (`auth.user`), and the name
// field on the landing page is hidden.

export function isAuthenticatedMode(): boolean {
	return AUTH_MODE !== 'off';
}

export function getUserId(): string {
	if (auth.user) return auth.user.id;
	if (!browser) return '';
	let id = localStorage.getItem('poker.userId');
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem('poker.userId', id);
	}
	return id;
}

export function getName(): string {
	if (auth.user) return auth.user.name;
	return browser ? (localStorage.getItem('poker.name') ?? '') : '';
}

export function setName(name: string): void {
	if (browser) localStorage.setItem('poker.name', name);
}

/** The bearer token to authenticate the WebSocket connection (oidc mode). */
export function getToken(): string | null {
	return auth.user?.token ?? null;
}
