<script lang="ts">
	import '$lib/styles/app.css';
	import { onMount } from 'svelte';
	import { ZeitLogo } from '$components';
	import { resolve } from '$app/paths';
	import { oidc } from '$lib/auth/oidc.svelte';
	import { auth, initAuth, login, AUTH_MODE } from '$lib/auth/session.svelte';

	let { children }: { children: () => ReturnType<import('svelte').Snippet> } = $props();

	onMount(initAuth);

	// Mirror the oidc wrapper's reactive state into our session (oidc mode only).
	$effect(() => {
		if (AUTH_MODE !== 'oidc') return;
		auth.ready = !oidc.loading;
		auth.authenticated = oidc.isAuthenticated;
		auth.error = oidc.error ? String(oidc.error) : null;
		auth.user = oidc.isAuthenticated
			? {
					id: String(oidc.userInfo.sub ?? ''),
					name: String(oidc.userInfo.name ?? oidc.userInfo.email ?? 'Angemeldet'),
					email: oidc.userInfo.email as string | undefined,
					token: oidc.accessToken
				}
			: null;
	});

	const showLoginGate = $derived(AUTH_MODE === 'oidc' && auth.ready && !auth.authenticated);
</script>

<header class="masthead">
	<div class="masthead__inner">
		<a href={resolve('/')} class="masthead__logo" aria-label="DIE ZEIT – Startseite">
			<ZeitLogo width={180} height={27} />
		</a>
		<span class="masthead__product">Planning Poker</span>
	</div>
</header>

<div class="app">
	{#if !auth.ready}
		<p class="auth-status">Anmeldung wird geprüft …</p>
	{:else if showLoginGate}
		<section class="login">
			<h1>Anmeldung erforderlich</h1>
			<p class="login__lead">
				Dieses Tool ist nur für das Team. Bitte melde dich mit deinem ZEIT-Account an.
			</p>
			<button class="login__btn" onclick={login}>Mit ZEIT-Account anmelden</button>
			{#if auth.error}<p class="login__error">{auth.error}</p>{/if}
		</section>
	{:else}
		{@render children()}
	{/if}
</div>

<footer class="footer">
	<div class="footer__inner">
		<span>© {new Date().getFullYear()} DIE ZEIT</span>
		<a
			href="https://github.com/ZeitOnline/estimation-station"
			target="_blank"
			rel="noopener noreferrer"
		>
			Repo auf GitHub
		</a>
	</div>
</footer>

<style>
	.masthead {
		border-bottom: 3px solid var(--z-ds-color-text-100, #252525);
		background: var(--z-ds-color-background-0, #ffffff);
	}
	.masthead__inner {
		max-width: 42rem;
		margin-inline: auto;
		padding: var(--z-ds-space-m, 1rem) var(--z-ds-space-m, 1rem) var(--z-ds-space-s, 0.75rem);
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--z-ds-space-m, 1rem);
	}
	.masthead__logo {
		color: var(--z-ds-color-text-100, #252525);
		display: block;
	}
	.masthead__product {
		font-size: var(--z-ds-font-size-s, 0.9rem);
		color: var(--z-ds-color-text-55, #69696c);
		letter-spacing: 0.02em;
		padding-bottom: 2px;
		white-space: nowrap;
	}

	.auth-status {
		color: var(--z-ds-color-text-55, #69696c);
	}
	.login {
		max-width: 30rem;
	}
	.login h1 {
		margin-bottom: var(--z-ds-space-xs, 0.5rem);
	}
	.login__lead {
		color: var(--z-ds-color-text-55, #69696c);
		margin-bottom: var(--z-ds-space-l, 1.5rem);
	}
	.login__btn {
		padding: var(--z-ds-space-s, 0.75rem) var(--z-ds-space-l, 1.5rem);
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.login__error {
		margin-top: var(--z-ds-space-m, 1rem);
		color: var(--z-ds-color-error-70, #bf4040);
	}

	.footer {
		margin-top: auto;
		border-top: 1px solid var(--z-ds-color-border-70, #e4e4e4);
	}
	.footer__inner {
		max-width: 42rem;
		margin-inline: auto;
		padding: var(--z-ds-space-m, 1rem);
		display: flex;
		justify-content: space-between;
		gap: var(--z-ds-space-m, 1rem);
		font-size: var(--z-ds-font-size-s, 0.9rem);
		color: var(--z-ds-color-text-55, #69696c);
	}
	.footer__inner a {
		color: inherit;
	}
</style>
