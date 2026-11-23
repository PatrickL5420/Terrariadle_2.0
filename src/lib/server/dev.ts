import { error } from '@sveltejs/kit';
import { DEV_TOOLS } from '$lib/devtools';
import { dayNumber } from '$lib/engine/daily';
import { KEY_PREFIX, redis, redisConfig } from './redis';

/**
 * Developer overrides, only active when DEV_TOOLS is on (`npm run dev` and Vercel previews).
 * In a production build DEV_TOOLS is the constant `false`, so none of this can change what real
 * players see.
 *
 * Kept on globalThis so it survives Vite hot reloads of this module. On a preview, serverless
 * instances come and go, so it's also saved in Redis (when configured) and reloaded per request.
 */
interface DevState {
	/** Added to the real day number ("time travel"). */
	dayOffset: number;
	/** Forced answers: slug -> { day, id }. Only applies on that day. */
	overrides: Record<string, { day: number; id: number }>;
}

const g = globalThis as typeof globalThis & { __terrariadleDev?: DevState };
export const devState: DevState = (g.__terrariadleDev ??= { dayOffset: 0, overrides: {} });

const STATE_KEY = `${KEY_PREFIX}dev-state`;

export async function loadDevState() {
	if (!DEV_TOOLS || !redisConfig()) return;
	const [raw] = await redis([['GET', STATE_KEY]]);
	Object.assign(devState, { dayOffset: 0, overrides: {} }, raw ? JSON.parse(String(raw)) : {});
}

export async function saveDevState() {
	if (!DEV_TOOLS || !redisConfig()) return;
	await redis([['SET', STATE_KEY, JSON.stringify(devState)]]);
}

export function assertDev() {
	if (!DEV_TOOLS) error(404, 'Not found');
}

/** The day the game is currently on, including any dev time travel. */
export function currentDay(): number {
	return dayNumber() + (DEV_TOOLS ? devState.dayOffset : 0);
}

export function overrideFor(slug: string, day: number): number | undefined {
	if (!DEV_TOOLS) return undefined;
	const o = devState.overrides[slug];
	return o && o.day === day ? o.id : undefined;
}
