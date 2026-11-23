import { error } from '@sveltejs/kit';
import { DEV_TOOLS } from '$lib/devtools';

// Component gallery, only with dev tools on (src/lib/devtools.ts).
export const prerender = DEV_TOOLS;

export function load() {
	if (!DEV_TOOLS) error(404);
}
