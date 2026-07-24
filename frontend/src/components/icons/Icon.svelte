<script lang="ts">
// Inline an SVG from the ZEIT design system (@zeitonline/icons, copied into
// ./svg via `npm run copy:icons`). Inlining — rather than <img> — lets the
// icon inherit the current text color (every DS icon uses `currentColor`)
// and be sized with CSS. The button/link text is the accessible label, so
// the icon itself is aria-hidden.
const modules = import.meta.glob('./svg/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

let {
	name,
	size = 18
}: {
	/** File name without extension, e.g. "link", "reload", "checkmark". */
	name: string;
	size?: number;
} = $props();

const svg = $derived(modules[`./svg/${name}.svg`]);
</script>

{#if svg}
	<span class="icon" style="--icon-size:{size}px" aria-hidden="true">{@html svg}</span>
{/if}

<style>
	.icon {
		display: inline-flex;
		flex: none;
		line-height: 0;
	}
	.icon :global(svg) {
		width: var(--icon-size);
		height: var(--icon-size);
		display: block;
	}
</style>
