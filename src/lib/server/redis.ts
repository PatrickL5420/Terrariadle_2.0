import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { DEV_TOOLS } from '$lib/devtools';

/**
 * Upstash Redis over its REST API (works from any serverless function, no driver).
 * Vercel's Upstash integration sets KV_REST_API_*; a manual setup uses UPSTASH_REDIS_REST_*.
 */

export type Command = (string | number)[];

export function redisConfig() {
	const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
	return url && token ? { url, token } : null;
}

export async function redis(commands: Command[]): Promise<unknown[]> {
	const cfg = redisConfig()!;
	const res = await fetch(`${cfg.url}/pipeline`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(commands)
	});
	if (!res.ok) throw new Error(`Redis error ${res.status}`);
	const body = (await res.json()) as { result?: unknown; error?: string }[];
	return body.map((r) => {
		if (r.error) throw new Error(r.error);
		return r.result;
	});
}

// Local development and previews use their own keys, so their dev tools can never touch
// production data even when they share its Redis.
export const KEY_PREFIX = dev ? 'dev:' : DEV_TOOLS ? 'preview:' : '';
