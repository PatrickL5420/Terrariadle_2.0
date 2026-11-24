#!/usr/bin/env node
/**
 * Syncs game data with the official Terraria wiki (terraria.wiki.gg).
 *
 *   npm run sync-wiki                      report differences only
 *   npm run sync-wiki -- --write           update src/lib/data/*.json
 *   npm run sync-wiki -- --only=fish,boss  sync only those games
 *
 * What comes from the wiki:
 *   bosses       Max HP (Classic, total of all parts) and defense of the main part
 *   accessories  rarity, hardmode, defense, expert-only, crafting tier, tooltip, image file
 *   modifiers    the whole list: which weapons each applies to, tier and every stat
 *   fish         the Angler's quest fish: quote, height and biome
 *   critter      the Critters page tables: environment, AI, rarity, sell price, bait power
 *   enemy        the Enemies page (no bosses): hardmode, environment, HP, attack, AI, rare, event, banner
 *   version      desktop versions (with release dates) and when each accessory was added/changed
 *
 * Everything else (boss stage, biomes, body type, accessory function/class/source, hint text)
 * is curated by hand and never touched.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://terraria.wiki.gg/api.php';
const UA = { 'User-Agent': 'terrariadle-data-sync (fan project)' };
const DATA = path.resolve(import.meta.dirname, '../src/lib/data');
const WRITE = process.argv.includes('--write');
const ONLY = process.argv
	.find((a) => a.startsWith('--only='))
	?.slice('--only='.length)
	.split(',');
const runs = (name) => !ONLY || ONLY.includes(name);

// ---------------------------------------------------------------------------------------------
// Wiki access

async function api(params) {
	const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: UA });
		if (res.ok) {
			const body = await res.json();
			if (body.error) throw new Error(`${body.error.code}: ${body.error.info}`);
			return body;
		}
		if (attempt >= 4) throw new Error(`HTTP ${res.status} for ${url}`);
		await new Promise((r) => setTimeout(r, 1000 * attempt));
	}
}

/** Cargo query with paging. Returns plain row objects. */
async function cargo(tables, fields, where) {
	const rows = [];
	for (let offset = 0; ; offset += 500) {
		const body = await api({
			action: 'cargoquery',
			tables,
			fields,
			where,
			limit: '500',
			offset: String(offset)
		});
		const page = body.cargoquery.map((r) => r.title);
		rows.push(...page);
		if (page.length < 500) return rows;
	}
}

const sqlList = (names) => names.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(',');

async function cargoByNames(tables, fields, column, names) {
	const rows = [];
	for (let i = 0; i < names.length; i += 40) {
		rows.push(
			...(await cargo(tables, fields, `${column} IN (${sqlList(names.slice(i, i + 40))})`))
		);
	}
	return rows;
}

/** Rendered HTML of a wiki page, with script/style removed. */
async function pageHtml(page) {
	const body = await api({ action: 'parse', page, prop: 'text', redirects: '1' });
	return body.parse.text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
}

