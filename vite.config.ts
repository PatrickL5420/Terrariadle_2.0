import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'child_process';
import { defineConfig } from 'vite';

function appVersion(): string {
	const sha = process.env.VERCEL_GIT_COMMIT_SHA;
	if (sha) return sha.slice(0, 7);
	try {
		return execSync('git describe --tags --always').toString().trim();
	} catch {
		return 'dev';
	}
}

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion()),
		// Dev tools: on under `npm run dev` and on Vercel preview deployments. A literal, so
		// production builds drop the tools entirely (see src/lib/devtools.ts).
		__DEV_TOOLS__: JSON.stringify(command === 'serve' || process.env.VERCEL_ENV === 'preview')
	}
}));
