#!/usr/bin/env node
/**
 * Downloads every `wiki:File.png` image referenced in src/lib/data/*.json from the
 * Terraria wiki into static/<folder>/, then rewrites the data file to point at the local copy.
 * Run it whenever you add entries:  npm run fetch-images
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILES = {
	'bosses.json': 'bosses',
	'accessories.json': 'accessories',
	'armor.json': 'armor',
	'tooltips.json': 'items',
	'fish.json': 'items',
	'critters.json': 'critters'
};
const WIKI = 'https://terraria.wiki.gg/wiki/Special:FilePath/';
const root = path.resolve(import.meta.dirname, '..');
const CONCURRENCY = 4;

let failed = 0;
for (const [file, folder] of Object.entries(FILES)) {
	const dataPath = path.join(root, 'src/lib/data', file);
	let text = await readFile(dataPath, 'utf8');
	const wanted = [...new Set([...text.matchAll(/"wiki:([^"]+)"/g)].map((m) => m[1]))];
	await mkdir(path.join(root, 'static', folder), { recursive: true });

	// Download a few at a time (politely) rather than one by one.
	const queue = [...wanted];
	const done = new Set();
	async function worker() {
		for (let name = queue.shift(); name; name = queue.shift()) {
			const dest = path.join(root, 'static', folder, name);
			if (!existsSync(dest)) {
				let res;
				for (let attempt = 1; attempt <= 3; attempt++) {
					res = await fetch(WIKI + encodeURIComponent(name), {
						headers: { 'User-Agent': 'terrariadle-image-sync' }
					}).catch(() => undefined);
					if (res?.ok) break;
					await new Promise((r) => setTimeout(r, (res?.status === 429 ? 5000 : 1000) * attempt));
				}
				if (!res?.ok) {
					console.error(`✗ ${name}: HTTP ${res?.status ?? 'network error'}`);
					failed++;
					continue;
				}
				await writeFile(dest, Buffer.from(await res.arrayBuffer()));
				console.log(`✓ /${folder}/${name}`);
			}
			done.add(name);
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	for (const name of done) {
		text = text.replaceAll(`"wiki:${name}"`, JSON.stringify(`/${folder}/${name}`));
	}
	await writeFile(dataPath, text);
}
if (failed) {
	console.error(`${failed} image(s) failed; their entries still point at the wiki.`);
	process.exitCode = 1;
}
