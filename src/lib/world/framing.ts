/**
 * How a block picks its sprite from its neighbours: Terraria 1.4.5's WorldGen.TileFrame,
 * TileFrameCosmetic and SquareTileFrame, for the blocks this little world has (dirt, stone,
 * grass, clay). The frame tables are converted from the game's code (./frame-tables.ts); the code
 * around them is ported here by hand, in the game's order, keeping its quirks: dirt reframes a
 * stone neighbour to ask whether that stone blends into it (through the game's global merge
 * flags), a block whose frame changes reframes its neighbours, and blocks within 5 of the
 * world's edge aren't framed unless a neighbour does it. Branches for blocks this world doesn't
 * have are left out, and say so.
 *
 * tools/verify checks this against the game's own code (compiled from the decompiled source),
 * over every 3x3 neighbourhood and many random worlds and edits: see tools/verify/README.md.
 * Frames are 16 px tiles on an 18 px grid in Images/Tiles_N.
 */
import { basicFrames, grassFrames, mergeFrames } from './frame-tables';

export const AIR = -1;
export const DIRT = 0;
export const STONE = 1;
export const GRASS = 2;
export const CLAY = 40;
/** Trees: forest trees, and the sakura and yellow willow (VanityTreeSakura, VanityTreeYellowWillow). */
export const TREE = 5;
export const TREES = [TREE, 596, 616];
/** Main.tileFrameImportant, for the tiles here: the trees. */
const FRAME_IMPORTANT = TREES;

/**
 * The game's data about these blocks (Main.tile* and TileID.Sets), as the game sets it up
 * (Main.Initialize_TileAndNPCData1/2). tools/verify checks these against the game's.
 */
export const TILE_DATA = {
	/** Main.tileSolid */
	solid: [DIRT, STONE, GRASS, CLAY],
	/** Main.tileBrick: bricks join up with each other. */
	brick: [STONE, GRASS],
	/** Main.tileMergeDirt: blends into dirt. */
	mergeDirt: [STONE, CLAY],
	/** TileID.Sets.Dirt */
	dirt: [DIRT],
	/** TileID.Sets.Conversion.MergesWithDirtInASpecialWay: grass. */
	specialDirt: [GRASS],
	/** TileID.Sets.ChecksForMerge */
	checksForMerge: [DIRT, GRASS],
	/** TileID.Sets.NeedsGrassFramingDirt[GRASS]: what grass grows on. */
	grassDirt: DIRT
};
const is = (set: number[]) => (type: number) => type > -1 && set.includes(type);
const isSolid = is(TILE_DATA.solid);
const isBrick = is(TILE_DATA.brick);
const mergesDirt = is(TILE_DATA.mergeDirt);
const isDirt = is(TILE_DATA.dirt);
const isSpecialDirt = is(TILE_DATA.specialDirt);
const checksForMerge = is(TILE_DATA.checksForMerge);
export { isSolid };

export interface Neighbours {
	up: number;
	down: number;
	left: number;
	right: number;
	upLeft: number;
	upRight: number;
	downLeft: number;
	downRight: number;
}

/** Which sides a frame blends into dirt on (WorldGen.mergeUp / Down / Left / Right). */
export interface Merge {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

/** Sets the frame to one of three, by the block's random variant. */
export type Pick = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => void;

const SIDES = [
	'up',
	'down',
	'left',
	'right',
	'upLeft',
	'upRight',
	'downLeft',
	'downRight'
] as const;

/** WorldGen.TileMergeAttempt(myType, bool[] lookfor, ...): neighbours in the set become myType. */
function mergeAttempt(n: Neighbours, myType: number, lookFor: (type: number) => boolean) {
	for (const side of SIDES) if (n[side] > -1 && lookFor(n[side])) n[side] = myType;
}

/** WorldGen.TileMergeAttempt(myType, int lookfor, ...): neighbours equal to lookfor become myType. */
function mergeAttemptValue(n: Neighbours, myType: number, lookFor: number) {
	for (const side of SIDES) if (n[side] === lookFor) n[side] = myType;
}

/** WorldGen.TileMergeAttemptWeird(myType, -1, Main.tileSolid, ...): non-solid neighbours are air. */
function dropNonSolid(n: Neighbours, myType: number) {
	for (const side of SIDES)
		if (n[side] > -1 && !isSolid(n[side]) && n[side] !== myType) n[side] = -1;
}

/**
 * Main.tile for the little world: each tile's type (kept when it's broken, like the game),
 * whether it's there, its frame and its random variant (frameNumber), which framing reads; and
 * its wall (a WallID, 0 for none) and liquid (an amount, and which liquid: 0 water, 1 lava, 2
 * honey, 3 shimmer). The game's code converted to TypeScript reads and writes these through
 * Tile views ($lib/world/gen/runtime).
 */
export class TileGrid {
	readonly type: Int16Array;
	readonly active: Uint8Array;
	readonly frameX: Int16Array;
	readonly frameY: Int16Array;
	readonly frameNumber: Uint8Array;
	readonly wall: Uint16Array;
	readonly liquid: Uint8Array;
	readonly liquidType: Uint8Array;

