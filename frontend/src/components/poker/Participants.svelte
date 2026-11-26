<script lang="ts">
import { voteSummary } from '#lib/poker/summary.js';
import type { Participant, RoomState } from '#types';
import Avatar from './Avatar.svelte';

// `selfId` + `onEditAvatar` make your own avatar a button that opens the editor.
let {
	room,
	selfId = '',
	onEditAvatar
}: { room: RoomState; selfId?: string; onEditAvatar?: () => void } = $props();

// Above this many people the seats shrink so six fit a row of the voting
// column, and the per-person state line is dropped (the card already says it).
const COMPACT_ABOVE = 5;
const compact = $derived(room.participants.length > COMPACT_ABOVE);

const summary = $derived(voteSummary(room.participants));
// Only a spread has outliers worth pointing at.
const spread = $derived(
	room.revealed && summary.lowest !== null && summary.lowest !== summary.highest
);

// The line under the name: who this is first, otherwise what they are doing.
function tag(p: Participant): string {
	const who = [p.userId === selfId ? 'Du' : '', p.role === 'moderator' ? 'Moderator' : ''].filter(
		Boolean
	);
	// Compact seats are narrower than "Du · Moderator".
	if (who.length > 0) return who.join(' · ').replace(/Moderator$/, compact ? 'Mod.' : 'Moderator');
	if (!p.connected) return 'offline';
	if (spread && p.vote === summary.lowest) return 'niedrigste';
	if (spread && p.vote === summary.highest) return 'höchste';
	if (compact || room.revealed) return '';
	return p.hasVoted ? 'geschätzt' : 'überlegt noch';
}
</script>

