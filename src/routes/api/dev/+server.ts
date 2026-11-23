import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { dayNumber } from '$lib/engine/daily';
import { answerPool, games, getEntry } from '$lib/games';
import { answerFor, gameOr404, scheduledAnswer } from '$lib/server/answers';
import { resetSolves, solveCount } from '$lib/server/counter';
import { assertDev, currentDay, devState, overrideFor, saveDevState } from '$lib/server/dev';
import type { RequestHandler } from './$types';

/**
 * Developer tools API. Every handler starts with assertDev(), so in a production build this
 * route only ever answers 404. Running project scripts only works locally.
 */
export const prerender = false;

const SCHEDULE_DAYS = 14;

/** GET: the current day, every game's answer, and the upcoming schedule. */
export const GET: RequestHandler = async ({ setHeaders }) => {
	assertDev();
	setHeaders({ 'cache-control': 'no-store' });
	const day = currentDay();

	return json({
		day,
		realDay: dayNumber(),
		dayOffset: devState.dayOffset,
		games: await Promise.all(
			games.map(async (game) => {
				const answer = answerFor(game, day);
				return {
					slug: game.slug,
					title: game.title,
					answer: { id: answer.id, name: answer.name, image: answer.image },
					overridden: overrideFor(game.slug, day) !== undefined,
					solved: await solveCount(game.slug, day),
					poolSize: answerPool(game).length,
					schedule: Array.from({ length: SCHEDULE_DAYS }, (_, i) => {
						const e = scheduledAnswer(game, day + i + 1);
						return { day: day + i + 1, id: e.id, name: e.name };
					})
				};
			})
		)
	});
};

// Project scripts the panel can run. Fixed list: the client only ever sends a key.
const TASKS: Record<string, string[]> = {
	'sync-wiki': ['node', 'scripts/sync-wiki.mjs'],
	'sync-wiki-write': ['node', 'scripts/sync-wiki.mjs', '--write'],
	'fetch-images': ['node', 'scripts/fetch-images.mjs'],
	test: ['npx', 'vitest', 'run', '--reporter=dot'],
	check: ['npx', 'svelte-check', '--tsconfig', './tsconfig.json', '--output', 'human']
};

function runTask(cmd: string[]): Promise<{ code: number | null; output: string }> {
	return new Promise((resolve) => {
		const env: Record<string, string | undefined> = {
			...process.env,
			NO_COLOR: '1',
			FORCE_COLOR: '0',
			NODE_NO_WARNINGS: '1'
		};
		// Node's fetch ignores HTTPS_PROXY unless asked; harmless when no proxy is set.
		if (env.HTTPS_PROXY || env.https_proxy) env.NODE_USE_ENV_PROXY = '1';
		const child = spawn(cmd[0], cmd.slice(1), { cwd: process.cwd(), env });
		let output = '';
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		const timer = setTimeout(() => child.kill(), 180_000);
		child.on('close', (code) => {
			clearTimeout(timer);
			// eslint-disable-next-line no-control-regex
			resolve({ code, output: output.replace(/\u001b\[[0-9;]*m/g, '').trim() });
		});
		child.on('error', (e) => {
			clearTimeout(timer);
			resolve({ code: 1, output: String(e) });
		});
	});
}

type Action =
	| { action: 'reroll'; slug: string; id?: number }
	| { action: 'clear-override'; slug: string }
	| { action: 'shift-day'; delta: number }
	| { action: 'reset-day' }
	| { action: 'reset-solves'; slug?: string }
	| { action: 'run'; task: string };

/** POST: change dev state or run a project task. */
export const POST: RequestHandler = async ({ request }) => {
	assertDev();
	const body = (await request.json()) as Action;
	const day = currentDay();

	switch (body.action) {
		case 'reroll': {
			const game = gameOr404(body.slug);
			let id = body.id;
			if (id === undefined) {
				// Random answer from the pool, different from the current one.
				const pool = answerPool(game).filter((p) => p !== answerFor(game, day).id);
				id = pool[Math.floor(Math.random() * pool.length)];
			}
			if (!getEntry(game, id)) error(400, `Unknown ${game.noun}`);
			devState.overrides[game.slug] = { day, id };
			await saveDevState();
			return json({ ok: true, answer: getEntry(game, id)!.name });
		}
		case 'clear-override':
			delete devState.overrides[body.slug];
			await saveDevState();
			return json({ ok: true });
		case 'shift-day':
			devState.dayOffset += Math.trunc(body.delta);
			await saveDevState();
			return json({ ok: true, day: currentDay() });
		case 'reset-day':
			devState.dayOffset = 0;
			await saveDevState();
			return json({ ok: true, day: currentDay() });
		case 'reset-solves':
			for (const g of games) {
				if (!body.slug || g.slug === body.slug) await resetSolves(g.slug, day);
			}
			return json({ ok: true });
		case 'run': {
			if (!dev) error(400, 'Tasks only run under npm run dev');
			const cmd = TASKS[body.task];
			if (!cmd) error(400, 'Unknown task');
			return json(await runTask(cmd));
		}
		default:
			error(400, 'Unknown action');
	}
};
