import { coins } from '$lib/money';
import type { CompareResult, Entry, GameConfig, GuessRecord } from '$lib/engine/types';

const EMOJI: Record<CompareResult, string> = {
	match: '🟩',
	partial: '🟨',
	miss: '🟥',
	higher: '⬆️',
	lower: '⬇️'
};

/**
 * Spoiler-free result to paste into chat: one line of squares per guess (oldest first).
 * Clue-style games without columns get one square per guess.
 */
export function shareText(
	game: GameConfig<Entry>,
	day: number,
	guesses: GuessRecord[],
	answerId: number,
	/** Words of the clue revealed, for games that reveal it word by word. */
	words?: number,
	/** Coins earned (see $lib/gauntlet). */
	score?: number
): string {
	const lines = [...guesses].reverse().map((g) => {
		const right = g.id === answerId;
		if (!game.attributes.length) return right ? '🟩' : '🟥';
		return game.attributes.map((a) => (right ? '🟩' : EMOJI[g.checks[a.key]])).join('');
	});
	let count = `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`;
	if (words) count += `, ${words} ${words === 1 ? 'word' : 'words'}`;
	const grid = game.attributes.length ? lines.join('\n') : lines.join('');
	const earned = score === undefined ? '' : ` · ${coins(score)}`;
	return `terraGauntlet · ${game.title} #${day}: ${count}${earned}\n${grid}\n${location.origin}/${game.slug}`;
}
