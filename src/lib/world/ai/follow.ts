/**
 * Carrying out a plan (./nav): each step as the keys and mouse a person would use, a frame at a
 * time, through the player's real movement and item use. It checks where the player actually
 * got to after each step, and gives up on the plan (for a new one) when that's not where the
 * step should have left it, or a step takes too long.
 */
import { isSolid } from '../framing';
import { inRange } from '../item-check';
import type { Player } from '../player';
import { standOf, standX, type NavMap, type Stand, type Step } from './nav';

/** What the follower works with. */
export interface Body {
	player: Player;
	tiles: NavMap;
	/** Holds a pickaxe, a stack of blocks or an axe (only between swings); whether it's held. */
	hold(kind: 'pickaxe' | 'block' | 'axe' | 'torch' | 'wood'): boolean;
	/** Notes a block the plan mined, or placed (for cleaning up after). */
	dug?(i: number, j: number): void;
	built?(i: number, j: number): void;
}

export type Status = 'running' | 'done' | 'failed';

/** Whether the player's at (or next to) the stand. */
function at(p: Player, s: Stand) {
	const now = standOf(p.x, p.y);
	return p.grounded && now.j === s.j && Math.abs(now.i - s.i) <= 1;
}

/** Aims the item at (i, j): the cursor on it, the button held, turned toward it first. */
export function use(p: Player, i: number, j: number) {
	const toward = i * 16 + 8 < p.center.x ? -1 : 1;
	if (p.itemAnimation === 0 && p.direction !== toward) {
		p.controls.left = toward < 0;
		p.controls.right = toward > 0;
	}
	p.tileTargetX = i;
	p.tileTargetY = j;
	p.controls.use = true;
}

export class Follower {
	#k = 0;
	/** Frames into the current step, and when its jump started (-1 before). */
	#t = 0;
	#go = -1;

	constructor(readonly steps: Step[]) {}

	get step(): Step | undefined {
		return this.steps[this.#k];
	}

	/** One frame: sets the player's controls for it. */
	tick(b: Body): Status {
		const s = this.steps[this.#k];
		if (!s) return 'done';
		const r = this.#run(b, s, this.steps[this.#k + 1]);
		this.#t++;
		if (r === 'done') {
			this.#k++;
			this.#t = 0;
			this.#go = -1;
			return this.#k >= this.steps.length ? 'done' : 'running';
		}
		return r;
	}

	#run(b: Body, s: Step, next: Step | undefined): Status {
		const p = b.player;
		const c = p.controls;
		const t = this.#t;
		switch (s.kind) {
			case 'walk': {
				const x = standX(s.to.i);
				const passed = s.d > 0 ? p.x >= x - 2 : p.x <= x + 2;
				if (!passed) {
					c.left = s.d < 0;
					c.right = s.d > 0;
					return t > 90 ? 'failed' : 'running';
				}
				// Running on into another step the same way: no stopping.
				if (next?.kind === 'walk' && next.d === s.d && p.grounded && standOf(p.x, p.y).j === s.to.j)
					return 'done';
				if (!p.grounded) return t > 150 ? 'failed' : 'running';
				return at(p, s.to) ? 'done' : 'failed';
			}

			case 'drop':
				if (!p.grounded || t < 2) return t > 150 ? 'failed' : 'running';
				return at(p, s.to) ? 'done' : 'failed';

			case 'jump': {
				if (this.#go < 0) {
					// Lining up: standing still where the jump was recorded from.
					if (t > 120) return 'failed';
					if (!p.grounded) return 'running';
					const dx = standX(s.from.i) - p.x;
					if (Math.abs(dx) <= 2) {
						if (Math.abs(p.vx) < 0.05) this.#go = t;
						return 'running';
					}
					if (Math.abs(p.vx) < 1.2 || Math.sign(p.vx) !== Math.sign(dx)) {
						c.left = dx < 0;
						c.right = dx > 0;
					}
					return 'running';
				}
				const u = t - this.#go;
				c.left = s.jump.d < 0;
				c.right = s.jump.d > 0;
				c.jump = u < s.jump.hold;
				if (u < 3 || !p.grounded) return u > 150 ? 'failed' : 'running';
				return at(p, s.to) ? 'done' : 'failed';
			}

			case 'mine': {
				const left = s.tiles.filter(([i, j]) => isSolid(b.tiles.at(i, j)));
				if (!left.length) return 'done';
				if (t > 120 + 150 * s.tiles.length) return 'failed';
				if (!b.hold('pickaxe')) return 'running';
				const [i, j] = left[0];
				if (!inRange(p, i, j, -1)) return p.grounded ? 'failed' : 'running';
				use(p, i, j);
				// Noted as it goes (the step's done once they all are).
				if (b.tiles.at(i, j) !== -1) b.dug?.(i, j);
				return 'running';
			}

			case 'place': {
				const [i, j] = s.tile;
				if (isSolid(b.tiles.at(i, j))) return 'done';
				if (t > 120) return 'failed';
				if (!b.hold('block')) return p.itemAnimation > 0 ? 'running' : 'failed';
				if (!inRange(p, i, j, 0)) return p.grounded ? 'failed' : 'running';
				use(p, i, j);
				b.built?.(i, j);
				return 'running';
			}

			case 'pillar': {
				const [i, j] = s.tile;
				const placed = isSolid(b.tiles.at(i, j));
				if (placed && t > 2 && p.grounded) return at(p, s.to) ? 'done' : 'failed';
				if (t > 120) return 'failed';
				if (!placed) {
					if (!b.hold('block')) return p.itemAnimation > 0 ? 'running' : 'failed';
					// Jump, with the block aimed under its feet: it goes in as soon as they clear it.
					c.jump = t < 15;
					p.tileTargetX = i;
					p.tileTargetY = j;
					c.use = true;
					b.built?.(i, j);
				}
				return 'running';
			}
		}
	}
}