const decode = (s) =>
	s
		.replace(/&nbsp;|&#160;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#8722;|−/g, '-')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const text = (html) =>
	decode(html.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

/** Wiki stat fields hold HTML with one span per difficulty; take the Classic value. */
function classic(html) {
	if (!html) return '';
	const m =
		html.match(/class="[^"]*\bm-normal\b[^"]*">([^<]*)/) ??
		html.match(/class="[^"]*\bm-all\b[^"]*">([^<]*)/);
	return decode(m ? m[1] : html.replace(/<[^>]+>/g, '')).trim();
}

const toInt = (s) => {
	const m = String(s ?? '')
		.replace(/,/g, '')
		.match(/-?\d+/);
	return m ? Number(m[0]) : 0;
};

// ---------------------------------------------------------------------------------------------
// Reporting

const changes = [];
function update(file, entry, field, value) {
	const before = JSON.stringify(entry[field]);
	const after = JSON.stringify(value);
	if (before === after) return;
	changes.push(
		`${file.padEnd(12)} ${entry.name.padEnd(22)} ${field.padEnd(10)} ${before} → ${after}`
	);
	entry[field] = value;
}
const problems = [];

async function load(file) {
	return JSON.parse(await readFile(path.join(DATA, file), 'utf8'));
}

/** One entry per line keeps diffs readable. */
async function save(file, entries) {
	const body = entries.map(
		(e) =>
			'\t' +
			JSON.stringify(e)
				.replace(/,"/g, ', "')
				.replace(/":/g, '": ')
				.replace(/^\{/, '{ ')
				.replace(/\}$/, ' }')
	);
	await writeFile(path.join(DATA, file), `[\n${body.join(',\n')}\n]\n`);
}

// ---------------------------------------------------------------------------------------------
// Bosses

/**
 * Per-boss lookup rules: which wiki page holds the infobox, which NPC part's stats to use, and
 * drop hints the drop table can't confirm (checked by hand).
 */
const BOSS_SOURCES = {
	'Eater of Worlds': { defensePart: 'Eater of Worlds Body' },
	Skeletron: { defensePart: 'Skeletron Head' },
	'Wall of Flesh': { defensePart: 'Wall of Flesh Mouth' },
	'The Twins': { npc: 'Retinazer' },
	'The Destroyer': { defensePart: 'The Destroyer Body' },
	Golem: { defensePart: 'Golem Body' },
	'Empress of Light': { dropUnchecked: true }, // no rows in the wiki's drop table
	'Lunatic Cultist': { defensePart: '' },
	Pumpking: { defensePart: '' },
	'Martian Saucer': { defensePart: '' },
	// Old One's Army minibosses come in tiers; the game uses the first tier they appear in.
	'Dark Mage': { defensePart: 'T1' },
	Ogre: { defensePart: 'T2' },
	// A fusion of the three mechanical bosses with no single defense: shown as "Mixed".
	Mechdusa: { defense: null }
};

/** Sections of the wiki's "Bosses" page -> the Category column. */
const BOSS_CATEGORY = {
	'Pre-Hardmode bosses': 'Pre-Hardmode',
	'Hardmode bosses': 'Hardmode',
	'Event bosses': 'Event',
	'Special world seed-exclusive boss': 'Special seed'
};

async function bossCategories() {
	const html = await pageHtml('Bosses');
	const parts = html.split(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/);
	const categories = new Map();
	let current;
	for (let i = 1; i < parts.length; i += 3) {
		const heading = text(parts[i + 1])
			.replace(/\[\s*edit\s*\]/, '')
			.trim();
		if (parts[i] === '2') current = BOSS_CATEGORY[heading];
		else if (current) categories.set(heading, current);
	}
	return categories;
}

/**
 * The wiki's environment ("The Crimson/Underground Crimson", "Surface+Night/Space+Night",
 * "Frost Moon") -> the Biome column. Time-of-day markers go to the Time column instead.
 */
const BIOME_NAMES = {
	'The Crimson': 'Crimson',
	'Underground Crimson': 'Crimson',
	'The Corruption': 'Corruption',
	'Underground Corruption': 'Corruption',
	'The Hallow': 'Hallow',
	'The Underworld': 'Underworld',
	'Snow biome': 'Snow',
	'Bee Hive (biome)': 'Bee Hive',
	'Dungeon entrance': 'Dungeon'
};
const NOT_BIOMES = new Set(['Night', 'Day', 'Blizzard']);

function biomesFrom(environment) {
	const out = [];
	// Infoboxes separate alternatives with spaces ("Surface + Night Space + Night").
	const normalized = environment
		.replace(/\s*\+\s*/g, '+')
		.replace(/\b(Night|Day)\s+(?=[A-Z])/g, '$1/');
	for (const token of normalized
		.split(/[/+]/)
		.map((t) => t.trim())
		.filter(Boolean)) {
		if (NOT_BIOMES.has(token)) continue;
		const name = BIOME_NAMES[token] ?? token;
		if (!out.includes(name)) out.push(name);
	}
	return out.length ? out : ['Any'];
}

/** Night where the wiki says so, plus night-only summons the environment doesn't mention. */
const NIGHT_EVENTS = /Pumpkin Moon|Frost Moon/;
const NIGHT_SUMMONS = new Set(['Empress of Light']);
function timeFrom(name, environment) {
	if (/\bNight\b/.test(environment) || NIGHT_EVENTS.test(environment) || NIGHT_SUMMONS.has(name)) {
		return 'Night';
	}
	if (/\bDay\b/.test(environment)) return 'Day';
	return 'Any';
}

async function syncBosses() {
	const bosses = await load('bosses.json');
	const categories = await bossCategories();
	const npcNames = bosses.map((b) => BOSS_SOURCES[b.name]?.npc ?? b.name);
	const npcs = await cargoByNames(
		'NPCs',
		'name,nameraw,life,defense,environment',
		'nameraw',
		npcNames
	);

	for (const boss of bosses) {
		const src = BOSS_SOURCES[boss.name] ?? {};
		const npcName = src.npc ?? boss.name;
		const parts = npcs.filter((n) => n.nameraw === npcName);
		const partName = (n) => n.name.match(/note-text[^>]*>\(([^)]*)\)/)?.[1] ?? '';
		const main =
			src.defensePart !== undefined
				? parts.find((n) => partName(n) === src.defensePart)
				: (parts.find((n) => !partName(n)) ?? parts[0]);
		const infobox = text(await pageHtml(src.page ?? boss.name));

		const category = categories.get(boss.name);
		if (category) update('bosses', boss, 'category', category);
		else problems.push(`boss ${boss.name}: not listed on the wiki's Bosses page`);

		// Defense of the main part; bosses without an NPC row fall back to the infobox, and
		// combined bosses (Mechdusa) can set a fixed value.
		if (src.defense !== undefined) update('bosses', boss, 'defense', src.defense);
		else if (main) update('bosses', boss, 'defense', toInt(classic(main.defense)));
		else {
			const def = infobox.match(/Defense\s+(\d+)/);
			if (def) update('bosses', boss, 'defense', toInt(def[1]));
			else problems.push(`boss ${boss.name}: no defense on the wiki; set BOSS_SOURCES.defense`);
		}

		// The infobox's first "Max Life" is the total across all parts (Classic first).
		// Tiered bosses (Old One's Army) have no single total, so use the chosen tier's row.
		const life = infobox.match(/Max Life\s+([\d,]+)/);
		if (life) update('bosses', boss, 'hp', toInt(life[1]));
		else if (main) update('bosses', boss, 'hp', toInt(classic(main.life)));
		else problems.push(`boss ${boss.name}: no Max Life on the wiki`);

		const environment = main
			? text(main.environment)
			: (infobox.match(/Environment\s+(.*?)\s+(?:Max Life|AI Type|Damage)/)?.[1] ?? '');
		if (!environment) problems.push(`boss ${boss.name}: no environment on the wiki`);
		else {
			update('bosses', boss, 'biomes', biomesFrom(environment));
			update('bosses', boss, 'time', timeFrom(boss.name, environment));
		}
	}

	// The "signature drop" hint is hand-written; make sure the boss really drops it.
	const drops = await cargoByNames('Drops', 'nameraw,item', 'item', [
		...new Set(bosses.map((b) => b.drop))
	]);
	for (const boss of bosses) {
		const npc = BOSS_SOURCES[boss.name]?.npc ?? boss.name;
		const ok = drops.some(
			(d) =>
				d.item === boss.drop && (d.nameraw === npc || d.nameraw === `Treasure Bag (${boss.name})`)
		);
		if (!ok && !BOSS_SOURCES[boss.name]?.dropUnchecked) {
			const who = [...new Set(drops.filter((d) => d.item === boss.drop).map((d) => d.nameraw))];
			problems.push(
				`boss ${boss.name}: hint drop "${boss.drop}" — wiki drops: ${who.join(', ') || 'none found'}`
			);
		}
	}
	if (WRITE) await save('bosses.json', bosses);
}

// ---------------------------------------------------------------------------------------------
// Accessories

const RARITY = {
	0: 'White',
	1: 'Blue',
	2: 'Green',
	3: 'Orange',
	4: 'Light Red',
	5: 'Pink',
	6: 'Light Purple',
	7: 'Lime',
	8: 'Yellow',
	9: 'Cyan',
	10: 'Red',
	11: 'Purple',
	'-12': 'Expert',
	'-13': 'Master'
};
const RARITY_NAMES = new Set(Object.values(RARITY));

/**
 * Tooltip as one line for the hint button: drops flavour text ('quoted' lines), rejoins
 * lines the game wraps mid-sentence, and keeps the first two effects so it fits.
 */
function tooltipText(html) {
	const lines = decode(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''))
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !/^['"‘“]/.test(l));
	const joined = [];
	for (const line of lines) {
		if (joined.length && /,$/.test(joined[joined.length - 1]))
			joined[joined.length - 1] += ` ${line}`;
		else joined.push(line);
	}
	return joined.slice(0, 2).join('; ');
}

/**
 * Real crafting recipes on desktop only: the wiki also lists old console / 3DS variants and
 * Shimmer transmutations (e.g. Lava Charm <-> Magma Stone), which aren't crafting.
 */
const isCraftingRecipe = (r) =>
	r.station !== 'Shimmer' && (!r.version || /desktop/.test(r.version));

/** Wiki accessories that aren't real gameplay accessories. */
const isPlayableAccessory = (item) =>
	/accessory/.test(item.type) &&
	!/vanity|furniture|boss summon/.test(item.type) &&
	item.unobtainable !== '1';

/**
 * Developer items (each developer's wings/cape from the dev vanity drops) are obscure and have no
 * real source on the wiki. The wiki's "Developer items" page is the list; this name rule catches
 * the few it doesn't link (e.g. Chippy's Cloak).
 */
const DEVELOPER_ITEM =
	/^(Aaron|Arkhalis|Cenx|Chicken Bones|Chippy|Crowno|D-Town|FoodBarbarian|Ghostar|Grox The Great|Heroicis|Jim|Kazzymodus|Lazure|Leinfors|Loki|Red|Safeman|Skiphs|Will|Yoraiz0r)('s|') /;

async function developerItems() {
	const html = (await pageHtml('Developer items')).split(/class="[^"]*navbox/)[0];
	return new Set([...html.matchAll(/<a [^>]*title="([^"]+)"/g)].map((m) => decode(m[1])));
}

/**
 * Function comes from the sections of the wiki's "Accessories" page. Each section's table lives
 * on its own page; only the first cell of each row (the item itself) counts, and the navbox at
 * the bottom is ignored.
 */
const SECTION_FUNCTION = {
	'Movement Accessories': 'Movement',
	'Informational Accessories': 'Utility',
	'Health and Mana Accessories': 'Health & Mana',
	'Combat Accessories': 'Combat',
	'Immunity accessories': 'Immunity',
	'Construction Accessories': 'Building',
	'Fishing Accessories': 'Fishing',
	'Yoyo Accessories': 'Yoyo',
	'Miscellaneous Accessories': 'Utility'
};
const FUNCTION_ORDER = [
	'Wings',
	'Movement',
	'Combat',
	'Yoyo',
	'Health & Mana',
	'Immunity',
	'Fishing',
	'Building',
	'Utility'
];

async function accessorySections() {
	const html = await pageHtml('Accessories');
	const pages = [...html.matchAll(/data-ajax-source-page="([^"]+)"/g)].map((m) => decode(m[1]));
	const sections = new Map();
	for (const page of pages) {
		const fn = SECTION_FUNCTION[page];
		if (!fn) continue;
		const body = (await pageHtml(page)).split(/class="[^"]*navbox/)[0];
		const firstCells = [...body.matchAll(/<tr[^>]*>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)];
		for (const [, cellHtml] of firstCells) {
			for (const [, title] of cellHtml.matchAll(/<a [^>]*title="([^"]+)"/g)) {
				const name = decode(title);
				sections.set(name, new Set([...(sections.get(name) ?? []), fn]));
			}
		}
	}
	return sections;
}

/** Function for one accessory from the wiki sections; wings get their own value. */
function functionsFor(item, sections) {
	const fn = new Set(sections.get(item.name) ?? []);
	if (/\bwings\b/i.test(item.tag ?? '')) {
		fn.delete('Movement');
		fn.add('Wings');
	}
	if (!fn.size && / Golf Ball$|^Golf Ball$/.test(item.name)) fn.add('Utility');
	return FUNCTION_ORDER.filter((f) => fn.has(f));
}

/** Where a "drop" row comes from, mapped onto the Source column. */
function dropKind(from, bosses) {
	if (/Treasure Bag/.test(from) || bosses.has(from)) return 'Boss/Treasure bag';
	if (/Crate/.test(from)) return 'Fishing/Crate';
	if (/Chest|Lock Box|Present|Goodie Bag|Bag|Urn|Pot\b/.test(from)) return 'Chest';
	return 'Enemy drop';
}

const listText = (items) =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * Best guesses for Class Boost, Source and the "where" hint, from wiki tags, drops, recipes
 * and tooltip keywords.
 * Returns the values plus notes on anything shaky, for the review list.
 */
function autofill(item, ctx) {
	const notes = [];
	const tip = decode((item.tooltip ?? '').replace(/<[^>]+>/g, ' ')).toLowerCase();
	const tags = (item.tag ?? '').toLowerCase();

	// Class boost
	const cls = [];
	if (/\bmelee\b|yoyo|\bswing/.test(tip)) cls.push('Melee');
	if (/\branged\b|arrow|bullet|rocket|\bgun/.test(tip)) cls.push('Ranged');
	if (/\bmagic\b|\bmana\b/.test(tip)) cls.push('Magic');
	if (/summon|minion|sentr|whip/.test(tip)) cls.push('Summon');
	let classes = cls.length === 4 ? ['All'] : cls;
	if (!classes.length && /increased damage|critical strike chance|armor penetration/.test(tip)) {
		classes = ['All'];
		notes.push('class: generic damage bonus, guessed All');
	}
	if (!classes.length) classes = ['None'];

	// Source + the "where found" hint
	const sources = new Set();
	const where = [];
	const recipe = ctx.recipesFor.get(item.name)?.[0];
	if (recipe) {
		sources.add('Crafted');
		where.push(`Crafted from ${listText(recipe.slice(0, 3))}`);
	}
	const from = ctx.dropsFor.get(item.name) ?? [];
	const byKind = (k) => from.filter((f) => dropKind(f, ctx.bosses) === k);
	const bossFrom = byKind('Boss/Treasure bag').map((f) =>
		f.replace(/^Treasure Bag \((.*)\)$/, '$1')
	);
	const enemyFrom = byKind('Enemy drop');
	const chestFrom = byKind('Chest');
	const crateFrom = byKind('Fishing/Crate');
	if (bossFrom.length) sources.add('Boss/Treasure bag');
	if (enemyFrom.length) sources.add('Enemy drop');
	const droppedBy = [...new Set([...bossFrom, ...enemyFrom])];
	if (droppedBy.length) {
		where.push(
			`Dropped by ${listText(droppedBy.slice(0, 2))}${droppedBy.length > 2 ? ' and others' : ''}`
		);
	}
	if (chestFrom.length || crateFrom.length) {
		if (chestFrom.length) sources.add('Chest');
		if (crateFrom.length) sources.add('Fishing/Crate');
		const places = [...chestFrom, ...crateFrom].map((f) => (f === 'Chest' ? 'chests' : f));
		where.push(`Found in ${listText(places.slice(0, 2))}`);
	}
	const vendor = (item.tag ?? '').match(/vendor:([^^]+)/)?.[1];
	if (vendor || /\bvendor\b|buyable/.test(tags)) {
		sources.add('NPC shop');
		where.push(vendor ? `Sold by the ${vendor}` : 'Sold by an NPC');
	}
	if (/quest rewards/.test(tags)) {
		sources.add('NPC shop');
		where.push('Rewarded by the Angler for fishing quests');
	}
	if (/\bfish(ed|ing)\b/.test(tags) && !crateFrom.length) {
		sources.add('Fishing/Crate');
		where.push('Caught while fishing');
	}
	const shimmered = ctx.shimmerFrom.get(item.name);
	if (shimmered) {
		sources.add('Shimmer');
		where.push(`Shimmered from ${listText(shimmered.slice(0, 2))}`);
	}
	if (!sources.size) {
		sources.add('Chest');
		notes.push('source: nothing on the wiki, guessed Chest');
	}
	return {
		classes,
		sources: [...sources],
		where: where.slice(0, 2).join('; ') || 'Found somewhere in the world',
		notes
	};
}

/** Same idea as fingerprint() in src/lib/engine/compare.ts, for the accessory columns. */
const accessoryFingerprint = (a) =>
	JSON.stringify([
		a.rarity,
		a.hardmode,
		[...a.functions].sort(),
		[...a.classes].sort(),
		[...a.sources].sort(),
		a.tier,
		a.defense,
		a.expertOnly
	]);

const LOOKALIKE = 'Looks identical to ';
const reviewRows = [];
const parked = [];

async function syncAccessories() {
	const accessories = await load('accessories.json');

	const allAcc = await cargo(
		'Items',
		'name,type,tag,rare,hardmode,defense,tooltip,imagefile,unobtainable',
		'type HOLDS LIKE "%accessory%"'
	);
	const accNames = new Set(allAcc.map((r) => r.name));

	// Items that don't exist on PC (old console / 3DS / mobile exclusives).
	const exclusive = await cargoByNames('Exclusive', 'pagename,desktop', 'pagename', [...accNames]);
	const notOnPc = new Set(exclusive.filter((e) => e.desktop !== '1').map((e) => e.pagename));
	const devItems = await developerItems();
	const sections = await accessorySections();
	const playable = allAcc.filter(
		(i) =>
			isPlayableAccessory(i) &&
			!notOnPc.has(i.name) &&
			!devItems.has(i.name) &&
			!DEVELOPER_ITEM.test(i.name)
	);

	const allRecipes = await cargoByNames('Recipes', 'result,ingredients,station,version', 'result', [
		...accNames
	]);
	const ingredientsOf = (r) => r.ingredients.split('^').map((x) => x.replaceAll('¦', '').trim());
	const recipesFor = new Map();
	for (const r of allRecipes.filter(isCraftingRecipe)) {
		recipesFor.set(r.result, [...(recipesFor.get(r.result) ?? []), ingredientsOf(r)]);
	}
	// Shimmer transmutations are their own Source ("Shimmer"), not crafting.
	const shimmerFrom = new Map();
	for (const r of allRecipes.filter((x) => x.station === 'Shimmer')) {
		shimmerFrom.set(r.result, [
			...new Set([...(shimmerFrom.get(r.result) ?? []), ...ingredientsOf(r)])
		]);
	}

	const drops = await cargoByNames(
		'Drops',
		'nameraw,item',
		'item',
		playable.map((p) => p.name)
	);
	const dropsFor = new Map();
	for (const d of drops)
		dropsFor.set(d.item, [...new Set([...(dropsFor.get(d.item) ?? []), d.nameraw])]);
	const droppers = [...new Set(drops.map((d) => d.nameraw))];
	const npcTypes = await cargoByNames('NPCs', 'nameraw,type', 'nameraw', droppers);
	const bosses = new Set(npcTypes.filter((n) => /boss/i.test(n.type)).map((n) => n.nameraw));
	const ctx = { recipesFor, dropsFor, bosses, shimmerFrom };

	// Crafting tier: 0 if not made from other accessories, else 1 + the deepest accessory
	// ingredient; with several recipes, the shortest path wins.
	const memo = new Map();
	const tier = (name, seen = new Set()) => {
		if (memo.has(name)) return memo.get(name);
		if (seen.has(name)) return 0;
		seen.add(name);
		let best = Infinity;
		for (const ings of recipesFor.get(name) ?? []) {
			const accIngs = ings.filter((i) => accNames.has(i));
			const t = accIngs.length ? 1 + Math.max(...accIngs.map((i) => tier(i, seen))) : 0;
			best = Math.min(best, t);
		}
		const result = best === Infinity ? 0 : best;
		memo.set(name, result);
		return result;
	};

	// Import accessories we don't have yet: guessable, but not daily answers until you add them.
	let nextId = Math.max(0, ...accessories.map((a) => a.id)) + 1;
	const known = new Set(accessories.map((a) => a.name));
	for (const item of [...playable].sort((a, b) => a.name.localeCompare(b.name))) {
		if (known.has(item.name)) continue;
		accessories.push({
			id: nextId++,
			name: item.name,
			image: `wiki:${item.imagefile || `${item.name}.png`}`,
			reviewed: false
		});
		changes.push(`accessories  ${item.name.padEnd(22)} imported`);
	}

	for (const acc of accessories) {
		const item = allAcc.find((i) => i.name === acc.name);
		if (!item) {
			problems.push(`accessory ${acc.name}: not found in the wiki item table`);
			continue;
		}
		if (!isPlayableAccessory(item)) {
			problems.push(`accessory ${acc.name}: the wiki lists it as "${item.type}"`);
		}
		const rarity = RARITY[toInt(item.rare)];
		if (!rarity) problems.push(`accessory ${acc.name}: unknown rarity ${item.rare}`);
		else update('accessories', acc, 'rarity', rarity);
		update('accessories', acc, 'hardmode', item.hardmode === '1');
		update('accessories', acc, 'defense', toInt(item.defense));
		update('accessories', acc, 'expertOnly', toInt(item.rare) === -12 || toInt(item.rare) === -13);
		update('accessories', acc, 'tier', tier(acc.name));
		// A few accessories (e.g. Shackle) have no tooltip; describe the stat instead.
		const tip = item.tooltip ? tooltipText(item.tooltip) : '';
		const def = toInt(item.defense);
		update('accessories', acc, 'tooltip', tip || (def ? `${def} defense` : 'No special effect'));
		if (acc.image?.startsWith('wiki:') && item.imagefile) {
			update('accessories', acc, 'image', `wiki:${item.imagefile}`);
		}

		if ((devItems.has(acc.name) || DEVELOPER_ITEM.test(acc.name)) && !acc.exclude) {
			update('accessories', acc, 'exclude', 'Developer item');
		}

		// Function comes from the wiki's accessory sections, for every entry.
		const functions = functionsFor(item, sections);
		if (functions.length) update('accessories', acc, 'functions', functions);
		else if (!acc.exclude && !acc.functions?.length)
			problems.push(
				`accessory ${acc.name}: in no section of the Accessories page; Function left as ${acc.functions?.join(', ')}`
			);

		// Other hand columns: only (re)guessed until someone reviews the entry.
		if (acc.reviewed === false) {
			const guess = autofill(item, ctx);
			for (const k of ['classes', 'sources', 'where']) update('accessories', acc, k, guess[k]);
			acc._notes = guess.notes;
		}
		// Shimmer comes straight from the wiki's recipes, so it's kept in sync even on reviewed
		// entries (an accessory can have several sources).
		const canShimmer = ctx.shimmerFrom.has(acc.name);
		if (canShimmer !== acc.sources.includes('Shimmer')) {
			const next = canShimmer
				? [...acc.sources, 'Shimmer']
				: acc.sources.filter((x) => x !== 'Shimmer');
			update('accessories', acc, 'sources', next);
		}
	}
	await checkSources(
		accessories.filter((a) => a.reviewed !== false),
		ctx
	);
	// Lookalikes are allowed (the name tile shows which guess is right); older versions of
	// this script hid them, so un-hide those.
	for (const acc of accessories) if (acc.exclude?.startsWith(LOOKALIKE)) delete acc.exclude;
	const twins = lookalikeGroups(accessories);

	for (const acc of accessories) {
		if (acc.reviewed === false && !acc.exclude) {
			reviewRows.push({ ...acc, _twins: twins.get(acc.name) ?? [] });
		}
		if (acc.exclude) parked.push({ name: acc.name, reason: acc.exclude });
		delete acc._notes;
	}
	// Keep the field order stable so diffs stay small.
	const ORDER = [
		'id',
		'name',
		'image',
		'rarity',
		'hardmode',
		'functions',
		'classes',
		'sources',
		'tier',
		'defense',
		'expertOnly',
		'where',
		'tooltip',
		'pool',
		'reviewed',
		'exclude'
	];
	const tidy = accessories.map((a) =>
		Object.fromEntries(ORDER.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]))
	);
	if (WRITE) {
		await save('accessories.json', tidy);
		await writeReview(playable.length, allAcc.length);
	}
}

