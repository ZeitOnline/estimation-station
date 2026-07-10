// =============================================================================
// Vendored copy of ZEIT's `@zeitonline/svelte-oidc` wrapper.
// =============================================================================
// That package lives on ZeitOnline's private GitHub (not public npm), so we
// inline it here verbatim (ported to TS) on top of the public `oidc-client-ts`.
// Behaviour is identical to what wally/merkl use — if you later have access to
// the private package, `import { oidc } from '@zeitonline/svelte-oidc'` is a
// drop-in replacement for this file.
//
// It's a Svelte 5 `$state` singleton around oidc-client-ts' UserManager:
//   oidc.manage({ authority, client_id })  — set up + handle redirect callback
//   oidc.login()                           — start the auth-code redirect
//   oidc.isAuthenticated / accessToken / idToken / userInfo / loading / error
// =============================================================================

import { SvelteURLSearchParams } from 'svelte/reactivity';
import { UserManager, type UserManagerSettings, type UserProfile } from 'oidc-client-ts';

// Callers only need authority + client_id; redirect_uri defaults to the current
// origin (must be registered on the Keycloak client). Anything else optional.
export type ManageArgs = { authority: string; client_id: string } & Partial<UserManagerSettings>;

function setup(args: ManageArgs) {
	oidc.manager = new UserManager({
		redirect_uri: window.location.origin,
		...args,
		response_type: 'code',
		scope: 'openid profile email',
		automaticSilentRenew: true
	});

	oidc.manager.events.addUserLoaded((user) => {
		oidc.isAuthenticated = true;
		oidc.accessToken = user.access_token;
		oidc.idToken = user.id_token ?? null;
		oidc.userInfo = user.profile;
	});

	oidc.manager.events.addUserUnloaded(() => {
		oidc.isAuthenticated = false;
		oidc.idToken = null;
		oidc.accessToken = null;
		oidc.userInfo = {};
	});

	oidc.manager.events.addSilentRenewError((e) => {
		oidc.error = `SilentRenewError: ${e.message}`;
	});
}

export const oidc = $state({
	manager: null as UserManager | null,
	isAuthenticated: false,
	accessToken: null as string | null,
	idToken: null as string | null | undefined,
	userInfo: {} as Partial<UserProfile>,
	error: null as Error | string | null,
	loading: true,

	async manage(args: ManageArgs) {
		oidc.loading = true;
		try {
			if (oidc.manager === null) setup(args);
			const params = new SvelteURLSearchParams(window.location.search);
			if (params.has('error')) {
				oidc.error = new Error(params.get('error_description') ?? 'OIDC error');
			} else if (params.has('code')) {
				await oidc.manager!.signinCallback();
				history.replaceState({ isRedirectCallback: true }, '', window.location.pathname);
				oidc.error = null;
			} else if (params.has('state')) {
				await oidc.manager!.signinCallback();
			} else if (!oidc.isAuthenticated) {
				try {
					await oidc.manager!.signinSilent(); // refresh token if a session exists
				} catch (e) {
					oidc.error = (e as Error).message;
				}
			}
		} finally {
			oidc.loading = false;
		}
	},

	async login() {
		return oidc.manager!.signinRedirect({ redirect_uri: window.location.href });
	}
});
