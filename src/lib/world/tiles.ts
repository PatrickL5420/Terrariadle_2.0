import { AIR, isSolid, pickFrame, STONE, type Merge, type Neighbours } from './framing';

const NO_MERGE: Merge = { up: false, down: false, left: false, right: false };

/**
 * The little world's blocks: a grid of tile types (Main.tile), each with the sprite frame it
 * shows (frameX / frameY, picked by ./framing like WorldGen.TileFrame) and its random variant
 * (frameNumber). Outside the grid counts as more of the same block at the sides and bottom (so
 * the edges frame as if the ground went on) and as air above.
 */
export class Tiles {
	readonly type: Int8Array;
	readonly frameX: Int16Array;
	readonly frameY: Int16Array;
	readonly variant: Uint8Array;
	readonly merge: Merge[];
	/** Whether there's a dirt wall behind (Main.tile.wall, wall 2 only), and its variant. */
	readonly wall: Uint8Array;
	readonly wallVariant: Uint8Array;

	constructor(
		readonly width: number,
		readonly height: number,
		rand: (n: number) => number = (n) => Math.floor(Math.random() * n)
	) {
		const n = width * height;
		this.type = new Int8Array(n).fill(AIR);
		this.frameX = new Int16Array(n);
		this.frameY = new Int16Array(n);
		this.variant = Uint8Array.from({ length: n }, () => rand(3));
		this.merge = Array.from({ length: n }, () => NO_MERGE);
		this.wall = new Uint8Array(n);
		this.wallVariant = Uint8Array.from({ length: n }, () => rand(3));
	}

	/** Whether (i, j) has a wall: off the sides and bottom, the walls go on. */
	hasWall(i: number, j: number) {
		if (j < 0) return false;
		if (!this.inWorld(i, j)) return true;
		return this.wall[j * this.width + i] === 1;
	}

	/**
	 * WorldGen.WallFrame: the wall's 32x32 frame (on a 36 px grid) by which neighbours have walls.
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

	inWorld(i: number, j: number) {
		return i >= 0 && j >= 0 && i < this.width && j < this.height;
	}

	/** The block at (i, j), AIR for none. */
	at(i: number, j: number): number {
		if (this.inWorld(i, j)) return this.type[j * this.width + i];
		return AIR;
	}

	/** Whether the player and items stand on / bump into (i, j). The box's sides and floor are solid. */
	solid(i: number, j: number): boolean {
		if (i < 0 || i >= this.width || j >= this.height) return true;
		return isSolid(this.at(i, j));
	}

	/** WorldGen.PlaceTile / KillTile's change, then WorldGen.SquareTileFrame: reframes the 3x3 around it. */
	set(i: number, j: number, type: number) {
		if (!this.inWorld(i, j)) return;
		this.type[j * this.width + i] = type;
		for (let x = i - 1; x <= i + 1; x++) for (let y = j - 1; y <= j + 1; y++) this.frame(x, y);
	}

	/** Frames every block (after building the world). */
	frameAll() {
		for (let j = 0; j < this.height; j++) for (let i = 0; i < this.width; i++) this.frame(i, j);
	}

	/** WorldGen.TileFrame for one block. */
	frame(i: number, j: number) {
		if (!this.inWorld(i, j)) return;
		const k = j * this.width + i;
		const T = this.type[k];
		if (T === AIR) return;
		const near = (x: number, y: number) => {
			if (y < 0) return AIR;
			// Off the sides or bottom: the same block goes on.
			if (!this.inWorld(x, y)) return T;
			return this.at(x, y);
		};
		const n: Neighbours = {
			up: near(i, j - 1),
			down: near(i, j + 1),
			left: near(i - 1, j),
			right: near(i + 1, j),
			upLeft: near(i - 1, j - 1),
			upRight: near(i + 1, j - 1),
			downLeft: near(i - 1, j + 1),
			downRight: near(i + 1, j + 1)
		};
		const frameOf = (x: number, y: number) =>
			this.at(x, y) === STONE ? this.merge[y * this.width + x] : NO_MERGE;
		const f = pickFrame(T, i, j, this.variant[k], n, frameOf);
		this.frameX[k] = f.x;
		this.frameY[k] = f.y;
		this.merge[k] = f.merge;
	}
}
