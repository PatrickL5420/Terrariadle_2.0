/**
 * The item use port ($lib/world/item-check, with $lib/world/hit-tile and the player) against the
 * game's own Player.ItemCheck, frame by frame, on random worlds, keys and cursors. VERIFY_USES
 * sets how many (default 3,000); VERIFY_SEED their seed. RECORD=1 saves a sample for the normal
 * tests.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '$lib/world/item-check';
import { seeded } from './lib/compare';
import { oracle, oracleBuilt } from './lib/oracle';
import { verify } from './lib/verify';
import {
	froundItemFrames,
	randomItemUse,
	runItemUse,
	type ItemFrame,
	type ItemUseCase
} from './features/itemuse';

const USES = Number(process.env.VERIFY_USES ?? 3_000);
const SEED = Number(process.env.VERIFY_SEED ?? 1);

function* uses(): Generator<ItemUseCase> {
	const rand = seeded(SEED);
	for (let n = 0; n < USES; n++) yield randomItemUse(rand);
}

it('the random cases cover everything item use does', () => {
	const rand = seeded(SEED);
	const seen: Record<string, number> = {};
	const count = (k: string) => (seen[k] = (seen[k] ?? 0) + 1);
	for (let n = 0; n < 300; n++) {
		const c = randomItemUse(rand);
		const frames = runItemUse(c);
		frames.forEach((fr: ItemFrame, k) => {
			const prev = frames[k - 1];
			if (fr.itemAnimation === fr.itemAnimationMax - 1) count('swing');
			if (prev && prev.itemAnimation === 1 && fr.itemAnimation > 1) count('auto-reuse');
			if (fr.drops.length) count('block broken');
			if (fr.drops.some((d) => d.type === 9)) count('tree felled');
			if (fr.tiles.some((t) => t[2] === 4)) count('torch placed');
			if (fr.tiles.some((t) => [14, 15, 18].includes(t[2]))) count('furniture placed');
			if (fr.tiles.some((t) => t[6] === 4)) count('wall placed');
			if (c.item === 3506 && fr.hits.length && !fr.drops.length && fr.sounds.length)
				count('tree hit');
			if (fr.sounds.some((s) => s.type === 21)) count('stone hit');
			if (c.item === 3509 && fr.tiles.some((t) => t[2] === 0) && !fr.drops.length)
				count('grass knocked to dirt');
			if (prev && fr.stack < prev.stack) count('block placed');
			if (prev && prev.stack > 0 && fr.stack === 0) count('stack used up');
			if (c.item !== 3509 && fr.tiles.some((t) => t[2] === 0) && fr.stack < (prev?.stack ?? 0))
				count('placed beside grass');
			if (
				prev &&
				fr.hits.some((h) => prev.hits.some((q) => q[0] === h[0] && q[1] === h[1] && q[2] > h[2]))
			)
				count('damage wearing off');
			if (fr.itemAnimation > 0 && prev && fr.direction !== prev.direction) count('turn mid-swing');
			const [keys, tx, ty] = c.frames[k];
			if (keys & 8 && fr.itemTime === 0 && fr.itemAnimation > 0 && !fr.tiles.length && tx && ty)
				count('use with nothing done');
		});
	}
	for (const kind of [
		'swing',
		'auto-reuse',
		'block broken',
		'tree felled',
		'torch placed',
		'furniture placed',
		'wall placed',
		'tree hit',
		'stone hit',
		'grass knocked to dirt',
		'block placed',
		'stack used up',
		'placed beside grass',
		'damage wearing off',
		'turn mid-swing',
		'use with nothing done'
	])
		expect(seen[kind] ?? 0, `${kind}: ${JSON.stringify(seen)}`).toBeGreaterThan(10);
});

describe.skipIf(!oracleBuilt)('item use = Player.ItemCheck', () => {
	it('the items are the game’s', () => {
		const fields = [
			'useStyle',
			'useAnimation',
			'useTime',
			'autoReuse',
			'useTurn',
			'consumable',
			'createTile',
			'createWall',
			'pick',
			'axe',
			'tileBoost',
			'scale'
		] as const;
		for (const type of [2, 3, 8, 9, 32, 34, 36, 93, 133, 3509, 3506]) {
			const [game] = oracle<object, Record<string, unknown>>('item', [{ type, fields }]);
			const port = Object.fromEntries(fields.map((k) => [k, ITEMS[type][k]]));
			expect(port, `item ${type}`).toEqual(game);
		}
	});

	it(`${USES} random uses, every frame`, () => {
		const n = verify({
			name: 'item use',
			feature: 'itemuse',
			cases: uses(),
			port: (c: ItemUseCase) => runItemUse(c),
			game: froundItemFrames,
			batch: 300,
			fixture: {
				file: fileURLToPath(new URL('../../src/lib/world/fixtures/itemuse.json', import.meta.url)),
				every: Math.ceil(USES / 4)
			}
		});
		expect(n).toBe(USES);
	});
});
