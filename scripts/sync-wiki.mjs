#!/usr/bin/env node
/**
 * Syncs game data with the official Terraria wiki (terraria.wiki.gg).
 *
 *   npm run sync-wiki            report differences only
 *   npm run sync-wiki -- --write update src/lib/data/*.json
 *
 * What comes from the wiki:
 *   bosses       Max HP (Classic, total of all parts) and defense of the main part
 *   accessories  rarity, hardmode, defense, expert-only, crafting tier, tooltip, image file
 *   modifiers    the whole list: which weapons each applies to, tier and every stat
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
		.replace(/&#8722;|−/g, '-');

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
 * Per-boss lookup rules: which wiki page holds the infobox, which NPC part's defense to use,
 * and drop hints the drop table can't confirm (checked by hand).
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
	'Celestial Pillars': { page: 'Solar Pillar', npc: 'Solar Pillar', dropUnchecked: true }
};

async function syncBosses() {
	const bosses = await load('bosses.json');
	const npcNames = bosses.map((b) => BOSS_SOURCES[b.name]?.npc ?? b.name);
	const npcs = await cargoByNames('NPCs', 'name,nameraw,life,defense', 'nameraw', npcNames);

	for (const boss of bosses) {
		const src = BOSS_SOURCES[boss.name] ?? {};
		const npcName = src.npc ?? boss.name;
		const parts = npcs.filter((n) => n.nameraw === npcName);
		const partName = (n) => n.name.match(/note-text[^>]*>\(([^)]*)\)/)?.[1] ?? '';
		const main =
			src.defensePart !== undefined
				? parts.find((n) => partName(n) === src.defensePart)
				: (parts.find((n) => !partName(n)) ?? parts[0]);
		// The infobox's first "Max Life" is the total across all parts (Classic first).
		const infobox = text(await pageHtml(src.page ?? boss.name));
		if (main) update('bosses', boss, 'defense', toInt(classic(main.defense)));
		else {
			// A few bosses have no NPC table row; fall back to the infobox.
			const def = infobox.match(/Defense\s+(\d+)/);
			if (def) update('bosses', boss, 'defense', toInt(def[1]));
			else problems.push(`boss ${boss.name}: no defense found`);
		}
		const life = infobox.match(/Max Life\s+([\d,]+)/);
		if (!life) problems.push(`boss ${boss.name}: no Max Life on wiki page`);
		else update('bosses', boss, 'hp', toInt(life[1]));
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

async function syncAccessories() {
	const accessories = await load('accessories.json');

	// Every accessory on the wiki, so crafting tiers can follow ingredients we don't list.
	const allAcc = await cargo('Items', 'name', 'type HOLDS LIKE "%accessory%"');
	const accNames = new Set(allAcc.map((r) => r.name));

	const items = await cargoByNames(
		'Items',
		'name,type,rare,hardmode,defense,tooltip,imagefile',
		'name',
		accessories.map((a) => a.name)
	);
	const recipes = (
		await cargoByNames('Recipes', 'result,ingredients,station,version', 'result', [...accNames])
	).filter(isCraftingRecipe);

	const recipesFor = new Map();
	for (const r of recipes) {
		const ings = r.ingredients.split('^').map((s) => s.replaceAll('¦', '').trim());
		recipesFor.set(r.result, [...(recipesFor.get(r.result) ?? []), ings]);
	}
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

	for (const acc of accessories) {
		const item = items.find((i) => i.name === acc.name);
		if (!item) {
			problems.push(`accessory ${acc.name}: not found in the wiki item table`);
			continue;
		}
		if (!/accessory/.test(item.type)) {
			problems.push(`accessory ${acc.name}: the wiki lists it as "${item.type}", not an accessory`);
		}
		const rarity = RARITY[toInt(item.rare)];
		if (!rarity) problems.push(`accessory ${acc.name}: unknown rarity ${item.rare}`);
		else update('accessories', acc, 'rarity', rarity);
		update('accessories', acc, 'hardmode', item.hardmode === '1');
		update('accessories', acc, 'defense', toInt(item.defense));
		update('accessories', acc, 'expertOnly', toInt(item.rare) === -12 || toInt(item.rare) === -13);
		update('accessories', acc, 'tier', tier(acc.name));
		if (item.tooltip) update('accessories', acc, 'tooltip', tooltipText(item.tooltip));
		if (acc.image?.startsWith('wiki:') && item.imagefile) {
			update('accessories', acc, 'image', `wiki:${item.imagefile}`);
		}
	}
	await checkSources(accessories);
	if (WRITE) await save('accessories.json', accessories);
}

/**
 * "Source" is curated by hand, but the wiki's drop table can catch the obvious mistakes:
 * claiming an enemy/boss drop that doesn't exist, or missing one that does.
 */
