import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Component gallery for `npm run dev` only.
export const prerender = false;

export function load() {
	if (!dev) error(404);
}
