import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { dayNumber } from '$lib/engine/daily';

/**
 * Developer overrides, only ever active under `npm run dev`. In a production build `dev` is the
 * constant `false`, so none of this can change what real players see.
 *
 * Kept on globalThis so it survives Vite hot reloads of this module.
 */
interface DevState {
	/** Added to the real day number ("time travel"). */
	dayOffset: number;
	/** Forced answers: slug -> { day, id }. Only applies on that day. */
	overrides: Record<string, { day: number; id: number }>;
}

const g = globalThis as typeof globalThis & { __terrariadleDev?: DevState };
export const devState: DevState = (g.__terrariadleDev ??= { dayOffset: 0, overrides: {} });

export function assertDev() {
	if (!dev) error(404, 'Not found');
}

/** The day the game is currently on, including any dev time travel. */
export function currentDay(): number {
	return dayNumber() + (dev ? devState.dayOffset : 0);
}

export function overrideFor(slug: string, day: number): number | undefined {
	if (!dev) return undefined;
	const o = devState.overrides[slug];
	return o && o.day === day ? o.id : undefined;
}
