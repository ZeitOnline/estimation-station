<script lang="ts">
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Icon } from '$components';
import { getName } from '$lib/poker/identity';

let name = $state('');
let roomNumber = $state('');
let error = $state('');

onMount(() => {
	name = getName();
});

function join() {
	const id = roomNumber.trim();
	if (!id) {
		error = 'Bitte gib eine Raumnummer ein.';
		return;
	}
	goto(resolve('/room/[id]', { id: encodeURIComponent(id) }));
}

function create() {
	const id = String(Math.floor(10000 + Math.random() * 90000)); // 5-digit room
	goto(resolve('/room/[id]', { id }));
}
</script>

<header class="hero">
	<h1>Planning Poker</h1>
	<p>Verteiltes Schätzen von Tickets — erste Person, die einen Raum anlegt, moderiert.</p>
</header>

<div class="panel">
	<p class="field">Angemeldet als <strong>{name}</strong></p>

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
		color: var(--z-ds-color-text-55, #69696c);
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
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
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
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		font: inherit;
		cursor: pointer;
	}
	button.secondary {
		background: var(--z-ds-color-background-20, #dfdfe1);
		color: var(--z-ds-color-text-100, #252525);
	}
	.or {
		color: var(--z-ds-color-text-55, #69696c);
		text-align: center;
		margin: 0;
	}
	.error {
		color: var(--z-ds-color-error-70, #bf4040);
	}
</style>
