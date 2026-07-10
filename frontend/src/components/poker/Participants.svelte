<script lang="ts">
	import type { RoomState } from '$types';

	let { room }: { room: RoomState } = $props();
</script>

<ul class="participants">
	{#each room.participants as p (p.userId)}
		<li class="participant" class:participant--offline={!p.connected}>
			<span class="participant__seat" class:participant__seat--voted={p.hasVoted}>
				{#if room.revealed}
					{p.vote ?? '–'}
				{:else if p.hasVoted}
					✓
				{/if}
			</span>
			<span class="participant__name">
				{p.name}
				{#if p.role === 'moderator'}<span class="tag">Moderator</span>{/if}
			</span>
		</li>
	{/each}
</ul>

<style>
	.participants {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--z-ds-space-m, 1rem);
		padding: 0;
	}

	.participant {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--z-ds-space-xxs, 0.25rem);
		width: 4rem;
		text-align: left;
	}

	.participant--offline {
		opacity: 0.4;
	}

	.participant__seat {
		width: 3rem;
		height: 4rem;
		display: grid;
		place-items: center;
		font-size: var(--z-ds-font-size-l, 1.25rem);
		font-weight: 600;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: var(--z-ds-radius-m, 8px);
		background: var(--z-ds-color-background-10, #eeeeee);
	}

	.participant__seat--voted {
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		border-color: var(--z-ds-color-text-100, #252525);
	}

	.participant__name {
		font-size: var(--z-ds-font-size-xs, 0.8rem);
		overflow-wrap: anywhere;
	}

	.tag {
		display: block;
		font-size: 0.65rem;
		color: var(--z-ds-color-text-55, #69696c);
	}
</style>