/** name -> the other accessories with identical values in every column. */
function lookalikeGroups(accessories) {
	const groups = new Map();
	for (const a of accessories) {
		if (a.exclude) continue;
		const fp = accessoryFingerprint(a);
		groups.set(fp, [...(groups.get(fp) ?? []), a.name]);
	}
	const twins = new Map();
	for (const names of groups.values()) {
		for (const n of names)
			if (names.length > 1)
				twins.set(
					n,
					names.filter((x) => x !== n)
				);
	}
	return twins;
}

const cell = (v) => (Array.isArray(v) ? v.join(', ') : String(v)).replace(/\|/g, '\\|');

async function writeReview(playableCount, wikiCount) {
	const rows = [...reviewRows].sort(
		(a, b) => (b._notes?.length ?? 0) - (a._notes?.length ?? 0) || a.name.localeCompare(b.name)
	);
	const unsure = rows.filter((r) => r._notes?.length).length;
	const lines = [
		'# Accessory review',
		'',
		'Generated by `npm run sync-wiki -- --write`. Do not edit this file; edit',
		'`src/lib/data/accessories.json` instead.',
		'',
		'**How to review an entry:** fix Function, Class Boost, Source or "where" in',
		'`accessories.json` if needed, then delete its `"reviewed": false`. Reviewed entries are',
		'never re-guessed. Every accessory can be a daily answer; add `"pool": false` to keep one out.',
		'',
		`- Wiki accessories: ${wikiCount} (${playableCount} after removing vanity, music boxes, developer items and non-PC items)`,
		`- Waiting for review: **${rows.length}** (${unsure} flagged as unsure, listed first)`,
		`- Hidden with "exclude": ${parked.length}`,
		'',
		'## Waiting for review',
		'',
		'| Accessory | Function | Class Boost | Source | Where found (hint) | Unsure about | Same columns as |',
		'| --- | --- | --- | --- | --- | --- | --- |',
		...rows.map(
			(r) =>
				`| ${cell(r.name)} | ${cell(r.functions)} | ${cell(r.classes)} | ${cell(r.sources)} | ${cell(r.where)} | ${cell(r._notes?.join('; ') ?? '')} | ${cell(r._twins.slice(0, 3).join(', ') + (r._twins.length > 3 ? ` +${r._twins.length - 3}` : ''))} |`
		),
		'',
		'## Hidden',
		'',
		'Entries with `"exclude"` in `accessories.json` (hidden from the game).',
		'',
		'| Accessory | Reason |',
		'| --- | --- |',
		...parked
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((p) => `| ${cell(p.name)} | ${cell(p.reason)} |`),
		''
	];
	await writeFile(path.resolve(DATA, '../../../review/accessories.md'), lines.join('\n'));
}

