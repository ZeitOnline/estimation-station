<script lang="ts">
import type { Summary } from '#lib/poker/summary.js';
import type { Card, Participant, RoomState } from '#types';
import Avatar from './Avatar.svelte';

// The outcome of a revealed round: the headline number, a few stats, and who
// picked which card.
let { room, summary }: { room: RoomState; summary: Summary } = $props();

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const votersOf = (card: Card): Participant[] => room.participants.filter((p) => p.vote === card);
const names = (card: Card) =>
	votersOf(card)
		.map((p) => p.name)
		.join(', ');

// Headline: the agreed card, else the majority card, else the average.
const headline = $derived.by(() => {
	if (summary.voted === 0) return { value: '–', text: 'Niemand hat geschätzt' };
	if (summary.consensus) return { value: String(summary.majority), text: 'Einigkeit 🎉' };
	if (summary.majority !== null) {
		return { value: String(summary.majority), text: 'ist die Mehrheit' };
	}
	return {
		value: summary.average === null ? '–' : `Ø ${number.format(summary.average)}`,
		text: 'im Durchschnitt — keine Mehrheit'
	};
});

const spread = $derived(summary.lowest !== null && summary.lowest !== summary.highest);
</script>

<section class="results" aria-label="Ergebnis der Runde">
	<div class="results__banner">
		<p class="results__headline">
			<strong>{headline.value}</strong>
			<span>{headline.text}</span>
		</p>
		<dl class="results__stats">
			<div>
				<dt>Durchschnitt</dt>
				<dd>{summary.average === null ? '–' : number.format(summary.average)}</dd>
			</div>
			<div>
				<dt>Spanne</dt>
				<dd>{summary.lowest === null ? '–' : `${summary.lowest} – ${summary.highest}`}</dd>
			</div>
			<div>
				<dt>Stimmen</dt>
				<dd>{summary.voted} von {room.participants.length}</dd>
			</div>
		</dl>
	</div>

	{#if summary.voted > 0}
		<!-- One column per card; the avatars stack up from it like a bar. -->
		<ul class="results__columns" style:--columns={room.deck.length}>
			{#each room.deck as card (card)}
				{@const voters = votersOf(card)}
				<li
					class="results__column"
					aria-label="{card}: {voters.length === 0 ? 'niemand' : names(card)}"
				>
					<span class="results__voters">
						{#each voters as p (p.userId)}
							<span class="results__avatar" title={p.name}>
								<Avatar name={p.name} avatar={p.avatar} />
							</span>
						{/each}
					</span>
					<span
						class="results__card"
						class:results__card--picked={voters.length > 0}
						class:results__card--top={card === summary.majority}
					>
						{card}
					</span>
				</li>
			{/each}
		</ul>

		{#if spread && summary.lowest !== null && summary.highest !== null}
			<p class="results__hint">
				Am weitesten auseinander: {names(summary.lowest)} ({summary.lowest}) und
				{names(summary.highest)} ({summary.highest}) — kurz begründen, dann neu schätzen?
			</p>
		{/if}
	{/if}
</section>

<style>
	.results {
		display: flex;
		flex-direction: column;
		gap: var(--z-ds-space-m, 1rem);
	}

	.results__banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--z-ds-space-s, 0.75rem) var(--z-ds-space-l, 1.5rem);
		padding: var(--z-ds-space-m, 1rem) var(--z-ds-space-l, 1.25rem);
		border-radius: 12px;
		background: var(--z-ds-color-background-10, #eeeeee);
	}

	.results__headline {
		display: flex;
		align-items: baseline;
		gap: var(--z-ds-space-s, 0.75rem);
		margin: 0;
		font-weight: 600;
	}

	.results__headline strong {
		font-size: 2.5rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.results__stats {
		display: flex;
		gap: var(--z-ds-space-l, 1.5rem);
		margin: 0;
	}

	.results__stats dt {
		font-size: var(--z-ds-font-size-xs, 0.75rem);
		color: var(--z-ds-color-text-70, #444444);
	}

	.results__stats dd {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.results__columns {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: var(--z-ds-space-xs, 0.5rem);
		align-items: end;
		margin: 0;
		padding: 0 0 var(--z-ds-space-s, 0.75rem);
		border-bottom: 1px solid var(--z-ds-color-border-70, #e4e4e4);
	}

	.results__column {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--z-ds-space-xs, 0.5rem);
	}

	/* wrap-reverse: a crowded card grows upwards, two avatars per row. */
	.results__voters {
		display: flex;
		flex-wrap: wrap-reverse;
		justify-content: center;
		gap: 0.25rem;
	}

	.results__avatar {
		display: block;
		width: 1.9rem;
		height: 1.9rem;
	}

	.results__card {
		width: 2.5rem;
		height: 3.4rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: 6px;
		color: var(--z-ds-color-text-55, #69696c);
		font-size: 1.1rem;
		font-weight: 700;
	}

	.results__card--picked {
		border-color: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-text-100, #252525);
	}

	.results__card--top {
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		box-shadow:
			0 0 0 3px var(--z-ds-color-background-0, #ffffff),
			0 0 0 5px var(--z-ds-color-accent-100, #b91109);
	}

	.results__hint {
		margin: 0;
		font-size: var(--z-ds-font-size-s, 0.875rem);
		color: var(--z-ds-color-text-70, #444444);
	}
</style>
