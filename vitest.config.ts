import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests only cover plain TypeScript (engine + data), so they skip the SvelteKit plugin.
// That keeps them fast and stops them rewriting .svelte-kit/ under a running dev server.
export default defineConfig({
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
