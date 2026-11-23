import fishQuotes from './fish-quotes.json';
import tooltipText from './tooltip-text.json';

/**
 * Text that must not ship to the browser, keyed by game slug then entry id: Tooltipdle's
 * tooltips and Fishdle's quotes. If they were in the page's data, anyone could search it for
 * today's clue.
 */
const TEXT: Record<string, Record<string, string>> = {
	tooltip: tooltipText,
	fish: fishQuotes
};

/** The first `n` words of a text (keeping its line breaks), and whether that's all of it. */
export function firstWords(text: string, n: number): { text: string; done: boolean } {
	const words = text.trim().split(/(\s+)/); // words at even indexes, spacing between
	const shown = words.slice(0, Math.max(1, n) * 2 - 1).join('');
	return { text: shown, done: n * 2 - 1 >= words.length };
}

export const serverText = (slug: string, id: number): string | undefined =>
	TEXT[slug]?.[String(id)];