<ul class="participants" class:participants--compact={compact}>
	{#each room.participants as p, i (p.userId)}
		<li class="seat" class:seat--offline={!p.connected}>
			{#if room.revealed}
				<!-- Face up. This branch is created anew on every reveal, so the
				     flip animation replays each round. -->
				<span
					class="seat__card seat__card--face"
					class:seat__card--majority={!summary.consensus &&
						p.vote !== null &&
						p.vote === summary.majority}
					class:seat__card--empty={p.vote === null}
					style:--i={i}
				>
					{p.vote ?? '–'}
				</span>
			{:else if p.hasVoted}
				<span class="seat__card seat__card--back">
					<span class="seat__check" aria-hidden="true">
						<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
							<path
								d="M2 6.5 L5 9.5 L10 3"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
					<span class="visually-hidden">hat geschätzt</span>
				</span>
			{:else}
				<span class="seat__card seat__card--waiting">
					{#if p.connected}
						<span class="seat__dots" aria-hidden="true"><i></i><i></i><i></i></span>
					{/if}
					<span class="visually-hidden">hat noch nicht geschätzt</span>
				</span>
			{/if}

			{#if p.userId === selfId && onEditAvatar}
				<button
					class="seat__avatar seat__avatar--own"
					onclick={onEditAvatar}
					title="Avatar anpassen"
					aria-label="Deinen Avatar anpassen"
				>
					<Avatar name={p.name} avatar={p.avatar} />
				</button>
			{:else}
				<span class="seat__avatar">
					<Avatar name={p.name} avatar={p.avatar} />
				</span>
			{/if}

			<span class="seat__name" title={p.name}>{p.name}</span>
			<span class="seat__tag">{tag(p)}</span>
		</li>
	{/each}
</ul>

<style>
	/* Sizes hang off custom properties so the compact variant only has to
	   change numbers. */
	/* Seats share each row evenly. The minimum seat widths are picked for the
	   room's voting column (~28rem): five regular seats per row, six compact. */
	.participants {
		--seat: 4.75rem;
		--card-w: 3.75rem;
		--card-h: 5.25rem;
		--avatar: 2.75rem;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--seat), 1fr));
		gap: var(--z-ds-space-l, 1.25rem) var(--z-ds-space-xs, 0.5rem);
		padding: 0;
	}

	.participants--compact {
		--seat: 4rem;
		--card-w: 3rem;
		--card-h: 4.25rem;
		--avatar: 2.25rem;
	}

	.seat {
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	/* --- the card in front of each person --- */
	.seat__card {
		position: relative;
		width: var(--card-w);
		height: var(--card-h);
		display: grid;
		place-items: center;
		border-radius: var(--z-ds-radius-m, 8px);
	}

	/* Face down. The back keeps its dark ink in both themes — it is a printed
	   card, not a surface — and gets a hairline so it holds up on a dark page. */
	.seat__card--back {
		background-color: #252525;
		background-image:
			repeating-linear-gradient(45deg, rgb(255 255 255 / 0.1) 0 2px, transparent 2px 8px),
			repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.1) 0 2px, transparent 2px 8px);
		box-shadow:
			inset 0 0 0 4px #252525,
			inset 0 0 0 5px rgb(255 255 255 / 0.4),
			0 0 0 1px var(--z-ds-color-border-100, #cccccf),
			0 4px 10px rgb(0 0 0 / 0.16);
	}

	.seat__check {
		position: absolute;
		top: -0.4rem;
		right: -0.4rem;
		width: 1.35rem;
		height: 1.35rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--z-ds-color-accent-100, #b91109);
		color: #ffffff;
		box-shadow: 0 0 0 3px var(--z-ds-color-background-0, #ffffff);
	}

	.seat__card--waiting {
		border: 2px dashed var(--z-ds-color-border-100, #cccccf);
		background: var(--z-ds-color-background-10, #eeeeee);
	}

	.seat--offline .seat__card--waiting {
		background: none;
	}

	.seat__dots {
		display: flex;
		gap: 0.3rem;
		/* keep clear of the avatar sitting on the lower edge */
		margin-bottom: calc(var(--avatar) * 0.35);
	}

	.seat__dots i {
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: var(--z-ds-color-text-55, #69696c);
		animation: seat-think 1.2s ease-in-out infinite;
	}

	.seat__dots i:nth-child(2) {
		animation-delay: 0.15s;
	}

	.seat__dots i:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes seat-think {
		0%,
		60%,
		100% {
			opacity: 0.3;
		}
		30% {
			opacity: 1;
		}
	}

	/* Face up after the reveal; cards turn over one after the other. */
	.seat__card--face {
		border: 1px solid var(--z-ds-color-text-100, #252525);
		background: var(--z-ds-color-background-0, #ffffff);
		color: var(--z-ds-color-text-100, #252525);
		font-size: calc(var(--card-w) * 0.55);
		font-weight: 800;
		/* numeral sits above the avatar overlapping the lower edge */
		padding-bottom: calc(var(--avatar) * 0.3);
		animation: seat-flip 0.35s ease-out both;
		animation-delay: calc(var(--i, 0) * 60ms);
	}

	.seat__card--majority {
		box-shadow:
			0 0 0 3px var(--z-ds-color-background-0, #ffffff),
			0 0 0 5px var(--z-ds-color-accent-100, #b91109);
	}

	.seat__card--empty {
		border: 2px dashed var(--z-ds-color-border-100, #cccccf);
		color: var(--z-ds-color-text-55, #69696c);
	}

	@keyframes seat-flip {
		from {
			transform: rotateY(90deg);
		}
		to {
			transform: none;
		}
	}

	/* --- the avatar, sitting on the card's lower edge --- */
	.seat__avatar {
		position: relative;
		display: block;
		width: var(--avatar);
		height: var(--avatar);
		margin-top: calc(var(--avatar) * -0.6);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		box-shadow: 0 0 0 3px var(--z-ds-color-background-0, #ffffff);
	}

	.seat--offline .seat__avatar {
		opacity: 0.45;
	}

	.seat__avatar--own {
		cursor: pointer;
		box-shadow:
			0 0 0 3px var(--z-ds-color-background-0, #ffffff),
			0 0 0 5px var(--z-ds-color-text-100, #252525);
		transition: transform 0.15s ease;
	}

	.seat__avatar--own:hover {
		transform: scale(1.08);
	}

	.seat__name {
		max-width: 100%;
		margin-top: var(--z-ds-space-xs, 0.5rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--z-ds-font-size-xs, 0.8rem);
		font-weight: 600;
	}

	.seat--offline .seat__name {
		color: var(--z-ds-color-text-55, #69696c);
	}

	/* Always one line high, so rows stay aligned whether or not there is a tag. */
	.seat__tag {
		min-height: 1rem;
		font-size: 0.7rem;
		line-height: 1rem;
		color: var(--z-ds-color-text-55, #69696c);
		white-space: nowrap;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.seat__avatar--own {
			transition: none;
		}
		.seat__dots i,
		.seat__card--face {
			animation: none;
		}
	}
</style>
