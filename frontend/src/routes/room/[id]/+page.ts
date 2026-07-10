import type { PageLoad } from './$types';

// Just hand the room id from the URL to the page. The realtime connection is
// opened client-side in +page.svelte (WebSockets don't run during SSR).
export const load: PageLoad = ({ params }) => {
	return { roomId: params.id };
};
