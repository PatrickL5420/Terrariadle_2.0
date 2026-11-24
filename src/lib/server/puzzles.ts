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
	/** What the wiki says changed, per bonus answer: shown once it's answered. */
	notes: Record<number, string>;
}

const added = versionPuzzles as Record<
	string,
	{ added: number; changed: number[]; notes: Record<string, string> }
>;

const PUZZLES: Record<string, Puzzle[]> = {
	version: accessories
		.filter((a) => added[a.id])
		.map((a) => ({
			id: a.id,
			name: a.name,
			image: a.image,
			answer: added[a.id].added,
			bonus: added[a.id].changed,
			notes: added[a.id].notes
		}))
};

export const puzzlesFor = (slug: string): Puzzle[] | undefined => PUZZLES[slug];
