/**
 * Terraria 1.4.5's coin slot animation (CoinSlot.CoinEntry), as the savings display uses it:
 * when a coin's count changes, its number swells and settles, and the coin hops up, spins and
 * lands. One step per game frame (60 a second).
 */

const TEXT_KEYS = [
	1, 1.0107, 1.0391, 1.0791, 1.125, 1.1709, 1.2109, 1.2393, 1.25, 1.2393, 1.2109, 1.1709, 1.125,
	1.0791, 1.0391, 1.0107, 1
];
const JUMP_KEYS = [
	0, 0.23748, 0.43408, 0.59366, 0.72007, 0.81717, 0.88881, 0.93885, 0.97115, 0.98955, 0.99793, 1, 1,
	1, 0.99793, 0.98955, 0.97115, 0.93885, 0.88881, 0.81717, 0.72007, 0.59366, 0.43408, 0.23748, 0
];
const JUMP_APEX = 12;
const JUMP_TRIGGER = [9, 13];
const JUMP_HOLD = 12;
const SPIN_RANGE = [9, 13];
/** SavingsCoinJumpScale: how high the coin hops, in UI pixels. */
export const JUMP_HEIGHT = 10;

export interface CoinSlotState {
	/** Which of the coin's 8 frames to show (it spins through 0-6). */
	frame: number;
	/** How high the coin is, 0 to 1 (times JUMP_HEIGHT). */
	jump: number;
	/** The count's scale. */
	textScale: number;
}

export class CoinSlotAnim {
	#stack: number;
	#text = 0;
	#jump = 0;
	#hold = 0;
	#spin = 0;

	constructor(stack: number) {
		this.#stack = stack;
	}

	/** CoinEntry.UpdateState: notices a new count. */
	set(stack: number) {
		if (this.#stack !== stack) {
			this.#stack = stack;
			if (this.#text === 0) this.#text = TEXT_KEYS.length - 1;
		}
		if (this.#text >= JUMP_TRIGGER[0] && this.#text <= JUMP_TRIGGER[1]) {
			this.#hold = JUMP_HOLD;
			if (this.#jump === 0) this.#jump = JUMP_KEYS.length - 1;
		}
	}

	/** CoinEntry.UpdateAnim: one frame. */
	step() {
		if (this.#text > 0) this.#text--;
		if (this.#hold > 0) this.#hold--;
		if (this.#jump > 0) {
			if (this.#hold > 0) {
				if (this.#jump !== JUMP_APEX) {
					// Held: back up to the top (from the way down, at the same height), and stay there.
					if (this.#jump < JUMP_APEX) this.#jump = JUMP_APEX + JUMP_APEX - this.#jump;
					this.#jump--;
				}
			} else this.#jump--;
		}
		if (this.#jump >= SPIN_RANGE[0] && this.#jump <= SPIN_RANGE[1])
			this.#spin = (this.#spin + 1) % 14;
		else if (this.#spin !== 0) this.#spin = (this.#spin + 1) % 14;
	}

	get state(): CoinSlotState {
		return {
			frame: Math.trunc(this.#spin / 2),
			jump: JUMP_KEYS[this.#jump],
			textScale: TEXT_KEYS[this.#text]
		};
	}

	get busy() {
		return this.#text > 0 || this.#jump > 0 || this.#spin !== 0;
	}
}
