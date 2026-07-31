<script lang="ts">
import { onMount } from 'svelte';
import { setCookie } from '$lib/cookie';

let { currentTheme }: { currentTheme: Theme } = $props();

onMount(() => {
	addThemeToHTMLTag(currentTheme);
});

function addThemeToHTMLTag(theme: Theme) {
	document.documentElement.classList.remove(
		'color-scheme-light',
		'color-scheme-dark',
		'color-scheme-system'
	);
	document.documentElement.classList.add(`color-scheme-${theme}`);
}

function updateTheme(theme: Theme) {
	currentTheme = theme;
	setCookie('theme', currentTheme);
	addThemeToHTMLTag(theme);
}
</script>

<svelte:head>
	<meta name="color-scheme" content={currentTheme === 'system' ? 'light dark' : currentTheme} />
</svelte:head>

<fieldset class="theme-switcher">
	<legend class="sr-only">Anzeige wählen:</legend>
	<span class="theme-option">
		<input
			aria-label="System"
			id="theme-switch-system"
			name="theme-option"
			type="radio"
			value="system"
			bind:group={currentTheme}
			onchange={() => updateTheme('system')}
		/>
		<label for="theme-switch-system">
			<span class="sr-only">System</span>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path
					fill-rule="evenodd"
					clip-rule="evenodd"
					d="M4.5 1C3.67157 1 3 1.67157 3 2.5V15.75C3 16.5784 3.67157 17.25 4.5 17.25H13.5C14.3284 17.25 15 16.5784 15 15.75V2.5C15 1.67157 14.3284 1 13.5 1H4.5ZM4.5 2.5L13.5 2.5V15.75H4.5V2.5ZM9 14.5C9.55228 14.5 10 14.0523 10 13.5C10 12.9477 9.55228 12.5 9 12.5C8.44772 12.5 8 12.9477 8 13.5C8 14.0523 8.44772 14.5 9 14.5Z"
					fill="currentColor"
				/>
			</svg>
		</label>
	</span>
	<span class="theme-option">
		<input
			aria-label="Hell"
			id="theme-switch-light"
			name="theme-option"
			type="radio"
			value="light"
			bind:group={currentTheme}
			onchange={() => updateTheme('light')}
		/>
		<label for="theme-switch-light">
			<span class="sr-only">Hell</span>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path
					fill-rule="evenodd"
					clip-rule="evenodd"
					d="M9.75 3.5V1H8.25V3.5H9.75ZM2.81282 3.87348L4.58058 5.64124L5.64124 4.58058L3.87348 2.81282L2.81282 3.87348ZM14.1265 2.8133L12.3588 4.58107L13.4194 5.64173L15.1872 3.87396L14.1265 2.8133ZM3.5 8.25H1V9.75H3.5V8.25ZM17 8.25H14.5V9.75H17V8.25ZM12.3588 13.4194L14.1265 15.1872L15.1872 14.1265L13.4194 12.3588L12.3588 13.4194ZM4.58058 12.3592L2.81282 14.127L3.87348 15.1877L5.64124 13.4199L4.58058 12.3592ZM9.75 17V14.5H8.25V17H9.75ZM6.5 9C6.5 7.61929 7.61929 6.5 9 6.5C10.3807 6.5 11.5 7.61929 11.5 9C11.5 10.3807 10.3807 11.5 9 11.5C7.61929 11.5 6.5 10.3807 6.5 9ZM9 5C6.79086 5 5 6.79086 5 9C5 11.2091 6.79086 13 9 13C11.2091 13 13 11.2091 13 9C13 6.79086 11.2091 5 9 5Z"
					fill="currentColor"
				/>
			</svg>
		</label>
	</span>
	<span class="theme-option">
		<input
			aria-label="Dunkel"
			id="theme-switch-dark"
			name="theme-option"
			type="radio"
			value="dark"
			bind:group={currentTheme}
			onchange={() => updateTheme('dark')}
		/>
		<label for="theme-switch-dark">
			<span class="sr-only">Dunkel</span>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path
					d="M1.75 9.00039C1.75 5.84041 3.77221 3.15169 6.59304 2.15929C5.81481 5.09424 6.64182 8.24237 9.06765 10.0394C11.1189 11.559 13.7493 11.6889 16.0476 10.709C15.2796 13.8884 12.4155 16.2504 9 16.2504C4.99594 16.2504 1.75 13.0045 1.75 9.00039Z"
					stroke="currentColor"
					stroke-width="1.5"
				/>
			</svg>
		</label>
	</span>
</fieldset>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.theme-switcher {
		display: flex;
		align-items: center;
		background-color: var(--z-ds-color-background-20, #dfdfe1);
		border-radius: calc(var(--z-ds-border-radius-8, 0.5rem) + 2px);
		border: 0;
		padding: 0;
	}

	.theme-option {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
	}

	.theme-option svg {
		width: 1rem;
		height: 1rem;
		opacity: 0.6;
		pointer-events: none;
	}

	.theme-option input[type='radio']:checked + label {
		background: var(--z-ds-color-background-0, #ffffff);
		border-radius: var(--z-ds-border-radius-8, 0.5rem);
		color: var(--z-ds-color-text-100, #252525);
	}

	.theme-option input[type='radio']:checked + label svg {
		opacity: 1;
	}

	input[type='radio'] {
		opacity: 0;
		position: absolute;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	label {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2rem;
		color: var(--z-ds-color-text-70, #444444);
	}
</style>