/**
 * For reviewed entries, the wiki's drop table can still catch obvious Source mistakes:
 * claiming an enemy/boss drop that doesn't exist, or missing one that does.
 */
async function checkSources(accessories, ctx) {
	for (const acc of accessories) {
		// The wiki's drop table has no rows for these, so there's nothing to check against.
		if (/Empress of Light|Hallowed Mimic/.test(acc.where)) continue;
		const from = ctx.dropsFor.get(acc.name) ?? [];
		const kinds = new Set(from.map((f) => dropKind(f, ctx.bosses)));
		const claimsDrop = acc.sources.some((x) => x === 'Enemy drop' || x === 'Boss/Treasure bag');
		if (claimsDrop && !kinds.has('Enemy drop') && !kinds.has('Boss/Treasure bag')) {
			problems.push(`accessory ${acc.name}: source says it drops, but the wiki has no drop for it`);
		}
		const npcs = from.filter((f) => dropKind(f, ctx.bosses) === 'Enemy drop');
		if (npcs.length && !claimsDrop) {
			problems.push(
				`accessory ${acc.name}: the wiki says it drops from ${npcs.slice(0, 3).join(', ')}`
			);
		}
		if (kinds.has('Fishing/Crate') && !acc.sources.includes('Fishing/Crate')) {
			problems.push(`accessory ${acc.name}: also comes from fishing crates`);
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Modifiers: rebuilt from the tables on the "Modifiers" page

/** Sections of the Modifiers page -> the Category column (the wiki's own grouping). */
const SECTIONS = {
	Universal: 'Universal',
	Common: 'Common',
	Melee: 'Melee',
	Ranged: 'Ranged',
	Magic: 'Magic',
	Summon: 'Summon',
	'Accessory modifiers': 'Accessory'
};
/** Section label used to tell apart modifiers that share a name. */
const SUFFIX = {
	Universal: 'Weapon',
	Common: 'Weapon',
	Melee: 'Melee',
	Ranged: 'Ranged',
	Magic: 'Magic',
	Summon: 'Summon',
	'Accessory modifiers': 'Accessory'
};

function firstTable(html) {
	const t = html.match(/<table[\s\S]*?<\/table>/);
	if (!t) return [];
	return [...t[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
		[...r[1].matchAll(/<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((c) => ({
			text: text(c[2]),
			rowspan: Number(c[1].match(/rowspan="?(\d+)/)?.[1] ?? 1)
		}))
	);
}

const pct = (s) => (s && s !== '-' ? toInt(s) : 0);
/** The wiki's Value column ("+209.85%", "-27.75%") as a number. */
const valuePct = (s) => (s && s !== '-' ? Number(s.replace(/[^\d.-]/g, '')) || 0 : 0);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

async function syncModifiers() {
	const existing = await load('modifiers.json');
	const html = await pageHtml('Modifiers');
	const parts = html.split(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);

	const found = [];
	for (let i = 1; i < parts.length; i += 2) {
		const heading = text(parts[i])
			.replace(/\[\s*edit\s*\]/, '')
			.trim();
		const category = SECTIONS[heading];
		if (!category) continue;
		const rows = firstTable(parts[i + 1]);
		const header = rows[0].map((c) => c.text);
		const col = (name) => header.indexOf(name);

		if (heading === 'Accessory modifiers') {
			// Columns: Effect (rowspan) | Modifier | Stat change | Tier | Value
			let effect = '';
			let effectLeft = 0;
			for (const row of rows.slice(1)) {
				let cells = row;
				if (effectLeft === 0) {
					effect = row[0].text;
					effectLeft = row[0].rowspan;
					cells = row.slice(1);
				}
				effectLeft--;
				const [name, change, tierCell, valueCell] = cells.map((c) => c.text);
				const n = toInt(change);
				const m = {
					name,
					category,
					tier: toInt(tierCell),
					value: valuePct(valueCell),
					damage: 0,
					crit: 0,
					speed: 0,
					knockback: 0,
					effects: []
				};
				if (/damage/i.test(effect)) m.damage = n;
				else if (/critical/i.test(effect)) m.crit = n;
				else if (/defense/i.test(effect)) m.effects.push(`Defense ${signed(n)}`);
				else if (/mana/i.test(effect)) m.effects.push(`Max mana ${signed(n)}`);
				else if (/melee speed/i.test(effect)) m.effects.push(`Melee speed ${signed(n)}`);
				else if (/movement speed/i.test(effect)) m.effects.push(`Move speed ${signed(n)}`);
				else problems.push(`modifier ${name}: unknown accessory effect "${effect}"`);
				found.push({ section: heading, m });
			}
			continue;
		}

		for (const row of rows.slice(1)) {
			const cell = (name) => (col(name) >= 0 ? row[col(name)]?.text : undefined);
			const name = cell('Modifier');
			if (!name) continue;
			const effects = [];
			for (const [label, stat] of [
				['Size', 'Size'],
				['Velocity', 'Velocity'],
				['Mana cost', 'Mana cost'],
				['Armor penetration', 'Armor penetration'],
				['Summon tag damage', 'Tag damage']
			]) {
				const v = pct(cell(label));
				if (v) effects.push(`${stat} ${signed(v)}`);
			}
			found.push({
				section: heading,
				m: {
					name,
					category,
					tier: pct(cell('Tier')),
					value: valuePct(cell('Value')),
					damage: pct(cell('Damage')),
					crit: pct(cell('Critical strike chance')),
					speed: pct(cell('Speed')),
					knockback: pct(cell('Knockback')),
					effects
				}
			});
		}
	}

	// Names that appear in more than one section get a suffix, e.g. "Hasty (Ranged)".
	const counts = new Map();
	for (const { m } of found) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
	for (const f of found) {
		if (counts.get(f.m.name) > 1) f.m.name = `${f.m.name} (${SUFFIX[f.section]})`;
	}

	// Keep existing ids so players' saved guesses stay valid; new modifiers get new ids.
	let nextId = Math.max(0, ...existing.map((e) => e.id)) + 1;
	// A modifier that just gained a suffix (e.g. "Deadly" -> "Deadly (Weapon)") keeps its id.
	const claimed = new Set(found.map(({ m }) => m.name));
	const out = found.map(({ m }) => {
		const base = m.name.replace(/ \(.*\)$/, '');
		let old = existing.find((e) => e.name === m.name);
		if (!old && base !== m.name && !claimed.has(base)) {
			old = existing.find((e) => e.name === base);
			if (old) {
				claimed.add(base);
				changes.push(`modifiers    ${base.padEnd(22)} renamed to "${m.name}"`);
				old = { ...old, name: m.name };
			}
		}
		if (!old) {
			changes.push(`modifiers    ${m.name.padEnd(22)} added`);
			return { id: nextId++, ...m };
		}
		const merged = { ...old };
		delete merged.appliesTo; // replaced by the wiki's Category
		for (const k of [
			'category',
			'tier',
			'value',
			'damage',
			'crit',
			'speed',
			'knockback',
			'effects'
		]) {
			update('modifiers', merged, k, m[k]);
		}
		return merged;
	});
	for (const old of existing) {
		if (!out.some((m) => m.id === old.id))
			changes.push(`modifiers    ${old.name.padEnd(22)} removed (not on the wiki)`);
	}
	out.sort((a, b) => a.id - b.id);
	const ORDER = [
		'id',
		'name',
		'category',
		'tier',
		'value',
		'damage',
		'crit',
		'speed',
		'knockback',
		'effects'
	];
	const tidy = out.map((m) => Object.fromEntries(ORDER.map((k) => [k, m[k]])));
	if (WRITE) await save('modifiers.json', tidy);
}

// ---------------------------------------------------------------------------------------------
// Armor (Armordle): every armor set (one entry per class variant), built entirely from the wiki

const ARMOR_SECTIONS = {
	'Pre-Hardmode': 'Pre-Hardmode',
	Hardmode: 'Hardmode',
	'Wizard set': 'Other',
	'Miscellaneous armor': 'Other'
};
const SLOTS = { helmet: 'Head', shirt: 'Chest', pants: 'Legs' };
const CLASSES = ['Melee', 'Ranged', 'Magic', 'Summon'];

/** "Magic: 21<br>Ranged: 23" -> [{label, value}]; "3 (2+1)" -> [{label: '', value: 3}]. */
function labelledNumbers(html) {
	const lines = text(html.replace(/<br\s*\/?>/g, '\n').replace(/\n/g, ' | ')).split('|');
	const out = [];
	for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
		const m = line.match(/^([A-Za-z ]+):\s*(-?\d+)/);
		if (m) out.push({ label: m[1].trim(), value: Number(m[2]) });
		else if (!out.length && /\d/.test(line)) out.push({ label: '', value: toInt(line) });
	}
	return out;
}

/**
 * The notes cell is a nested list: a helmet's own set bonus is a sub-item under that helmet,
 * while top-level items apply to the whole set. Returns each item with its nesting depth.
 */
function noteLines(html) {
	const out = [];
	let depth = 0;
	for (const m of html.matchAll(/<(\/?)(ul|li)\b[^>]*>([\s\S]*?)(?=<\/?(?:ul|li)\b|$)/g)) {
		const [, closing, tag, after] = m;
		if (tag === 'ul') depth += closing ? -1 : 1;
		if (tag === 'li' && !closing) {
			const line = text(after.replace(/<br\s*\/?>/g, ' '));
			if (line) out.push({ depth, text: line });
		}
	}
	return out;
}

/** Rows of the Armor page: each set (or single piece) with its numbers, sprite and notes. */
async function armorRows() {
	const html = await pageHtml('Armor');
	const parts = html.split(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/);
	const rows = [];
	for (let i = 1; i < parts.length; i += 3) {
		const heading = text(parts[i + 1])
			.replace(/\[\s*edit\s*\]/, '')
			.trim();
		const category = ARMOR_SECTIONS[heading];
		if (!category) continue;
		const table = parts[i + 2].match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
		for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
			const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
			if (cells.length < 4) continue;
			const title = cells[1].match(/<a [^>]*title="([^"]+)"/)?.[1];
			if (!title) continue;
			const setTable = cells.length >= 8; // Appearance|Set|Head|Chest|Legs|Total|Notes|Source
			const notes = cells[cells.length - 2];
			rows.push({
				name: decode(title),
				category,
				sprite: decode(cells[0].match(/alt="([^"]+)"/)?.[1] ?? ''),
				heads: setTable ? labelledNumbers(cells[2]) : [],
				totals: labelledNumbers(setTable ? cells[5] : cells[3]),
				lines: noteLines(notes)
			});
		}
	}
	return rows;
}

/** A drop/loot source -> the wiki's obtain categories. */
function armorDropKind(from) {
	if (/Treasure Bag|Goodie Bag|Present|Bag\b/.test(from)) return 'Bag loot';
	if (/Crate/.test(from)) return 'Fished';
	if (/Chest|Lock Box|Urn|Pot\b/.test(from)) return 'Loot';
	return 'Drop';
}

/** Set bonus text for the hint strip: wiki asides removed, cut to ~140 characters. */
function shortBonus(textIn) {
	const t = textIn
		.replace(/\(\s*[^)]*see [^)]*\)/gi, '')
		.replace(/\s+([;,.)])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (t.length <= 140) return t;
	const cut = t.slice(0, 140);
	return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Damage class from bonus text: the one class it mentions, "None", or "Mixed". */
function classFromText(lines) {
	const t = lines.join(' ').toLowerCase();
	const found = [
		/\bmelee\b/.test(t) && 'Melee',
		/\branged\b|\barrow|\bbullet|\bammo\b/.test(t) && 'Ranged',
		/\bmagic\b|\bmana\b/.test(t) && 'Magic',
		/\bsummon|\bminion|\bsentr|\bwhip/.test(t) && 'Summon'
	].filter(Boolean);
	if (found.length === 1) return found[0];
	return found.length ? 'Mixed' : 'None';
}

const mode = (values) => {
	const counts = new Map();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** Every armor piece with its set, slot, defense, rarity and how it's obtained. */
async function armorPieces() {
	const items = (
		await cargo(
			'Items',
			'name,type,bodyslot,defense,rare,tag,imagefile,unobtainable',
			'type HOLDS "armor"'
		)
	).filter((i) => SLOTS[i.bodyslot] && i.unobtainable !== '1');

	// Piece -> set: piece pages redirect to their set's page.
	const setOf = new Map();
	for (let i = 0; i < items.length; i += 50) {
		const r = await api({
			action: 'query',
			redirects: '1',
			titles: items
				.slice(i, i + 50)
				.map((x) => x.name)
				.join('|')
		});
		for (const red of r.query.redirects ?? []) setOf.set(red.from, red.to);
	}

	const names = items.map((i) => i.name);
	const crafted = new Set(
		(await cargoByNames('Recipes', 'result,station,version', 'result', names))
			.filter(isCraftingRecipe)
			.map((r) => r.result)
	);
	const drops = await cargoByNames('Drops', 'nameraw,item', 'item', names);

	return items.map((item) => {
		const obtained = new Set();
		if (crafted.has(item.name)) obtained.add('Craftable');
		for (const d of drops.filter((x) => x.item === item.name))
			obtained.add(armorDropKind(d.nameraw));
		const tags = (item.tag ?? '').toLowerCase();
		if (/\bvendor\b|buyable|\bbuy\b/.test(tags)) obtained.add('Vendor');
		if (/\bfish(ed|ing)\b/.test(tags)) obtained.add('Fished');
		if (/quest rewards/.test(tags)) obtained.add('Quest reward');
		if (/\bloot\b/.test(tags) && !obtained.size) obtained.add('Loot');
		// Robes aren't rows of their own: they're the chest half of the Wizard set.
		const set = setOf.get(item.name) ?? (/ Robe$/.test(item.name) ? 'Wizard set' : item.name);
		return {
			name: item.name,
			set,
			slot: SLOTS[item.bodyslot],
			defense: toInt(item.defense),
			rarity: RARITY[toInt(item.rare)],
			obtained: [...obtained],
			image: item.imagefile || `${item.name}.png`
		};
	});
}

async function syncArmor() {
	const existing = await load('armor.json').catch(() => []);
	const rows = await armorRows();
	const pieces = await armorPieces();
	const robes = pieces.filter((p) => p.set === 'Wizard set');

	const entries = [];
	for (const row of rows) {
		// Wizard hats are worn with any robe; single pieces stand alone.
		const own = pieces.filter(
			(p) => p.set === row.name || (p.set === p.name && p.name === row.name)
		);
		const setPieces = own.length ? own : pieces.filter((p) => p.name === row.name);
		const withRobes =
			row.category === 'Other' && /Hat$/.test(row.name) ? [...setPieces, ...robes] : setPieces;
		if (!setPieces.length) {
			problems.push(`armor ${row.name}: no pieces found`);
			continue;
		}
		const heads = setPieces.filter((p) => p.slot === 'Head');

		// Nested "Set Bonus" items belong to the helmet above them; top-level ones to every variant.
		const bonusFor = new Map();
		const headLines = new Map();
		const shared = [];
		const generic = [];
		let current = '';
		for (const { depth, text: line } of row.lines) {
			const head = depth === 1 && heads.find((h) => line.startsWith(`${h.name}:`));
			if (depth === 1) current = head ? head.name : '';
			if (head) headLines.set(head.name, line);
			if (/^Set Bonus/i.test(line)) {
				const b = line.replace(/^Set Bonus:?\s*/i, '');
				if (depth > 1 && current) bonusFor.set(current, [...(bonusFor.get(current) ?? []), b]);
				else shared.push(b);
			} else if (depth === 1 && !head && !/^Set Effect|interchangeable/i.test(line)) {
				generic.push(line);
			}
		}

		// One entry per labelled variant (class or helmet), else one for the whole set.
		const variants = row.heads.some((h) => h.label)
			? row.heads.map((h) => ({
					label: h.label,
					head: heads.find((p) => p.defense === h.value),
					total: row.totals.find((t) => t.label === h.label)?.value
				}))
			: [{ label: '', head: undefined, total: row.totals[0]?.value }];

		for (const v of variants) {
			const name = v.label ? `${row.name} (${v.label})` : row.name;
			const used = v.head
				? withRobes.filter((p) => p.slot !== 'Head' || p.name === v.head.name)
				: withRobes;
			const bonusLines = [...((v.head && bonusFor.get(v.head.name)) || []), ...shared];
			const headLine = v.head && headLines.get(v.head.name) ? [headLines.get(v.head.name)] : [];
			// Class: the variant's label if it's a class, else what the set bonus is about, else
			// what the helmet and the set's other notes are about.
			const fromBonus = classFromText(bonusLines);
			const cls = CLASSES.includes(v.label)
				? v.label
				: fromBonus !== 'None'
					? fromBonus
					: classFromText([...headLine, ...generic]);
			if (v.label && !v.head) problems.push(`armor ${name}: no helmet with ${v.label}'s defense`);
			if (v.total === undefined) problems.push(`armor ${name}: no total defense`);

			const old = existing.find((e) => e.name === name);
			const effect = generic[0];
			entries.push({
				id: old?.id,
				name,
				// Class variants share the set sprite, so they use their own helmet's sprite instead.
				image: old?.image?.startsWith('/')
					? old.image
					: `wiki:${v.head ? v.head.image : row.sprite || setPieces[0].image}`,
				defense: v.total ?? 0,
				rarity: mode(used.map((p) => p.rarity).filter(Boolean)) ?? 'White',
				category: row.category,
				class: cls,
				obtained: [...new Set(used.flatMap((p) => p.obtained))],
				setBonus: bonusLines.length
					? shortBonus(bonusLines.join(' / '))
					: `No set bonus${effect ? `. ${shortBonus(effect)}` : ''}`
			});
		}
	}

	// Keep ids for entries that existed before; new ones get new ids.
	let nextId = Math.max(0, ...existing.map((e) => e.id)) + 1;
	for (const e of entries) {
		if (e.id === undefined) {
			e.id = nextId++;
			changes.push(`armor        ${e.name.padEnd(22)} added`);
		}
		if (!e.obtained.length) problems.push(`armor ${e.name}: no source found on the wiki`);
	}
	for (const old of existing) {
		if (!entries.some((e) => e.id === old.id))
			changes.push(`armor        ${old.name.padEnd(22)} removed`);
	}
	const ORDER = [
		'id',
		'name',
		'image',
		'defense',
		'rarity',
		'category',
		'class',
		'obtained',
		'setBonus'
	];
	const tidy = entries
		.sort((a, b) => a.id - b.id)
		.map((e) => Object.fromEntries(ORDER.map((k) => [k, e[k]])));
	if (WRITE) await save('armor.json', tidy);
}

// ---------------------------------------------------------------------------------------------
// Tooltips (Tooltipdle): guess the item from its tooltip

/** Wiki tooltip HTML -> plain text, one game line per line, wiki markup removed. */
function tooltipLines(html) {
	return decode(
		html
			.replace(/\[\[File:[^\]]*\]\]/g, '')
			.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
			.replace(/<br\s*\/?>/g, '\n')
			.replace(/<[^>]+>/g, '')
	)
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}

/** A painter's signature like 'V. Costa Moura' marks paintings (and a few dev pets). */
const PAINTER_SIGNATURE = /^'[A-Z]\. ?[A-Z][\w .'-]*'$/m;

function isTooltipCandidate(item, tip) {
	const types = new Set(item.type.split('^'));
	if (!tip || item.unobtainable === '1') return false;
	if (types.has('armor') || types.has('vanity') || types.has('set')) return false;
	if (types.has('grab bag') || /Treasure Bag/.test(item.name)) return false;
	if (/ Banner$/.test(item.name)) return false;
	if (PAINTER_SIGNATURE.test(tip)) return false;
	return true;
}

async function syncTooltips() {
	const existing = await load('tooltips.json').catch(() => []);
	const items = await cargo(
		'Items',
		'itemid,name,type,tooltip,imagefile,unobtainable',
		'tooltip IS NOT NULL AND tooltip <> ""'
	);
	// One entry per name (a few items have variants with the same name, e.g. Strange Plant).
	const byName = new Map();
	for (const item of items) {
		const tip = tooltipLines(item.tooltip);
		if (isTooltipCandidate(item, tip) && !byName.has(item.name))
			byName.set(item.name, { item, tip });
	}
	const candidates = [...byName.values()];

	// Only a tooltip that belongs to exactly one item can be an answer; the rest are still
	// guessable so the search box doesn't give the answer pool away.
	const count = new Map();
	for (const { tip } of candidates) count.set(tip, (count.get(tip) ?? 0) + 1);

	const entries = [];
	const text = {};
	for (const { item, tip } of candidates.sort((a, b) => a.item.name.localeCompare(b.item.name))) {
		const id = toInt(item.itemid);
		const old = existing.find((e) => e.id === id);
		const entry = {
			id,
			name: item.name,
			image: old?.image?.startsWith('/')
				? old.image
				: `wiki:${item.imagefile || `${item.name}.png`}`
		};
		if (count.get(tip) > 1) entry.pool = false;
		entries.push(entry);
		text[id] = tip;
		if (!old) changes.push(`tooltips     ${item.name.padEnd(22)} added`);
	}
	for (const old of existing) {
		if (!entries.some((e) => e.id === old.id))
			changes.push(`tooltips     ${old.name.padEnd(22)} removed`);
	}
	entries.sort((a, b) => a.id - b.id);
	if (WRITE) {
		await save('tooltips.json', entries);
		// Tooltip text is server-only, so the answer can't be looked up in the page's data.
		await saveServerText('tooltip-text.json', text);
	}
}

// ---------------------------------------------------------------------------------------------
// Fish (Angler quests)

/** Writes server-only text (keyed by entry id) next to src/lib/server/text.ts. */
async function saveServerText(file, text) {
	await writeFile(path.resolve(DATA, '../server', file), `${JSON.stringify(text, null, '\t')}\n`);
}

async function syncFish() {
	const existing = await load('fish.json').catch(() => []);
	const html = await pageHtml('Angler/Quests');
	const table = html.slice(html.indexOf('class="terraria sortable lined'));
	const rows = table.slice(0, table.indexOf('</table>')).match(/<tr>[\s\S]*?<\/tr>/g) ?? [];

	const entries = [];
	const quotes = {};
	for (const row of rows) {
		const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
		if (cells.length < 5) continue;
		const id = toInt(cells[2].match(/Item ID<\/a>: (\d+)/)?.[1]);
		const name = decode(cells[2].match(/<span title="([^"]+)">/)?.[1] ?? '');
		if (!id || !name) {
			problems.push(`fish: couldn't read a row of Angler/Quests`);
			continue;
		}
		// Drop the "(Caught in …)" line: that's what the Biome hint is for.
		const quote = decode(
			cells[0]
				.replace(/<br\s*\/?>/g, '\n')
				.replace(/<[^>]+>/g, '')
				.replace(/\(Caught [^)]*\)\s*$/, '')
		)
			.split('\n')
			.map((l) => l.replace(/\s+/g, ' ').trim())
			.filter(Boolean)
			.join('\n');
		// Footnote markers like "[a]" aren't part of the value.
		const cellText = (c) =>
			decode(
				c
					.replace(/<sup[\s\S]*?<\/sup>/g, '')
					.replace(/<div[^>]*hat-note[\s\S]*?<\/div>/g, '')
					.replace(/<[^>]+>/g, '')
			)
				.replace(/\s+/g, ' ')
				.trim();
		const old = existing.find((e) => e.id === id);
		const image = cells[1].match(/src="\/images\/([^"?]+)/)?.[1];
		entries.push({
			id,
			name,
			image: old?.image?.startsWith('/')
				? old.image
				: `wiki:${decodeURIComponent(image ?? `${name}.png`).replace(/_/g, ' ')}`,
			height: cellText(cells[3]),
			biome: cellText(cells[4])
		});
		// Some quotes name the fish outright; the riddle words around it stay.
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		quotes[id] = quote.replace(new RegExp(escaped, 'gi'), '???');
		if (!old) changes.push(`fish         ${name.padEnd(22)} added`);
		else for (const field of ['height', 'biome']) update('fish', old, field, entries.at(-1)[field]);
	}
	for (const old of existing) {
		if (!entries.some((e) => e.id === old.id))
			changes.push(`fish         ${old.name.padEnd(22)} removed`);
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));
	if (WRITE) {
		await save('fish.json', entries);
		// Quotes are server-only, so today's quote can't be looked up in the page's data.
		await saveServerText('fish-quotes.json', quotes);
	}
}

