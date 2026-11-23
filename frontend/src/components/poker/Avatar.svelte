<script lang="ts">
import { type Avatar, avatarSvg, fromSeed, sanitizeAvatar } from '#lib/poker/avatar.js';

// `avatar` is a customised look; without one the avatar is derived from the
// name. It is re-validated here because it arrives from other clients and the
// SVG string is injected as markup.
let {
	name,
	avatar = null,
	label = name
}: { name: string; avatar?: Avatar | null; label?: string } = $props();

const markup = $derived(avatarSvg(sanitizeAvatar(avatar) ?? fromSeed(name), label));
</script>

<span class="avatar">{@html markup}</span>

<style>
	.avatar {
		display: block;
		width: 100%;
		aspect-ratio: 1;
	}

	.avatar :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
