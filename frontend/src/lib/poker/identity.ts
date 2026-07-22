import { oidc } from '@zeitonline/svelte-oidc';

// Identity comes from the OIDC session. The whole app is rendered behind the
// login gate in +layout.svelte, so by the time these are called a user is
// authenticated.
//
// VITE_AUTH_MODE=mock (local dev only): skip real SSO and fabricate an
// identity per browser *tab* (sessionStorage), so several tabs can join the
// same room as distinct participants. The WS server accepts this because
// AUTH_MODE defaults to off there (see server/poker/ws-server.ts).

export const AUTH_MOCK = import.meta.env.VITE_AUTH_MODE === 'mock';

const MOCK_KEY = 'poker.mockIdentity';

function mockIdentity(): { sub: string; name: string } {
	const stored = sessionStorage.getItem(MOCK_KEY);
	if (stored) return JSON.parse(stored);
	const n = Math.floor(1000 + Math.random() * 9000);
	const identity = { sub: `mock-${n}`, name: `Gast ${n}` };
	sessionStorage.setItem(MOCK_KEY, JSON.stringify(identity));
	return identity;
}

export function getUserId(): string {
	if (AUTH_MOCK) return mockIdentity().sub;
	return String(oidc.userInfo.sub ?? '');
}

export function getName(): string {
	if (AUTH_MOCK) return mockIdentity().name;
	return String(oidc.userInfo.name ?? oidc.userInfo.email ?? 'Angemeldet');
}

/** The bearer token to authenticate the WebSocket connection. */
export function getToken(): string | null {
	if (AUTH_MOCK) return null;
	return oidc.accessToken;
}