// ---------------------------------------------------------------------------------------------
// Critters

/** Critters that count as one answer: guessing any of them is right when one is the answer. */
const CRITTER_GROUPS = [
	{
		group: 'Gem Squirrel',
		match: /^(Amethyst|Topaz|Sapphire|Emerald|Ruby|Diamond|Amber) Squirrel$/
	},
	{ group: 'Gem Bunny', match: /^(Amethyst|Topaz|Sapphire|Emerald|Ruby|Diamond|Amber) Bunny$/ }
];
/** Critters merged into a single entry (their environments are combined). */
const CRITTER_MERGE = [
	{
		name: 'Dragonfly',
		match: /^(Black|Blue|Green|Orange|Red|Yellow) Dragonfly$/,
		image: 'Blue Dragonfly'
	}
];

/**
 * A wiki list cell: "Passive AI (ground) / Duck AI (flying)" -> ["Passive AI", "Duck AI"];
 * n/a or empty -> ["None"]. Used for critter and enemy environments and critter AI.
 */
const wikiList = (cell) => {
	const values = cell
		.replace(/\bn\/a\b/g, '')
		.split('/')
		.map((v) => v.replace(/\([^)]*\)/g, '').trim())
		.filter((v) => v && v !== 'n/a');
	return values.length ? [...new Set(values)] : ['None'];
};

