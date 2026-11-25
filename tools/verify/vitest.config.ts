import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `npm run verify`: compares the ports in src/lib against the game's own code (the oracle).
 * Needs the oracle built first (see README.md); without it the suites are skipped.
 */
export default defineConfig({
	resolve: { alias: { $lib: fileURLToPath(new URL('../../src/lib', import.meta.url)) } },
	test: {
		include: ['tools/verify/**/*.verify.ts'],
		testTimeout: 30 * 60_000,
		hookTimeout: 5 * 60_000
	}
});
