import type { TileMap } from './collision';
import { AIR, isSolid, SOLID_TOP, TileGrid } from './framing';

/**
 * Columns of real ground kept beyond each side of what's shown, and rows below it. The game
 * doesn't frame blocks within 5 of the world's edge, and a block frames against what's beside
 * it, so the shown world is a window into a slightly bigger one, as in the game.
 */
export const MARGIN = 6;

/**
 * The little world's tiles (Main.tile): blocks, framed like the game (./framing), and a dirt
 * wall behind the ground. Columns MARGIN to width - MARGIN - 1, rows 0 to height - MARGIN - 1,
 * are shown; the player and items are kept in there (its sides and floor are solid).
 */
export class Tiles extends TileGrid implements TileMap {
	/** Each wall's random variant (the walls are TileGrid.wall: only dirt walls, 2, here). */
	readonly wallVariant: Uint8Array;
	/** Tiles to keep (part of something built): the player doesn't dig through them. */
	kept?: (i: number, j: number) => boolean;
	/** Tiles to keep clear (inside something built): the player doesn't build in them. */
	keepClear?: (i: number, j: number) => boolean;

	constructor(width: number, height: number, rand: (n: number) => number) {
		super(width, height);
		this.wallVariant = Uint8Array.from({ length: width * height }, () => rand(3));
	}

	/** Main.maxTilesX / maxTilesY for collision: the game only collides above maxTilesY - 40,
	 * and a real world goes on far below, so this one says it's 40 rows deeper than it is. */
	get maxTilesX() {
		return this.width;
	}

	get maxTilesY() {
		return this.height + 40;
	}

	/** Whether (i, j) is in the part that's shown. */
	inView(i: number, j: number) {
		return i >= MARGIN && i < this.width - MARGIN && j >= 0 && j < this.height - MARGIN;
	}

	/** Whether the player and items stand on / bump into (i, j). The view's sides and floor are solid. */
	solid(i: number, j: number): boolean {
		if (i < MARGIN || i >= this.width - MARGIN || j >= this.height - MARGIN) return true;
		return isSolid(this.at(i, j));
	}

	/** Collision's solid tops (tables, work benches): 2 on their top row, 1 below it, 0 if none. */
	solidTop(i: number, j: number): 0 | 1 | 2 {
		if (!SOLID_TOP.includes(this.at(i, j))) return 0;
		return this.frameY[j * this.width + i] === 0 ? 2 : 1;
	}

	/** Whether (i, j) has a wall: off the sides and bottom, the walls go on. */
	hasWall(i: number, j: number) {
		if (j < 0) return false;
		if (i < 0 || i >= this.width || j >= this.height) return true;
		return this.wall[j * this.width + i] > 0;
	}

	/**
	 * Framing.WallFrame: the wall's 32x32 frame (on a 36 px grid) by which neighbours have walls.
	 * Walls use the same layout as a block's basic frames, at twice the size.
	 */
	wallFrame(i: number, j: number): [number, number] {
		const v = this.wallVariant[j * this.width + i];
		const up = this.hasWall(i, j - 1);
		const down = this.hasWall(i, j + 1);
		const left = this.hasWall(i - 1, j);
		const right = this.hasWall(i + 1, j);
		let f: [number, number];
		if (up && down && left && right) f = [18 + v * 18, 18];
		else if (!up && down && left && right) f = [18 + v * 18, 0];
		else if (up && !down && left && right) f = [18 + v * 18, 36];
		else if (up && down && !left && right) f = [0, v * 18];
		else if (up && down && left && !right) f = [72, v * 18];
		else if (!up && down && !left && right) f = [v * 36, 54];
		else if (!up && down && left && !right) f = [18 + v * 36, 54];
		else if (up && !down && !left && right) f = [v * 36, 72];
		else if (up && !down && left && !right) f = [18 + v * 36, 72];
		else if (up && down) f = [90, v * 18];
		else if (left && right) f = [108 + v * 18, 72];
		else f = [162 + v * 18, 54];
		return [f[0] * 2, f[1] * 2];
	}

	/** A copy `rows` taller (or shorter), the new rows added (or taken away) at the top. */
	resized(rows: number, rand: (n: number) => number): Tiles {
		const d = rows - this.height;
		const t = new Tiles(this.width, rows, rand);
		const arrays = [
			'type',
			'active',
			'frameX',
			'frameY',
			'frameNumber',
			'wall',
			'liquid',
			'liquidType',
			'wallVariant'
		] as const;
		for (let j = 0; j < rows; j++) {
			const oj = j - d;
			if (oj < 0 || oj >= this.height) continue;
			for (const a of arrays)
				t[a].set(this[a].subarray(oj * this.width, (oj + 1) * this.width), j * this.width);
		}
		return t;
	}
}

export { AIR };