async function syncCritters() {
	const existing = await load('critters.json').catch(() => []);
	const html = await pageHtml('Critters');
	// The main table, Butterflies, Dragonflies and Gold critters: the first four critter tables.
	const tables = html.split('table-critters-types').slice(1, 5);
	const cellText = (c) =>
		decode(
			c
				.replace(/<br\s*\/?>/g, ' / ')
				.replace(/<span class="(?:id|eico)[\s\S]*?<\/span><\/span>/g, '')
				.replace(/<span class="id">[\s\S]*?<\/span>/g, '')
				.replace(/<sup[\s\S]*?<\/sup>/g, '')
				.replace(/<[^>]+>/g, '')
		)
			.replace(/\s+/g, ' ')
			.trim();

	const rows = [];
	for (const table of tables) {
		for (const row of table.slice(0, table.indexOf('</table>')).match(/<tr>[\s\S]*?<\/tr>/g) ??
			[]) {
			const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
			if (cells.length < 7) continue;
			const name = decode(cells[1].match(/title="([^"]+)"/)?.[1] ?? cellText(cells[1]));
			if (rows.some((r) => r.name === name)) continue; // listed in two tables
			const bait = cellText(cells[6]);
			rows.push({
				name,
				itemId: toInt(cells[1].match(/Item ID<\/a>: (\d+)/)?.[1]),
				image: decodeURIComponent(cells[0].match(/src="\/images\/([^"?]+)/)?.[1] ?? '').replace(
					/_/g,
					' '
				),
				environment: wikiList(cellText(cells[2])),
				ai: wikiList(cellText(cells[3])),
				rarity: cells[4].match(/title="([\w ]+) \(Rarity level/)?.[1] ?? 'None',
				sell: toInt(cells[5].match(/data-sort-value="(\d+)"/)?.[1]),
				bait: /\d/.test(bait) ? toInt(bait) : 0
			});
		}
	}

	// Critters without an item (can't be caught) get an id from their NPC id instead.
	const noItem = rows.filter((r) => !r.itemId).map((r) => r.name);
	const npcIds = new Map(
		(await cargoByNames('NPCs', 'nameraw,npcid', 'nameraw', noItem)).map((r) => [
			r.nameraw,
			toInt(r.npcid)
		])
	);

	const entries = [];
	for (const r of rows) {
		const merge = CRITTER_MERGE.find((m) => m.match.test(r.name));
		if (merge) {
			const merged = entries.find((e) => e.name === merge.name);
			if (merged) {
				merged.environment = [...new Set([...merged.environment, ...r.environment])];
				continue;
			}
			r.name = merge.name;
			r.image = `${merge.image}.png`;
		}
		const id = r.itemId || (npcIds.get(r.name) ? 100_000 + npcIds.get(r.name) : 0);
		if (!id) {
			problems.push(`critters: no item or NPC id for ${r.name}`);
			continue;
		}
		const old = existing.find((e) => e.name === r.name);
		const group = CRITTER_GROUPS.find((g) => g.match.test(r.name))?.group;
		entries.push({
			id,
			name: r.name,
			image: old?.image?.startsWith('/') ? old.image : `wiki:${r.image || `${r.name}.png`}`,
			environment: r.environment,
			ai: r.ai,
			rarity: RARITY_NAMES.has(r.rarity) ? r.rarity : 'None',
			sell: r.sell,
			bait: r.bait,
			...(group && { group })
		});
	}

	// One critter per group is the daily answer, so a group isn't picked 7 times as often.
	const seen = new Set();
	for (const e of entries) {
		if (!e.group) continue;
		if (seen.has(e.group)) e.pool = false;
		seen.add(e.group);
	}

	for (const e of entries) {
		const old = existing.find((o) => o.id === e.id);
		if (!old) changes.push(`critters     ${e.name.padEnd(22)} added`);
		else
			for (const field of ['environment', 'ai', 'rarity', 'sell', 'bait'])
				update('critters', old, field, e[field]);
	}
	for (const old of existing) {
		if (!entries.some((e) => e.id === old.id))
			changes.push(`critters     ${old.name.padEnd(22)} removed`);
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));
	if (WRITE) await save('critters.json', entries);
}

