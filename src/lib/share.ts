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
	answerId: number
): string {
	const lines = [...guesses].reverse().map((g) => {
		const right = g.id === answerId;
		if (!game.attributes.length) return right ? '🟩' : '🟥';
		return game.attributes.map((a) => (right ? '🟩' : EMOJI[g.checks[a.key]])).join('');
	});
	const count = `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`;
	const grid = game.attributes.length ? lines.join('\n') : lines.join('');
	return `${game.title} #${day}: ${count}\n${grid}\n${location.origin}/${game.slug}`;
}
