import data from '$lib/data/modifiers.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import type { RarityName } from '$lib/rarity';

export interface Modifier extends Entry {
	/** The wiki's group: Universal, Common, Melee, Ranged, Magic, Summon or Accessory. */
	category: string;
	/** The game's value tier, -2 (worst) to +2 (best). Only used for the win-card colour. */
	tier: number;
	/** Change to the item's value, in percent (the wiki's Value column). */
	value: number;
	damage: number;
	crit: number;
	speed: number;
	knockback: number;
	/** Stats without their own column, e.g. "Size +12", "Mana cost -15". */
	effects: string[];
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (n: number) => (n === 0 ? '0' : `${signed(n)}%`);

/** Every stat line the modifier changes, e.g. ["Damage +15%", "Size +10%"]. */
export function statLines(m: Modifier): string[] {
	const lines: string[] = [];
	if (m.damage) lines.push(`Damage ${pct(m.damage)}`);
	if (m.crit) lines.push(`Crit ${pct(m.crit)}`);
	if (m.speed) lines.push(`Speed ${pct(m.speed)}`);
	if (m.knockback) lines.push(`Knockback ${pct(m.knockback)}`);
	for (const e of m.effects) {
		// Accessory defense / max mana are flat; everything else is a percentage.
		lines.push(/^(Defense|Max mana)/.test(e) ? e : `${e}%`);
	}
	return lines;
}

const tierTheme: Record<string, RarityName> = {
	'-2': 'White',
	'-1': 'Blue',
	'0': 'Green',
	'1': 'Pink',
	'2': 'Red'
};

export const modifierGame: GameConfig<Modifier> = {
	slug: 'modifier',
	title: 'Modifier Guesser',
	noun: 'modifier',
	description: "Guess today's Terraria modifier (reforge prefix) from its stats!",
	icon: '/logos/goblin_tinkerer.png',
	entries: data as Modifier[],
	firstColumn: 'Modifier',
	theme: (m) => tierTheme[String(m.tier)] ?? 'White',
	// Strong and Forceful share every stat; the name tile shows which guess is right.
	allowLookalikes: true,
	attributes: [
		{
			key: 'category',
			label: 'Category',
			title: "The wiki's group: Universal and Common fit most weapons; the rest are class-specific",
			kind: 'exact',
			value: (m) => m.category
		},
		{
			key: 'value',
			label: 'Value',
			title: "Change to the item's sell value",
			kind: 'number',
			value: (m) => m.value,
			display: (m) => `${signed(m.value)}%`
		},
		{
			key: 'damage',
			label: 'Damage',
			title: 'Damage change',
			kind: 'number',
			value: (m) => m.damage,
			display: (m) => pct(m.damage)
		},
		{
			key: 'crit',
			label: 'Crit',
			title: 'Critical strike chance change',
			kind: 'number',
			value: (m) => m.crit,
			display: (m) => pct(m.crit)
		},
		{
			key: 'speed',
			label: 'Speed',
			title: 'Attack / use speed change',
			kind: 'number',
			value: (m) => m.speed,
			display: (m) => pct(m.speed)
		},
		{
			key: 'knockback',
			label: 'Knockback',
			title: 'Knockback change',
			kind: 'number',
			value: (m) => m.knockback,
			display: (m) => pct(m.knockback)
		},
		{
			key: 'effects',
			label: 'Other Effect',
			title: 'Stats without their own column',
			kind: 'stats',
			value: (m) => m.effects,
			display: (m) => (m.effects.length ? m.effects : 'None')
		}
	],
	hints: [
		{
			label: 'Stats Changed',
			reveal: (m) => {
				const n = statLines(m).length;
				return { text: `Changes ${n} stat${n === 1 ? '' : 's'}` };
			}
		},
		{
			label: 'One Stat',
			reveal: (m) => {
				const lines = statLines(m);
				return { text: lines[lines.length - 1] ?? 'No stat changes' };
			}
		},
		{ label: 'First Letter', reveal: (m) => ({ text: `Starts with "${m.name[0]}"` }) }
	]
};
