<script lang="ts">
	import type { Card } from '$types';

	let {
		value,
		selected = false,
		onpick
	}: { value: Card; selected?: boolean; onpick: (v: Card) => void } = $props();
</script>

<button class="card" class:card--selected={selected} onclick={() => onpick(value)}>
	{value}
</button>

<style>
	.card {
		min-width: 3rem;
		height: 4.5rem;
		font-size: var(--z-ds-font-size-l, 1.25rem);
		font-weight: 600;
		border: 1px solid var(--z-ds-color-neutral-80, #ccc);
		border-radius: var(--z-ds-radius-m, 8px);
		background: var(--z-ds-color-neutral-100, #fff);
		cursor: pointer;
		transition:
			transform 0.08s ease,
			border-color 0.08s ease;
	}

	.card:hover {
		transform: translateY(-4px);
		border-color: var(--z-ds-color-neutral-40, #999);
	}

	.card--selected {
		transform: translateY(-8px);
		border-color: var(--z-ds-color-neutral-10, #111);
		border-width: 2px;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
	}
</style>
