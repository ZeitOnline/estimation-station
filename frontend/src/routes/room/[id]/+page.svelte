<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Card, Participants, Icon } from '$components';
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
			goto(resolve('/'));
			return;
		}
		room.connect(data.roomId, getUserId(), name, getToken());
	});

	onDestroy(() => {
		room.disconnect();
		if (copyTimer) clearTimeout(copyTimer);
	});

	// Copy the room link, then flip the button to a short-lived "Kopiert" state
	// before returning to the default. Falls back to execCommand so it also
	// works over plain http on a LAN (where navigator.clipboard is unavailable).
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copyLink() {
		const url = window.location.href;
		let ok = false;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(url);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok) ok = legacyCopy(url);
		if (!ok) return;
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1600);
	}

	function legacyCopy(text: string): boolean {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
</script>

<header class="room-head">
	<a class="back" href={resolve('/')}><Icon name="arrow-left" size={14} /> Startseite</a>
	<div class="room-title">
		<h1>Raum {data.roomId}</h1>
		<button
			class="copy"
			class:copy--done={copied}
			onclick={copyLink}
			title={copied ? 'Kopiert' : 'Link kopieren'}
			aria-label={copied ? 'Link kopiert' : 'Link kopieren'}
		>
			<span class="copy__icons">
				<span class="copy__icon copy__icon--link"><Icon name="link" size={16} /></span>
				<span class="copy__icon copy__icon--check"><Icon name="checkmark" size={16} /></span>
			</span>
		</button>
	</div>
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
			<button class="secondary" onclick={() => room.reset()}>
				<Icon name="reload" size={16} /> Zurücksetzen
			</button>
			<button onclick={() => room.reveal()} disabled={room.state.revealed}>
				<Icon name="search" size={16} /> Aufdecken
			</button>
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
		font-size: var(--z-ds-font-size-l, 1.25rem);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--z-ds-space-xxs, 0.35rem);
		color: var(--z-ds-color-text-55, #69696c);
		text-decoration: none;
	}
	.room-title {
		display: flex;
		align-items: center;
	}
	.copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		color: var(--z-ds-color-text-55, #69696c);
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.copy:hover {
		color: var(--z-ds-color-text-100, #252525);
	}
	.copy--done {
		color: var(--z-ds-color-background-success, #09864d);
	}
	/* Crossfade + scale between the link and checkmark icons on state switch. */
	.copy__icons {
		position: relative;
		width: 1.25rem;
		height: 1.25rem;
		display: inline-flex;
		align-items: center; 
		justify-content: flex-end;
	}
	.copy__icon {
		position: absolute;
		display: inline-flex;
		transition:
			opacity 0.2s ease,
			transform 0.2s ease;
	}
	.copy__icon--check {
		opacity: 0;
		transform: scale(0.4) rotate(-45deg);
	}
	.copy--done .copy__icon--link {
		opacity: 0;
		transform: scale(0.4) rotate(45deg);
	}
	.copy--done .copy__icon--check {
		opacity: 1;
		transform: none;
	}
	.deck {
		margin-bottom: var(--z-ds-space-xl, 2rem);
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: var(--z-ds-space-xl);
		margin-top: var(--z-ds-space-xl);
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
		color: var(--z-ds-color-text-70, #444444);
	}
	.controls {
		display: flex;
		gap: var(--z-ds-space-s, 0.75rem);
		margin-top: var(--z-ds-space-xl, 2rem);
	}
	.controls button {
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
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.secondary {
		background: var(--z-ds-color-background-20, #dfdfe1);
		color: var(--z-ds-color-text-100, #252525);
	}
	.error {
		color: var(--z-ds-color-error-70, #bf4040);
	}
</style>