	/** WorldGen.mergeUp etc.: set by the last frame picked, read by dirt beside stone. */
	readonly merge: Merge = { up: false, down: false, left: false, right: false };
	/** WorldGen.tileReframeCount: how deep neighbours reframing neighbours has gone. */
	#reframeCount = 0;

	constructor(
		readonly width: number,
		readonly height: number
	) {
		const n = width * height;
		this.type = new Int16Array(n);
		this.active = new Uint8Array(n);
		this.frameX = new Int16Array(n);
		this.frameY = new Int16Array(n);
		this.frameNumber = new Uint8Array(n);
		this.wall = new Uint16Array(n);
		this.liquid = new Uint8Array(n);
		this.liquidType = new Uint8Array(n);
	}

	/** The block at (i, j), AIR if none (or outside the world). */
	at(i: number, j: number): number {
		if (i < 0 || j < 0 || i >= this.width || j >= this.height) return AIR;
		const k = j * this.width + i;
		return this.active[k] ? this.type[k] : AIR;
	}

	// ---- The game's ways of changing tiles (also the operations tools/verify replays) -----------

	/** Frames every tile, column by column. */
	frameAll() {
		for (let i = 0; i < this.width; i++) for (let j = 0; j < this.height; j++) this.tileFrame(i, j);
	}

	/** WorldGen.PlaceTile for a block: a fresh tile (frame 0, 0), framed with variant `v`. */
	place(i: number, j: number, type: number, v: number) {
		const k = j * this.width + i;
		this.type[k] = type;
		this.active[k] = 1;
		this.frameX[k] = 0;
		this.frameY[k] = 0;
		this.frameNumber[k] = v;
		this.squareTileFrame(i, j);
	}

	/** WorldGen.KillTile: the tile's gone (frame -1, -1; variant 0) and its neighbours reframe. */
	kill(i: number, j: number) {
		const k = j * this.width + i;
		this.active[k] = 0;
		this.frameX[k] = -1;
		this.frameY[k] = -1;
		this.frameNumber[k] = 0;
		this.squareTileFrame(i, j);
	}

	/** KillTile's failed hit on grass: it becomes dirt, with a new variant `v`. */
	convert(i: number, j: number, type: number, v: number) {
		const k = j * this.width + i;
		this.type[k] = type;
		this.frameNumber[k] = v;
		this.squareTileFrame(i, j);
	}

	/**
	 * WorldGen.SquareTileFrame: frames the 3x3 around (i, j). (The game's reset re-rolls the
	 * centre's variant here; callers set it first, which is the same thing.)
	 */
	squareTileFrame(i: number, j: number) {
		for (let x = i - 1; x <= i + 1; x++) for (let y = j - 1; y <= j + 1; y++) this.tileFrame(x, y);
	}

	/**
	 * WorldGen.TileFrameImportant, for tiles framed by the game's own code (trees), once the
	 * world's being played ($lib/world/gen: play). Until then their frames are left as they are.
	 */
	frameImportant?: (i: number, j: number) => void;

	/** WorldGen.TileFrame: not within 5 of the edge; only blocks that are there. */
	tileFrame(i: number, j: number) {
		if (i <= 5 || j <= 5 || i >= this.width - 5 || j >= this.height - 5) return;
		const k = j * this.width + i;
		if (!this.active[k]) return;
		if (FRAME_IMPORTANT.includes(this.type[k])) {
			this.frameImportant?.(i, j);
			return;
		}
		// Not frame-important, solid, not falling: on to TileFrameCosmetic.
		this.tileFrameCosmetic(i, j);
	}