// ---------------------------------------------------------------------------------------------
// Enemies

/** Sections of the Enemies page that are in the game; bosses, servants and unspawnables aren't. */
const ENEMY_SECTIONS = new Set([
	'Pre-Hardmode enemies',
	'Hardmode enemies',
	'Event enemies',
	'Special seed-exclusive enemies'
]);

/** Listed on the Enemies page, but the wiki has no stats of its own for it. */
const ENEMY_SKIP = new Set(['Owl (mimic)']);

/**
 * 1.4.5 slime variants (Dirt Slime, Torch Slime, …): each takes the stats of whichever slime it
 * replaces, so there's nothing to compare. The Slimes page lists them in hidden infoboxes.
 */
async function slimeVariants() {
	const { parse } = await api({ action: 'parse', page: 'Slimes', prop: 'wikitext' });
	return new Set(
		[...parse.wikitext.matchAll(/\{\{npc infobox\|name=([^|}]+)/g)].map((m) => m[1].trim())
	);
}

/** Events that only happen in Hardmode, so all their enemies are Hardmode enemies. */
const HARDMODE_EVENTS = new Set([
	'Solar Eclipse',
	'Martian Madness',
	'Pumpkin Moon',
	'Frost Moon',
	'Frost Legion',
	'Pirate Invasion',
	'Lunar Events'
]);

/** [{ page, section, event }] from the Enemies page's {{item|…}} lists. */
async function enemyList() {
	const { parse } = await api({ action: 'parse', page: 'Enemies', prop: 'wikitext' });
	const skip = new Set([...ENEMY_SKIP, ...(await slimeVariants())]);
	const list = [];
	let section = '';
	let event = '';
	for (const line of parse.wikitext.split('\n')) {
		const heading = line.match(/^(==+)\s*(.*?)\s*\1\s*$/);
		if (heading) {
			const name = heading[2].replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
			if (heading[1].length === 2) [section, event] = [name, ''];
			else event = name;
			continue;
		}
		if (!ENEMY_SECTIONS.has(section)) continue;
		for (const m of line.matchAll(/\{\{item\|([^|}]+)/g)) {
			if (!skip.has(m[1].trim())) list.push({ page: m[1].trim(), section, event });
		}
	}
	return list;
}

/** Pages in a category, among the given pages (redirects followed). */
async function pagesInCategory(pages, category) {
	const found = new Set();
	for (let i = 0; i < pages.length; i += 50) {
		const body = await api({
			action: 'query',
			titles: pages.slice(i, i + 50).join('|'),
			prop: 'categories',
			clcategories: `Category:${category}`,
			cllimit: 'max',
			redirects: '1'
		});
		// Several pages can redirect to one (Bone Biter, Sand Shark -> Sand Sharks).
		const back = new Map();
		for (const r of [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])]) {
			back.set(r.to, [...(back.get(r.to) ?? []), r.from]);
		}
		const originals = (title) => [title, ...(back.get(title) ?? []).flatMap(originals)];
		for (const p of body.query.pages) {
			if (p.categories?.length) for (const title of originals(p.title)) found.add(title);
		}
	}
	return found;
}

