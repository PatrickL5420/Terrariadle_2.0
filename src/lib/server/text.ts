import tooltipText from './tooltip-text.json';

/**
 * Text that must not ship to the browser, keyed by game slug then entry id. Tooltipdle's
 * tooltips live here: if they were in the page's data, anyone could search it for today's clue.
 */
const TEXT: Record<string, Record<string, string>> = {
	tooltip: tooltipText
};

export const serverText = (slug: string, id: number): string | undefined =>
	TEXT[slug]?.[String(id)];
