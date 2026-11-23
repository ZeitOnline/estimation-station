<script lang="ts">
import { onMount } from 'svelte';
import {
	type Avatar as AvatarConfig,
	type ColorKey,
	fromSeed,
	LABEL,
	PAL,
	T,
	type TraitKey
} from '#lib/poker/avatar.js';
import Avatar from './Avatar.svelte';

// Edits are pushed out through `onchange` right away (so the room sees them
// live); `onchange(null)` means "back to the default for my name".
let {
	name,
	avatar,
	onchange,
	onclose
}: {
	name: string;
	avatar: AvatarConfig | null;
	onchange: (avatar: AvatarConfig | null) => void;
	onclose: () => void;
} = $props();

const TRAITS: [TraitKey, string][] = [
	['style', 'Figur'],
	['eyes', 'Augen'],
	['mouth', 'Mund'],
	['hat', 'Kopfbedeckung'],
	['hair', 'Bart'],
	['acc', 'Requisit'],
	['extra', 'Extra']
];
const COLORS: [ColorKey, string][] = [
	['body', 'Körper'],
	['hairC', 'Bart'],
	['hatC', 'Hut & Requisit'],
	['bg', 'Hintergrund']
];

const current = $derived(avatar ?? fromSeed(name));

let dialog: HTMLDialogElement;
onMount(() => dialog.showModal());

function step(key: TraitKey, dir: number) {
	const list = T[key];
	const next = list[(list.indexOf(current[key]) + dir + list.length) % list.length];
	onchange({ ...current, [key]: next });
}

function shuffle() {
	onchange(fromSeed(name, `#${Math.random()}`));
}
</script>

<dialog
	bind:this={dialog}
	class="editor"
	aria-label="Avatar anpassen"
	{onclose}
	onclick={(e) => {
		// a click on the backdrop lands on the <dialog> itself
		if (e.target === dialog) dialog.close();
	}}
>
	<div class="editor__body">
		<div class="editor__preview">
			<div class="editor__avatar"><Avatar {name} avatar={current} /></div>
			<div class="editor__actions">
				<button onclick={shuffle}>Würfeln</button>
				<button class="quiet" onclick={() => onchange(null)} disabled={!avatar}>Standard</button>
			</div>
		</div>

		<div class="editor__controls">
			{#each TRAITS as [key, label] (key)}
				<div class="trait">
					<button class="step" onclick={() => step(key, -1)} aria-label="{label}: zurück">‹</button>
					<span class="trait__text">
						<small>{label}</small>
						<b>{LABEL[key][current[key]]}</b>
					</span>
					<button class="step" onclick={() => step(key, 1)} aria-label="{label}: weiter">›</button>
				</div>
			{/each}

			{#each COLORS as [key, label] (key)}
				<div class="colors">
					<small>{label}</small>
					<div class="swatches">
						{#each PAL[key] as color (color)}
							<button
								class="swatch"
								style:background={color}
								aria-label="{label}: {color}"
								aria-pressed={current[key] === color}
								onclick={() => onchange({ ...current, [key]: color })}
							></button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="editor__foot">
		<button onclick={() => dialog.close()}>Fertig</button>
	</div>
</dialog>

<style>
	.editor {
		/* the global reset zeroes margins, which un-centres a modal dialog */
		margin: auto;
		width: min(34rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		padding: var(--z-ds-space-l, 1.5rem);
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: var(--z-ds-radius-m, 8px);
		background: var(--z-ds-color-background-0, #ffffff);
		color: var(--z-ds-color-text-100, #252525);
	}

	.editor::backdrop {
		background: rgb(0 0 0 / 0.5);
	}

	.editor__body {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		gap: var(--z-ds-space-l, 1.5rem);
	}

	@media (max-width: 30rem) {
		.editor__body {
			grid-template-columns: 1fr;
		}
		.editor__preview {
			justify-self: center;
		}
	}

	.editor__preview {
		width: 9rem;
	}

	.editor__actions {
		display: flex;
		flex-direction: column;
		gap: var(--z-ds-space-xs, 0.5rem);
		margin-top: var(--z-ds-space-m, 1rem);
	}

	.editor__controls {
		display: flex;
		flex-direction: column;
		gap: var(--z-ds-space-xs, 0.5rem);
	}

	.editor__foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--z-ds-space-l, 1.5rem);
	}

	button {
		font: inherit;
		cursor: pointer;
	}

	.editor__actions button,
	.editor__foot button {
		padding: var(--z-ds-space-xs, 0.5rem) var(--z-ds-space-m, 1rem);
		border: 1px solid var(--z-ds-color-text-100, #252525);
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
	}

	.editor__actions button.quiet {
		background: none;
		color: inherit;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.trait {
		display: flex;
		align-items: center;
		gap: var(--z-ds-space-xs, 0.5rem);
		padding: 0.25rem;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: var(--z-ds-radius-s, 6px);
	}

	.trait__text {
		flex: 1;
		min-width: 0;
		text-align: center;
		line-height: 1.2;
	}

	small {
		display: block;
		font-size: var(--z-ds-font-size-xs, 0.8rem);
		color: var(--z-ds-color-text-55, #69696c);
	}

	.step {
		flex: none;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: var(--z-ds-radius-s, 6px);
		background: none;
		color: inherit;
		line-height: 1;
	}

	.colors {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		align-items: center;
		gap: var(--z-ds-space-xs, 0.5rem);
		margin-top: 0.25rem;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.swatch {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 1px solid var(--z-ds-color-border-100, #cccccf);
		border-radius: 50%;
	}

	.swatch[aria-pressed='true'] {
		box-shadow:
			0 0 0 2px var(--z-ds-color-background-0, #ffffff),
			0 0 0 4px var(--z-ds-color-text-100, #252525);
	}
</style>
