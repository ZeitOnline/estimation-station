<script lang="ts">
import type { Card } from '#types';

// `tilt` (degrees) and `drop` (px) place the card in the fanned hand — the
// deck computes them from the card's position, see fan() on the room page.
let {
	value,
	selected = false,
	tilt = 0,
	drop = 0,
	onpick
}: {
	value: Card;
	selected?: boolean;
	tilt?: number;
	drop?: number;
	onpick: (v: Card) => void;
} = $props();
</script>

<button
	class="card"
	class:card--selected={selected}
	style:--tilt="{tilt}deg"
	style:--drop="{drop}px"
	aria-pressed={selected}
	aria-label={value === '?' ? 'Keine Ahnung' : `${value} ${value === 1 ? 'Punkt' : 'Punkte'}`}
	onclick={() => onpick(value)}
>
	<span class="card__corner" aria-hidden="true">{value}</span>
	<span class="card__value" aria-hidden="true">{value}</span>
	<span class="card__corner card__corner--bottom" aria-hidden="true">{value}</span>
</button>

<style>
	/* A playing card: corner indices, a big numeral, and a place in the fan
	   (--tilt / --drop). --lift is what hover and selection add on top. */
	.card {
		--lift: 0px;
		position: relative;
		flex: none;
		width: 4rem;
		height: 5.75rem;
		padding: 0;
		display: grid;
		place-items: center;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: var(--z-ds-radius-m, 8px);
		background: var(--z-ds-color-background-0, #ffffff);
		color: var(--z-ds-color-text-100, #252525);
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.08);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		transform: translateY(calc(var(--drop) + var(--lift))) rotate(var(--tilt));
		transition:
			transform 0.14s ease,
			box-shadow 0.14s ease,
			border-color 0.14s ease;
	}

	.card:hover {
		--lift: -6px;
		border-color: var(--z-ds-color-border-hover, #444444);
	}

	.card__corner {
		position: absolute;
		top: 0.35rem;
		left: 0.5rem;
		font-size: var(--z-ds-font-size-xs, 0.75rem);
		line-height: 1;
	}

	.card__corner--bottom {
		top: auto;
		left: auto;
		bottom: 0.35rem;
		right: 0.5rem;
		transform: rotate(180deg);
	}

	.card__value {
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1;
	}

	/* Your pick: inverted and lifted out of the hand, marked with the accent. */
	.card--selected,
	.card--selected:hover {
		--lift: -18px;
		border-color: var(--z-ds-color-text-100, #252525);
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		box-shadow: 0 14px 22px rgb(0 0 0 / 0.24);
	}

	.card--selected::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 1.2rem;
		width: 1.25rem;
		height: 4px;
		margin-left: -0.625rem;
		border-radius: 2px;
		background: var(--z-ds-color-accent-100, #b91109);
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
