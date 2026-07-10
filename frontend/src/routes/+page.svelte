<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { Icon } from '$components';
	import { getName, setName, isAuthenticatedMode } from '$lib/poker/identity';

	let name = $state('');
	let roomNumber = $state('');
	let error = $state('');

	// In mock/oidc mode the name comes from the account; only `off` mode asks.
	const asksForName = !isAuthenticatedMode();

	onMount(() => {
		name = getName();
	});

	function ensureName(): boolean {
		if (!asksForName) return true;
		if (!name.trim()) {
			error = 'Bitte gib deinen Namen ein.';
			return false;
		}
		setName(name.trim());
		return true;
	}

	function join() {
		if (!ensureName()) return;
		const id = roomNumber.trim();
		if (!id) {
			error = 'Bitte gib eine Raumnummer ein.';
			return;
		}
		goto(`${base}/room/${encodeURIComponent(id)}`);
	}

	function create() {
		if (!ensureName()) return;
		const id = String(Math.floor(10000 + Math.random() * 90000)); // 5-digit room
		goto(`${base}/room/${id}`);
	}
</script>

<header class="hero">
	<h1>Planning Poker</h1>
	<p>Verteiltes Schätzen von Tickets — erste Person, die einen Raum anlegt, moderiert.</p>
</header>

<div class="panel">
	{#if asksForName}
		<label class="field">
			<span>Dein Name</span>
			<input bind:value={name} placeholder="z. B. Manuel" />
		</label>
	{:else}
		<p class="field">Angemeldet als <strong>{name}</strong></p>
	{/if}

	<label class="field">
		<span>Raumnummer</span>
		<div class="row">
			<input
				bind:value={roomNumber}
				placeholder="Raumnummer"
				onkeydown={(e) => e.key === 'Enter' && join()}
			/>
			<button onclick={join}><Icon name="arrow-right" size={15} /> Raum beitreten</button>
		</div>
	</label>

	<p class="or">oder</p>

	<button class="secondary" onclick={create}
		><Icon name="plus" size={16} /> Neuen Raum erstellen</button
	>

	{#if error}<p class="error">{error}</p>{/if}
</div>

<style>
	.hero h1 {
		margin-bottom: var(--z-ds-space-xxs, 0.25rem);
	}
	.hero p {
		color: var(--z-ds-color-neutral-40, #666);
		margin-bottom: var(--z-ds-space-l, 1.5rem);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--z-ds-space-m, 1rem);
		max-width: 32rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--z-ds-space-xxs, 0.25rem);
		font-size: var(--z-ds-font-size-s, 0.9rem);
	}
	.row {
		display: flex;
		gap: var(--z-ds-space-xs, 0.5rem);
	}
	input {
		flex: 1;
		padding: var(--z-ds-space-xs, 0.5rem);
		border: 1px solid var(--z-ds-color-neutral-80, #ccc);
		border-radius: var(--z-ds-radius-s, 6px);
		font: inherit;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--z-ds-space-xxs, 0.4rem);
		padding: var(--z-ds-space-xs, 0.5rem) var(--z-ds-space-m, 1rem);
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-neutral-10, #111);
		color: var(--z-ds-color-neutral-100, #fff);
		font: inherit;
		cursor: pointer;
	}
	button.secondary {
		background: var(--z-ds-color-neutral-90, #e5e5e5);
		color: var(--z-ds-color-neutral-10, #111);
	}
	.or {
		color: var(--z-ds-color-neutral-40, #999);
		text-align: center;
		margin: 0;
	}
	.error {
		color: var(--z-ds-color-signal-error, #c0392b);
	}
</style>
