import type { Handle } from '@sveltejs/kit';
import { DEV_TOOLS } from '$lib/devtools';
import { loadDevState } from '$lib/server/dev';

export const handle: Handle = async ({ event, resolve }) => {
	if (DEV_TOOLS && event.url.pathname.startsWith('/api/')) await loadDevState();
	return resolve(event);
};
