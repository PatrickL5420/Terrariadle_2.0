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

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	}
});
