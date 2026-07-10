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
		id = randomId();
		localStorage.setItem('poker.userId', id);
	}
	return id;
}

// A random v4 UUID. `crypto.randomUUID` only exists in a *secure context*
// (HTTPS or localhost); when the app is opened over plain http on a LAN IP
// (e.g. from a phone) it's undefined, so fall back to `crypto.getRandomValues`,
// which is available everywhere.
function randomId(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40; // version 4
	b[8] = (b[8] & 0x3f) | 0x80; // variant 10
	const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
	return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
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
