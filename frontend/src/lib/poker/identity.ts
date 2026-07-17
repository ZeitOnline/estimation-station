import { oidc } from '@zeitonline/svelte-oidc';

// Identity comes from the OIDC session. The whole app is rendered behind the
// login gate in +layout.svelte, so by the time these are called a user is
// authenticated.

export function getUserId(): string {
	return String(oidc.userInfo.sub ?? '');
}

export function getName(): string {
	return String(oidc.userInfo.name ?? oidc.userInfo.email ?? 'Angemeldet');
}

/** The bearer token to authenticate the WebSocket connection. */
export function getToken(): string | null {
	return oidc.accessToken;
}
