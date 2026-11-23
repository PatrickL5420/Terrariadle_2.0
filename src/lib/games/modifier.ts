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

/**
 * Names like "Quick (Weapon)" / "Quick (Accessory)" only need their suffix when another modifier
 * in the same game shares the name; otherwise the plain name is shown.
 */
function withinGame(mods: Modifier[]): Modifier[] {
	const base = (n: string) => n.replace(/ \(.*\)$/, '');
	const count = new Map<string, number>();
	for (const m of mods) count.set(base(m.name), (count.get(base(m.name)) ?? 0) + 1);
	return mods.map((m) => (count.get(base(m.name)) === 1 ? { ...m, name: base(m.name) } : m));
}

const all = data as Modifier[];
const weaponMods = withinGame(all.filter((m) => m.category !== 'Accessory'));
const accessoryMods = withinGame(all.filter((m) => m.category === 'Accessory'));

const tierTheme: Record<string, RarityName> = {
	'-2': 'White',
	'-1': 'Blue',
	'0': 'Green',
	'1': 'Pink',
	'2': 'Red'
};

type Attr = GameConfig<Modifier>['attributes'][number];
const column = {
	category: {
		key: 'category',
		label: 'Category',
		title: "The wiki's group: Universal and Common fit most weapons; the rest are class-specific",
		kind: 'exact',
		value: (m) => m.category
	},
	value: {
		key: 'value',
		label: 'Value',
		title: "Change to the item's sell value",
		kind: 'number',
		value: (m) => m.value,
		display: (m) => `${signed(m.value)}%`
	},
	damage: {
		key: 'damage',
		label: 'Damage',
		title: 'Damage change',
		kind: 'number',
		value: (m) => m.damage,
		display: (m) => pct(m.damage)
	},
	crit: {
		key: 'crit',
		label: 'Crit',
		title: 'Critical strike chance change',
		kind: 'number',
		value: (m) => m.crit,
		display: (m) => pct(m.crit)
	},
	speed: {
		key: 'speed',
		label: 'Speed',
		title: 'Attack / use speed change',
		kind: 'number',
		value: (m) => m.speed,
		display: (m) => pct(m.speed)
	},
	knockback: {
		key: 'knockback',
		label: 'Knockback',
		title: 'Knockback change',
		kind: 'number',
		value: (m) => m.knockback,
		display: (m) => pct(m.knockback)
	},
	effects: {
		key: 'effects',
		label: 'Other Effect',
		title: 'Stats without their own column',
		kind: 'stats',
		value: (m) => m.effects,
		display: (m) => (m.effects.length ? m.effects : 'None')
	}
} satisfies Record<string, Attr>;

const hints: GameConfig<Modifier>['hints'] = [
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
];

const shared = {
	firstColumn: 'Modifier',
	// Modifiers share one wiki page; link to the section, without any name suffix.
	wikiPage: (m: Modifier) => `Modifiers#${m.name.replace(/ \(.*\)$/, '')}`,
	theme: (m: Modifier) => tierTheme[String(m.tier)] ?? 'White',
	hints
};

/** Weapon modifiers. Keeps the original "modifier" slug so links and saved progress still work. */
export const modifierGame: GameConfig<Modifier> = {
	...shared,
	slug: 'modifier',
	title: 'Weapon Modifier Guesser',
	noun: 'weapon modifier',
	description: "Guess today's Terraria weapon modifier (reforge prefix) from its stats!",
	icon: '/logos/goblin_tinkerer.png',
	entries: weaponMods,
	// Strong and Forceful share every stat; the name tile shows which guess is right.
	allowLookalikes: true,
	attributes: [
		column.category,
		column.value,
		column.damage,
		column.crit,
		column.speed,
		column.knockback,
		column.effects
	]
};

/** Accessory modifiers: each changes one stat, so Speed, Knockback and Category are left out. */
export const accessoryModifierGame: GameConfig<Modifier> = {
	...shared,
	slug: 'accessory-modifier',
	title: 'Accessory Modifier Guesser',
	noun: 'accessory modifier',
	description: "Guess today's Terraria accessory modifier (reforge prefix) from its stats!",
	icon: "/items/Tinkerer's Workshop.png",
	entries: accessoryMods,
	attributes: [column.value, column.damage, column.crit, column.effects]
};
