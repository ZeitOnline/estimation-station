<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { Card, Participants } from '$components';
	import { createRoom } from '$lib/poker/room.svelte';
	import { voteSummary } from '$lib/poker/summary';
	import { getName, getUserId, getToken } from '$lib/poker/identity';
	import type { Card as CardType } from '$types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const room = createRoom();

	// Your own current pick (derived from the server state for this user).
	const myVote = $derived(
		room.state?.participants.find((p) => p.userId === getUserId())?.vote ?? null
	);
	const summary = $derived(room.state ? voteSummary(room.state.participants) : null);

	onMount(() => {
		const name = getName();
		if (!name) {
			// no name yet → go pick one on the landing page
			goto(base || '/');
			return;
		}
		room.connect(data.roomId, getUserId(), name, getToken());
	});

	onDestroy(() => room.disconnect());

	function copyLink() {
		navigator.clipboard?.writeText(window.location.href);
	}
</script>

<header class="room-head">
	<a class="back" href={base || '/'}>← Startseite</a>
	<div>
		<h1>Raum {data.roomId}</h1>
		<button class="link" onclick={copyLink}>Link kopieren</button>
	</div>
	<span class="status" class:status--on={room.connected}>
		{room.connected ? 'verbunden' : 'getrennt…'}
	</span>
</header>

{#if room.error}
	<p class="error">{room.error}</p>
{/if}

{#if room.state}
	<section class="deck">
		<h2>Wähle deine Schätzung…</h2>
		<div class="cards">
			{#each room.state.deck as value (value)}
				<Card {value} selected={myVote === value} onpick={(v: CardType) => room.vote(v)} />
			{/each}
		</div>
	</section>

	<section class="table">
		<div class="table__head">
			<span>Teilnehmer</span>
			{#if room.state.revealed && summary}
				<span class="summary">
					Ø {summary.average ?? '–'}
					{#if summary.consensus}· Einigkeit 🎉{/if}
				</span>
			{/if}
		</div>
		<Participants room={room.state} />
	</section>

	{#if room.state.youAreModerator}
		<section class="controls">
			<button class="secondary" onclick={() => room.reset()}>↺ Zurücksetzen</button>
			<button onclick={() => room.reveal()} disabled={room.state.revealed}>👁 Aufdecken</button>
		</section>
	{/if}
{:else}
	<p>Verbinde mit dem Raum…</p>
{/if}

<style>
	.room-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--z-ds-space-m, 1rem);
		margin-bottom: var(--z-ds-space-l, 1.5rem);
	}
	.room-head h1 {
		margin: 0;
	}
	.back {
		color: var(--z-ds-color-neutral-40, #666);
		text-decoration: none;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--z-ds-color-neutral-40, #666);
		cursor: pointer;
		font: inherit;
		text-decoration: underline;
	}
	.status {
		font-size: var(--z-ds-font-size-xs, 0.8rem);
		color: var(--z-ds-color-signal-error, #c0392b);
	}
	.status--on {
		color: var(--z-ds-color-signal-success, #2e7d32);
	}
	.deck {
		margin-bottom: var(--z-ds-space-xl, 2rem);
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: var(--z-ds-space-s, 0.75rem);
		margin-top: var(--z-ds-space-xl, 0.75rem);
	}
	.table__head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: var(--z-ds-space-s, 0.75rem);
		font-weight: 600;
	}
	.summary {
		font-weight: 400;
		color: var(--z-ds-color-neutral-30, #555);
	}
	.controls {
		display: flex;
		gap: var(--z-ds-space-s, 0.75rem);
		margin-top: var(--z-ds-space-xl, 2rem);
	}
	button {
		padding: var(--z-ds-space-xs, 0.5rem) var(--z-ds-space-m, 1rem);
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-neutral-10, #111);
		color: var(--z-ds-color-neutral-100, #fff);
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.secondary {
		background: var(--z-ds-color-neutral-90, #e5e5e5);
		color: var(--z-ds-color-neutral-10, #111);
	}
	.error {
		color: var(--z-ds-color-signal-error, #c0392b);
	}
</style>
