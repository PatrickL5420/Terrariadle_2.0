import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { dayNumber } from '$lib/engine/daily';
import { answerPool, games, getEntry } from '$lib/games';
import {
	answerFor,
	gameOr404,
	puzzleFor,
	scheduledAnswer,
	scheduledPuzzle
} from '$lib/server/answers';
import { puzzlesFor } from '$lib/server/puzzles';
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
				// Puzzle games (Versiondle) reroll and show the puzzle: "Cloud in a Bottle (1.0)".
				const puzzles = puzzlesFor(game.slug);
				const puzzle = puzzleFor(game, day);
				return {
					slug: game.slug,
					title: game.title,
					answer: puzzle
						? { id: puzzle.id, name: `${puzzle.name} (${answer.name})`, image: puzzle.image }
						: { id: answer.id, name: answer.name, image: answer.image },
					/** What to guess to solve it. */
					solveId: answer.id,
					/** What the answer can be rerolled to, when it isn't the game's entries. */
					choices: puzzles?.map((p) => ({ id: p.id, name: p.name, image: p.image })),
					overridden: overrideFor(game.slug, day) !== undefined,
					solved: await solveCount(game.slug, day),
					poolSize: puzzles?.length ?? answerPool(game).length,
					schedule: Array.from({ length: SCHEDULE_DAYS }, (_, i) => {
						const d = day + i + 1;
						const p = scheduledPuzzle(game, d);
						const e = scheduledAnswer(game, d);
						return { day: d, id: p?.id ?? e.id, name: p ? `${p.name} (${e.name})` : e.name };
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
			// Puzzle games are rerolled to another puzzle, the rest to another entry.
			const puzzles = puzzlesFor(game.slug);
			const current = puzzles ? puzzleFor(game, day)!.id : answerFor(game, day).id;
			const pool = puzzles?.map((p) => p.id) ?? answerPool(game);
			let id = body.id;
			if (id === undefined) {
				// Random answer from the pool, different from the current one.
				const others = pool.filter((p) => p !== current);
				id = others[Math.floor(Math.random() * others.length)];
			}
			const name = puzzles ? puzzles.find((p) => p.id === id)?.name : getEntry(game, id)?.name;
			if (!name) error(400, `Unknown ${game.noun}`);
			devState.overrides[game.slug] = { day, id };
			await saveDevState();
			return json({ ok: true, answer: name });
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
