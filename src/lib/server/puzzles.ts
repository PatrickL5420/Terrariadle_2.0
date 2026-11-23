import accessories from '$lib/data/accessories.json';
import versionPuzzles from './version-puzzles.json';

/**
 * Games where the daily puzzle isn't the thing you guess: Versiondle shows an accessory and you
 * guess a version. Which version answers which puzzle is server-only, like Tooltipdle's text.
 */
export interface Puzzle {
	id: number;
	/** Shown as the clue. */
	name: string;
	image?: string;
	/** The entry that answers it. */
	answer: number;
	/** Entries that answer the bonus question; empty when there's no bonus question. */
	bonus: number[];
}

const added = versionPuzzles as Record<string, { added: number; changed: number[] }>;

const PUZZLES: Record<string, Puzzle[]> = {
	version: accessories
		.filter((a) => added[a.id])
		.map((a) => ({
			id: a.id,
			name: a.name,
			image: a.image,
			answer: added[a.id].added,
			bonus: added[a.id].changed
		}))
};

export const puzzlesFor = (slug: string): Puzzle[] | undefined => PUZZLES[slug];
