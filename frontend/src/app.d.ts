// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	// Injected at build time from package.json via vite.config.ts `define`.
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