async function rareEnemies() {
	const html = await pageHtml('Lifeform Analyzer/List of detected creatures');
	const enemies = html.slice(0, html.indexOf('Critters'));
	return new Set(
		[...enemies.matchAll(/<a href="[^"]*" title="([^"]+)"/g)].map((m) => decode(m[1]))
	);
}

async function syncEnemies() {
	const existing = await load('enemies.json').catch(() => []);
	const list = await enemyList();
	const pages = list.map((e) => e.page);
	const hardmodeOnly = await pagesInCategory(pages, 'Hardmode-only NPCs');
	const rare = await rareEnemies();
	const rows = await cargoByNames(
		'NPCs',
		'_pageName=page,nameraw,image,ai,life,damage,banner,npcid,environment',
		'_pageName',
		pages
	);

	// Enemies sharing a page (Ghoul -> Ghouls, Mimic -> Mimics) are found by their own name.
	const missing = pages.filter((p) => !rows.some((r) => r.page === p));
	const byName = await cargoByNames(
		'NPCs',
		'_pageName=page,nameraw,image,ai,life,damage,banner,npcid,environment',
		'nameraw',
		missing
	);

	const entries = [];
	for (const { page, section, event } of list) {
		const variants = rows.filter((r) => r.page === page);
		if (!variants.length) variants.push(...byName.filter((r) => r.nameraw === page));
		// The variant named like the page is the main one (Zombie, not Bald Zombie). Worm
		// segments share the name; the head (lowest id) holds the HP and damage.
		// Variants have negative ids, so real ids come first.
		const rank = (r) => [
			toInt(r.npcid) < 0,
			!/ Head\.\w+\b/.test(r.image),
			Math.abs(toInt(r.npcid))
		];
		const main = variants
			.filter((r) => r.nameraw === page)
			.sort((a, b) => {
				const [x, y] = [rank(a), rank(b)];
				return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
			});
		const npc = main[0] ?? variants.find((r) => page.startsWith(r.nameraw)) ?? variants[0];
		if (!npc) {
			problems.push(`enemies: no NPC data for ${page}`);
			continue;
		}
		const name = page.replace(/ \((?:enemy|NPC|mimic)\)$/, '');
		const id = toInt(npc.npcid);
		if (entries.some((e) => e.id === id)) {
			problems.push(`enemies: ${page} shares NPC id ${id} with another enemy`);
			continue;
		}
		const old = existing.find((e) => e.id === id);
		const banner = npc.banner?.match(/\[\[File:([^|\]]+)/)?.[1];
		const hardmode =
			section === 'Hardmode enemies' ||
			HARDMODE_EVENTS.has(event) ||
			(section !== 'Pre-Hardmode enemies' && hardmodeOnly.has(page));
		entries.push({
			id,
			name,
			...(name !== page && { page }),
			image: old?.image?.startsWith('/')
				? old.image
				: `wiki:${npc.image?.match(/\[\[File:([^|\]]+)/)?.[1] ?? `${name}.png`}`,
			hardmode,
			hp: toInt(classic(npc.life)),
			attack: toInt(classic(npc.damage)),
			ai: text(npc.ai || '') || 'None',
			environment: wikiList(text(npc.environment ?? '')),
			rare: rare.has(page) || rare.has(name),
			event: event || 'None',
			...(banner && {
				banner: old?.banner?.startsWith('/') ? old.banner : `wiki:${decode(banner)}`
			})
		});
	}

	for (const e of entries) {
		const old = existing.find((o) => o.id === e.id);
		if (!old) changes.push(`enemies      ${e.name.padEnd(22)} added`);
		else
			for (const field of ['hardmode', 'environment', 'hp', 'attack', 'ai', 'rare', 'event'])
				update('enemies', old, field, e[field]);
	}
	for (const old of existing) {
		if (!entries.some((e) => e.id === old.id))
			changes.push(`enemies      ${old.name.padEnd(22)} removed`);
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));
	if (WRITE) await save('enemies.json', entries);
}

// ---------------------------------------------------------------------------------------------
// Versions (Versiondle)

/** "Desktop 1.4.5.0" -> "1.4.5", "Desktop-Release" -> "1.0"; undefined for other platforms. */
function desktopVersion(patch) {
	if (patch === 'Desktop-Release') return '1.0';
	const m = patch.match(/^Desktop (\d+(?:\.\d+)+)$/);
	return m?.[1].replace(/^(\d+\.\d+\.\d+)\.0$/, '$1');
}

/** "1.4.4.9" -> 104040900: each part is two digits, so ids sort like versions. */
const versionId = (v) =>
	v
		.split('.')
		.concat(['0', '0', '0', '0'])
		.slice(0, 5)
		.reduce((id, part) => id * 100 + Number(part), 0);

async function versionDates() {
	const { parse } = await api({
		action: 'parse',
		page: 'Desktop version history',
		prop: 'wikitext'
	});
	const dates = new Map();
	for (const m of parse.wikitext.matchAll(
		/\{\{anchor\|([\d.]+)\}\}[\s\S]*?\{\{date\|(\d+)\|(\d+)\|(\d+)\}\}/g
	)) {
		const v = desktopVersion(`Desktop ${m[1]}`);
		if (!dates.has(v)) dates.set(v, `${m[2]}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`);
	}
	return dates;
}

/** "Introduced." / "Introduced, but unobtainable." — but not "Introduced Spooky Wings". */
const INTRODUCED = /^Introduced(?! [A-Z])/;

/** Items the wiki introduces under an older name: name -> the version it was really added in. */
const VERSION_RENAMED = { 'Spectre Wings': '1.2' }; // added as Ghost Wings

/**
 * Whether wiki text names an item: "Spooky Wings", or "Fairy" in "Fairy, Bee, and Leaf Wings"
 * (the last word may be plural: "Copper, Silver, and Gold Watches"). A longer name doesn't count:
 * "Tattered Fairy Wings" isn't Fairy Wings.
 */
function namesItem(changes, name) {
	const t = changes.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
	const words = name.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const notLonger = "(?<!\\b(?!Introduced\\b)[A-Z][\\w']* )";
	if (new RegExp(`${notLonger}\\b${words.join(' ')}`).test(t)) return true;
	const pattern = `${notLonger}\\b${words[0]}\\b[^.]*\\b${words.at(-1)}`;
	return words.length > 1 && new RegExp(pattern, 'i').test(t);
}

/** name -> the page it redirects to, for names that are redirects. */
async function redirectTargets(names) {
	const targets = new Map();
	for (let i = 0; i < names.length; i += 50) {
		const body = await api({
			action: 'query',
			titles: names.slice(i, i + 50).join('|'),
			redirects: '1'
		});
		for (const r of body.query.redirects ?? []) targets.set(r.from, r.to);
	}
	return targets;
}

/** page -> every page that redirects to it (a group page's members, e.g. all the wings). */
async function redirectsTo(pages) {
	const members = new Map();
	for (const page of pages) {
		const body = await api({ action: 'query', titles: page, prop: 'redirects', rdlimit: 'max' });
		members.set(
			page,
			(body.query.pages[0].redirects ?? []).map((r) => r.title)
		);
	}
	return members;
}

async function syncVersions() {
	const accessories = await load('accessories.json');
	const existing = await load('versions.json').catch(() => []);
	const history = await cargoByNames(
		'History',
		'_pageName=page,patch,changes',
		'_pageName',
		accessories.map((a) => a.name)
	);

	// Accessories without their own page (Red String -> Strings, Spooky Wings -> Wings) share
	// their group page's history.
	const own = new Set(history.map((h) => h.page));
	const groupOf = await redirectTargets(accessories.map((a) => a.name).filter((n) => !own.has(n)));
	const groupHistory = await cargoByNames('History', '_pageName=page,patch,changes', '_pageName', [
		...new Set(groupOf.values())
	]);

	const groupMembers = await redirectsTo([...new Set(groupOf.values())]);
	const byVersion = (h) => versionId(desktopVersion(h.patch));
	const puzzles = {};
	for (const a of accessories) {
		let rows = history.filter((h) => h.page === a.name && desktopVersion(h.patch));
		let added = rows.find((h) => INTRODUCED.test(h.changes.trim()));
		if (!added && groupOf.has(a.name)) {
			rows = groupHistory
				.filter((h) => h.page === groupOf.get(a.name) && desktopVersion(h.patch))
				.sort((x, y) => byVersion(x) - byVersion(y));
			added = rows.find((h) => INTRODUCED.test(h.changes.trim()));
			if (!added) {
				// "Introduced Spooky Wings and Tattered Fairy Wings": find the row naming this one.
				// Lists like "Fairy, Bee, and Leaf Wings" only name the first word.
				const mentions = (h) => namesItem(h.changes, a.name);
				added = rows.find((h) => /Introduced/.test(h.changes) && mentions(h));
				// Changes naming no one item ("Now craftable at Work Benches") apply to them all.
				const members = groupMembers.get(groupOf.get(a.name)) ?? [];
				rows = rows.filter((h) => mentions(h) || !members.some((m) => namesItem(h.changes, m)));
			}
		}
		if (!added) {
			problems.push(`versions: no desktop "Introduced" entry for ${a.name}`);
			continue;
		}
		const addedId = VERSION_RENAMED[a.name] ? versionId(VERSION_RENAMED[a.name]) : byVersion(added);
		const changed = [...new Set(rows.map(byVersion).filter((id) => id > addedId))].sort(
			(x, y) => x - y
		);
		puzzles[a.id] = { added: addedId, changed };
	}

	// Every version that's an answer to either question can be guessed.
	const used = new Set(Object.values(puzzles).flatMap((p) => [p.added, ...p.changed]));
	const names = new Map(
		[...history, ...groupHistory]
			.map((h) => desktopVersion(h.patch))
			.filter(Boolean)
			.map((v) => [versionId(v), v])
	);
	const dates = await versionDates();
	const entries = [...used]
		.sort((x, y) => x - y)
		.map((id) => ({ id, name: names.get(id), date: dates.get(names.get(id)) ?? '' }));
	for (const e of entries) {
		if (!e.date) problems.push(`versions: no release date for ${e.name}`);
		if (!existing.some((o) => o.id === e.id))
			changes.push(`versions     ${e.name.padEnd(22)} added`);
	}
	if (WRITE) {
		await save('versions.json', entries);
		// Which version each accessory was added / changed in is server-only.
		await saveServerText('version-puzzles.json', puzzles);
	}
}

// ---------------------------------------------------------------------------------------------

if (runs('boss')) await syncBosses();
if (runs('armor')) await syncArmor();
if (runs('tooltip')) await syncTooltips();
if (runs('accessory')) await syncAccessories();
if (runs('modifier')) await syncModifiers();
if (runs('fish')) await syncFish();
if (runs('critter')) await syncCritters();
if (runs('enemy')) await syncEnemies();
if (runs('version')) await syncVersions();

console.log(changes.length ? changes.join('\n') : 'No differences.');
if (problems.length)
	console.log('\nNeeds attention:\n' + problems.map((p) => `  - ${p}`).join('\n'));
console.log(
	WRITE
		? `\nWrote ${changes.length} change(s).`
		: `\n${changes.length} difference(s). Run with --write to apply.`
);
