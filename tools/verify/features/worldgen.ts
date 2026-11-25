/**
 * World generation: a seed, the world's size, the passes and the part to compare. The oracle
 * runs the game's own passes (oracle/features/WorldGenFeature.cs); this runs the converted ones
 * ($lib/world/gen).
 */
import { generate, PASSES } from '$lib/world/gen';

export interface WorldGenCase {
	seed: number;
	w: number;
	h: number;
	passes: string[];
	/** [x0, y0, x1, y1]: the tiles compared. */
	crop: [number, number, number, number];
}

export interface WorldGenResult {
	/** Row by row over the crop: the block (-1 for none), the wall, the liquid. */
	type: number[];
	wall: number[];
	liquid: number[];
	worldSurface: number;
	rockLayer: number;
	worldSurfaceLow: number;
	worldSurfaceHigh: number;
	rockLayerLow: number;
	rockLayerHigh: number;
}

export function runWorldGen(c: WorldGenCase): WorldGenResult {
	const g = generate(c.seed, c.w, c.h, c.passes);
	const [x0, y0, x1, y1] = c.crop;
	const type: number[] = [];
	const wall: number[] = [];
	const liquid: number[] = [];
	for (let j = y0; j < y1; j++)
		for (let i = x0; i < x1; i++) {
			const t = g.tiles.get(i, j);
			type.push(t.active_() ? t.type : -1);
			wall.push(t.wall);
			liquid.push(t.liquid);
		}
	const { tiles: _, ...heights } = g;
	return { type, wall, liquid, ...heights };
}

/** The site's world: 250 wide (the middle 150 used) and a small world's height, around the surface. */
export const worldGenCase = (seed: number): WorldGenCase => ({
	seed,
	w: 250,
	h: 1200,
	passes: [...PASSES],
	crop: [50, 150, 200, 400]
});

/** A short fingerprint of a result, for fixtures (FNV-1a over everything). */
export function fingerprint(r: WorldGenResult): string {
	let h = 0x811c9dc5;
	const mix = (n: number) => {
		h ^= n & 0xffff;
		h = Math.imul(h, 0x01000193);
	};
	for (const a of [r.type, r.wall, r.liquid]) for (const n of a) mix(n);
	return `${(h >>> 0).toString(16)} ${r.worldSurface} ${r.rockLayer} ${r.worldSurfaceLow} ${r.worldSurfaceHigh} ${r.rockLayerLow} ${r.rockLayerHigh}`;
}