	/** WorldGen.TileFrameCosmetic. */
	tileFrameCosmetic(i: number, j: number) {
		const W = this.width;
		if (i <= 0 || j <= 0 || i >= W - 1 || j >= this.height - 1) return;
		const k = j * W + i;
		if (!this.active[k]) return;
		const num = this.type[k]; // no Main.tileStone types here
		if (FRAME_IMPORTANT.includes(num)) return;
		const frameX = this.frameX[k];
		const frameY = this.frameY[k];
		const n: Neighbours = {
			up: this.at(i, j - 1),
			down: this.at(i, j + 1),
			left: this.at(i - 1, j),
			right: this.at(i + 1, j),
			upLeft: this.at(i - 1, j - 1),
			upRight: this.at(i + 1, j - 1),
			downLeft: this.at(i - 1, j + 1),
			downRight: this.at(i + 1, j + 1)
		};
		// No slopes, half blocks or Echo Coating here (so no culling).
		// TileMergeAttempt(0, TileID.Sets.Dirt): dirt is already 0.
		// Bricks join each other (not mud, ash or snow types).
		if (isBrick(num)) mergeAttempt(n, num, isBrick);
		const merge = this.merge;
		merge.up = merge.down = merge.left = merge.right = false;
		const variant = this.frameNumber[k];
		// No large-frame, merge-all or forced-dirt-merging blocks here.

		if (isDirt(num)) {
			// Dirt asks a neighbour that blends into dirt (stone) whether it does, by framing it.
			if (n.up > -1 && mergesDirt(n.up)) {
				this.tileFrame(i, j - 1);
				if (merge.down) n.up = num;
			}
			if (n.down > -1 && mergesDirt(n.down)) {
				this.tileFrame(i, j + 1);
				if (merge.up) n.down = num;
			}
			if (n.left > -1 && mergesDirt(n.left)) {
				this.tileFrame(i - 1, j);
				if (merge.right) n.left = num;
			}
			if (n.right > -1 && mergesDirt(n.right)) {
				this.tileFrame(i + 1, j);
				if (merge.left) n.right = num;
			}
			// Grass joins dirt; so do diagonal blocks that blend into dirt.
			for (const side of ['up', 'down', 'left', 'right'] as const)
				if (n[side] > -1 && isSpecialDirt(n[side])) n[side] = num;
			for (const side of ['upLeft', 'upRight', 'downLeft', 'downRight'] as const) {
				if (n[side] > -1 && mergesDirt(n[side])) n[side] = num;
				else if (n[side] > -1 && isSpecialDirt(n[side])) n[side] = num;
			}
			// Dirt, mud, sand (191) and forced-dirt merges: none that change anything here.
		}
		if (mergesDirt(num)) {
			// Stone blends into dirt (and into mud and ash, which aren't here).
			mergeAttempt(n, -2, isDirt);
		}
		// Moss, ore, sand, snow and mud merges: none of those blocks here.

		const v = { x: -1, y: -1 };
		const pick: Pick = (x0, y0, x1, y1, x2, y2) => {
			[v.x, v.y] = variant === 0 ? [x0, y0] : variant === 1 ? [x1, y1] : [x2, y2];
		};
		let flag7 = false;
		if (num === GRASS) {
			flag7 = true;
			dropNonSolid(n, num);
			const D = TILE_DATA.grassDirt;
			// TileMergeAttempt(D, 23): no corrupt grass here.
			grassFrames(num, D, i, j, n, pick);
			if (isDirt(D)) mergeAttempt(n, -2, isDirt);
		}
		// TileMergeAttempt(num, Main.tileMerge[num]): nothing for these blocks.
		if (v.x === -1 && v.y === -1 && (mergesDirt(num) || checksForMerge(num))) {
			if (!flag7) {
				flag7 = true;
				dropNonSolid(n, num);
			}
			if (n.up > -1 && n.up !== num) n.up = -1;
			if (n.down > -1 && n.down !== num) n.down = -1;
			if (n.left > -1 && n.left !== num) n.left = -1;
			if (n.right > -1 && n.right !== num) n.right = -1;
			mergeFrames(num, n, merge, pick);
		}
		// No slope frames for these blocks.
		if (v.x < 0 || v.y < 0) {
			// (The game sets flag7 here too; nothing reads it after.)
			if (!flag7) dropNonSolid(n, num);
			if (num === GRASS) mergeAttemptValue(n, num, -2);
			basicFrames(num, n, pick);
		}
		if (v.x <= -1 || v.y <= -1) {
			if (variant <= 0) [v.x, v.y] = [18, 18];
			else if (variant === 1) [v.x, v.y] = [36, 18];
			if (variant >= 2) [v.x, v.y] = [54, 18];
		}
		this.frameX[k] = v.x;
		this.frameY[k] = v.y;
		// A frame that changed (both ways) reframes the neighbours, up to 25 deep.
		if (v.x !== frameX && v.y !== frameY && frameX >= 0 && frameY >= 0) {
			this.#reframeCount++;
			if (this.#reframeCount < 25) {
				const saved = { ...merge };
				this.tileFrameCosmetic(i - 1, j);
				this.tileFrameCosmetic(i + 1, j);
				this.tileFrameCosmetic(i, j - 1);
				this.tileFrameCosmetic(i, j + 1);
				Object.assign(merge, saved);
			}
			this.#reframeCount--;
		}
	}
}
