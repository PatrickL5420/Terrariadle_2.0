import data from '$lib/data/modifiers.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import type { RarityName } from '$lib/rarity';

export interface Modifier extends Entry {
	appliesTo: string[];
	/** The game's value tier, -2 (worst) to +2 (best). */
	tier: number;
	damage: number;
	crit: number;
	speed: number;
	knockback: number;
	/** Stats without their own column, e.g. "Size +12", "Mana cost -15". */
	effects: string[];
}

const WEAPON_CLASSES = ['Melee', 'Ranged', 'Magic', 'Summon'];

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (n: number) => (n === 0 ? '0' : `${signed(n)}%`);

/** For mana cost a reduction is good; every other stat is good when it goes up. */
function statSigns(m: Modifier): number[] {
	const signs = [m.damage, m.crit, m.speed, m.knockback].map(Math.sign);
	for (const line of m.effects) {
		const value = Number(line.match(/[+-]\d+/)?.[0] ?? 0);
		signs.push(line.startsWith('Mana cost') ? -Math.sign(value) : Math.sign(value));
	}
	return signs.filter((s) => s !== 0);
}

export function sentiment(m: Modifier): 'Positive' | 'Negative' | 'Mixed' {
	const signs = statSigns(m);
	if (signs.every((s) => s > 0)) return 'Positive';
	if (signs.every((s) => s < 0)) return 'Negative';
	return 'Mixed';
}

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
	attributes: [
		{
			key: 'appliesTo',
			label: 'Applies To',
			title: 'Melee, Ranged, Magic, Summon or Accessory',
			kind: 'set',
			value: (m) => m.appliesTo,
			display: (m) =>
				WEAPON_CLASSES.every((c) => m.appliesTo.includes(c)) ? 'All weapons' : m.appliesTo
		},
		{
			key: 'tier',
			label: 'Tier',
			title: 'Value tier, -2 (worst) to +2 (best)',
			kind: 'number',
			value: (m) => m.tier,
			display: (m) => signed(m.tier)
		},
		{
			key: 'damage',
			label: 'Damage',
			title: 'Damage %',
			kind: 'number',
			value: (m) => m.damage,
			display: (m) => pct(m.damage)
		},
		{
			key: 'crit',
			label: 'Crit',
			title: 'Critical strike chance %',
			kind: 'number',
			value: (m) => m.crit,
			display: (m) => pct(m.crit)
		},
		{
			key: 'speed',
			label: 'Speed',
			title: 'Attack / use speed %',
			kind: 'number',
			value: (m) => m.speed,
			display: (m) => pct(m.speed)
		},
		{
			key: 'knockback',
			label: 'Knockback',
			title: 'Knockback %',
			kind: 'number',
			value: (m) => m.knockback,
			display: (m) => pct(m.knockback)
		},
		{
			key: 'effects',
			label: 'Other Effect',
			title:
				'Size, Velocity, Mana cost, Defense, Move speed, ... (yellow = same stat, different amount)',
			kind: 'stats',
			value: (m) => m.effects,
			display: (m) => (m.effects.length ? m.effects : 'None')
		},
		{
			key: 'sentiment',
			label: 'Sentiment',
			title: 'Positive, Negative or Mixed',
			kind: 'exact',
			value: (m) => sentiment(m)
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
