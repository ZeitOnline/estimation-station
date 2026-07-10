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
		align-items: center;
		gap: var(--z-ds-space-xxs, 0.25rem);
		width: 4rem;
		text-align: center;
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
		border: 1px solid var(--z-ds-color-neutral-80, #ccc);
		border-radius: var(--z-ds-radius-m, 8px);
		background: var(--z-ds-color-neutral-95, #f0f0f0);
	}

	.participant__seat--voted {
		background: var(--z-ds-color-neutral-10, #111);
		color: var(--z-ds-color-neutral-100, #fff);
		border-color: var(--z-ds-color-neutral-10, #111);
	}

	.participant__name {
		font-size: var(--z-ds-font-size-xs, 0.8rem);
		overflow-wrap: anywhere;
	}

	.tag {
		display: block;
		font-size: 0.65rem;
		color: var(--z-ds-color-neutral-40, #999);
	}
</style>