async function checkSources(accessories) {
	const drops = await cargoByNames(
		'Drops',
		'nameraw,item',
		'item',
		accessories.map((a) => a.name)
	);
	const kind = (from) =>
		/Treasure Bag/.test(from)
			? 'Boss/Treasure bag'
			: /Crate/.test(from)
				? 'Fishing/Crate'
				: /Chest|Lock Box/.test(from)
					? 'Chest'
					: 'Enemy drop';
	for (const acc of accessories) {
		const from = [...new Set(drops.filter((d) => d.item === acc.name).map((d) => d.nameraw))];
		const npcs = from.filter((f) => kind(f) === 'Enemy drop');
		const claimsDrop = acc.sources.some((s) => s === 'Enemy drop' || s === 'Boss/Treasure bag');
		if (claimsDrop && !from.some((f) => ['Enemy drop', 'Boss/Treasure bag'].includes(kind(f)))) {
			problems.push(`accessory ${acc.name}: source says it drops, but the wiki has no drop for it`);
		}
		if (npcs.length && !claimsDrop) {
			problems.push(
				`accessory ${acc.name}: the wiki says it drops from ${npcs.slice(0, 3).join(', ')}`
			);
		}
		if (from.some((f) => kind(f) === 'Fishing/Crate') && !acc.sources.includes('Fishing/Crate')) {
			problems.push(`accessory ${acc.name}: also comes from fishing crates`);
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Modifiers: rebuilt from the tables on the "Modifiers" page

const SECTIONS = {
	Universal: ['Melee', 'Ranged', 'Magic', 'Summon'],
	Common: ['Melee', 'Ranged', 'Magic', 'Summon'], // includes whips
	Melee: ['Melee'],
	Ranged: ['Ranged'],
	Magic: ['Magic'],
	Summon: ['Summon'],
	'Accessory modifiers': ['Accessory']
};
/** Identical in-game to another modifier, so players couldn't tell them apart. */
const SKIP_MODIFIERS = {
	Strong: 'same stats as Forceful'
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
		const appliesTo = SECTIONS[heading];
		if (!appliesTo) continue;
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
				const [name, change, tierCell] = cells.map((c) => c.text);
				const n = toInt(change);
				const m = {
					name,
					appliesTo,
					tier: toInt(tierCell),
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
			if (!name || SKIP_MODIFIERS[name]) continue;
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
					appliesTo,
					tier: pct(cell('Tier')),
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
		for (const k of ['appliesTo', 'tier', 'damage', 'crit', 'speed', 'knockback', 'effects']) {
			update('modifiers', merged, k, m[k]);
		}
		return merged;
	});
	for (const old of existing) {
		if (!out.some((m) => m.id === old.id))
			changes.push(`modifiers    ${old.name.padEnd(22)} removed (not on the wiki)`);
	}
	out.sort((a, b) => a.id - b.id);
	if (WRITE) await save('modifiers.json', out);
}

// ---------------------------------------------------------------------------------------------

await syncBosses();
await syncAccessories();
await syncModifiers();

console.log(changes.length ? changes.join('\n') : 'No differences.');
if (problems.length)
	console.log('\nNeeds attention:\n' + problems.map((p) => `  - ${p}`).join('\n'));
console.log(
	WRITE
		? `\nWrote ${changes.length} change(s).`
		: `\n${changes.length} difference(s). Run with --write to apply.`
);
