/**
 * Terraria's HitTile, ported line by line: the damage a player's pickaxe has done to blocks
 * (Player.hitTile), kept per block for a second after each hit and wearing off, in a buffer of
 * 501 slots that the game keeps sorted. Its quirks are the game's: HitObject "prepares" the
 * spare slot for a block before any damage is done (so a block can sit in it at 0 damage), and
 * damage only wears off when something is hit (Prune runs after a hit, not every frame).
 */

/** HitTile.HitTileObject. */
export interface HitTileObject {
	x: number;
	y: number;
	damage: number;
	/** 0 unused, 1 a block, 2 a wall. */
	type: number;
	timeToLive: number;
	/** Which crack pattern it's drawn with (a random 0-3, never the last one picked). */
	crackStyle: number;
	/** Frames since the last hit (counted by the drawing: DrawFreshAnimations). */
	animationTimeElapsed: number;
}

const MAX = 500;
export const TILE = 1;

export class HitTile {
	readonly data: HitTileObject[] = [];
	readonly #order = new Int32Array(MAX + 1);
	#bufferLocation = 0;
	/** HitTile.lastCrack. */
	#lastCrack = -1;

	/** HitTile.rand: its own random numbers, for the crack patterns (looks only). */
	readonly rand = (n: number) => Math.floor(Math.random() * n);

	constructor() {
		for (let i = 0; i <= MAX; i++) {
			const d = {} as HitTileObject;
			this.#clearObject(d);
			this.data.push(d);
			this.#order[i] = i;
		}
	}

	/** HitTileObject.Clear. */
	#clearObject(d: HitTileObject) {
		d.x = 0;
		d.y = 0;
		d.damage = 0;
		d.type = 0;
		d.timeToLive = 0;
		d.animationTimeElapsed = d.animationTimeElapsed ?? 0;
		let c = this.rand(4);
		while (c === this.#lastCrack) c = this.rand(4);
		d.crackStyle = c;
		this.#lastCrack = c;
	}

	/** HitTile.HitObject: the slot for (x, y), or the spare slot, prepared for it. */
	hitObject(x: number, y: number, hitType: number): number {
		for (let i = 0; i <= MAX; i++) {
			const n = this.#order[i];
			const d = this.data[n];
			if (d.type === hitType) {
				if (d.x === x && d.y === y) return n;
			} else if (i !== 0 && d.type === 0) break;
		}
		const d = this.data[this.#bufferLocation];
		d.x = x;
		d.y = y;
		d.type = hitType;
		return this.#bufferLocation;
	}

	/** HitTile.AddDamage: the slot's damage after adding (or, not updating, what it would be). */
	addDamage(tileId: number, damageAmount: number, updateAmount = true): number {
		if (tileId < 0 || tileId > MAX) return 0;
		if (tileId === this.#bufferLocation && damageAmount === 0) return 0;
		const d = this.data[tileId];
		if (!updateAmount) return d.damage + damageAmount;
		// HitTileObject.AddDamage (and a random wobble direction, for the drawing).
		d.damage += damageAmount;
		d.timeToLive = 60;
		d.animationTimeElapsed = 0;
		this.#sortSlots(tileId);
		return d.damage;
	}

	/** HitTile.SortSlots: the slot hit moves to the front (the spare slot is replaced). */
	#sortSlots(tileId: number) {
		const order = this.#order;
		if (tileId === this.#bufferLocation) {
			this.#bufferLocation = order[MAX];
			if (tileId !== this.#bufferLocation) this.#clearObject(this.data[this.#bufferLocation]);
			for (let n = MAX; n > 0; n--) order[n] = order[n - 1];
			order[0] = this.#bufferLocation;
		} else {
			let n = 0;
			while (n <= MAX && order[n] !== tileId) n++;
			while (n > 1) {
				const t = order[n - 1];
				order[n - 1] = order[n];
				order[n] = t;
				n--;
			}
			order[1] = tileId;
		}
	}

	/** HitTile.Clear. */
	clear(tileId: number) {
		if (tileId < 0 || tileId > MAX) return;
		this.#clearObject(this.data[tileId]);
		const order = this.#order;
		let i = 0;
		while (i < MAX && order[i] !== tileId) i++;
		for (; i < MAX; i++) order[i] = order[i + 1];
		order[MAX] = tileId;
	}

	/** HitTile.TryFinding. */
	tryFinding(x: number, y: number, hitType: number): number {
		for (let i = 0; i <= MAX; i++) {
			const n = this.#order[i];
			const d = this.data[n];
			if (d.type === hitType) {
				if (d.x === x && d.y === y) return n;
			} else if (i !== 0 && d.type === 0) break;
		}
		return -1;
	}

	/** HitTile.TryClearingAndPruning. */
	tryClearingAndPruning(
		x: number,
		y: number,
		hitType: number,
		active: (i: number, j: number) => boolean
	) {
		const n = this.tryFinding(x, y, hitType);
		if (n !== -1) {
			this.clear(n);
			this.prune(active);
		}
	}

	/**
	 * HitTile.Prune: every slot's time ticks down and its damage wears off (faster as it runs
	 * out); slots that run out, or whose block is gone, are cleared and moved to the back.
	 * `active(i, j)`: whether there's a block at (i, j).
	 */
	prune(active: (i: number, j: number) => boolean) {
		let changed = false;
		for (const d of this.data) changed = this.#pruneObject(d, active) || changed;
		if (!changed) return;
		const order = this.#order;
		while (changed) {
			changed = false;
			for (let j = 1; j < MAX; j++) {
				if (this.data[order[j]].type === 0 && this.data[order[j + 1]].type !== 0) {
					const t = order[j];
					order[j] = order[j + 1];
					order[j + 1] = t;
					changed = true;
				}
			}
		}
	}

	#pruneObject(d: HitTileObject, active: (i: number, j: number) => boolean): boolean {
		if (d.type === 0) return false;
		if (d.timeToLive <= 1) {
			this.#clearObject(d);
			return true;
		}
		d.timeToLive--;
		if (d.timeToLive < 12) d.damage -= 10;
		else if (d.timeToLive < 24) d.damage -= 7;
		else if (d.timeToLive < 36) d.damage -= 5;
		else if (d.timeToLive < 48) d.damage -= 2;
		if (d.damage < 0) {
			this.#clearObject(d);
			return true;
		}
		// Blocks only here (walls aren't hit): gone, the slot goes.
		if (d.type === TILE && !active(d.x, d.y)) {
			this.#clearObject(d);
			return true;
		}
		return false;
	}

	/** The blocks with damage on them (for drawing cracks). */
	*blocks(): Generator<HitTileObject> {
		for (const d of this.data) if (d.type === TILE && d.damage > 0) yield d;
	}
}
