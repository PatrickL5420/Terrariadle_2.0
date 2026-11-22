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
	'accessories.json': 'accessories'
};
const WIKI = 'https://terraria.wiki.gg/wiki/Special:FilePath/';
const root = path.resolve(import.meta.dirname, '..');

let failed = 0;
for (const [file, folder] of Object.entries(FILES)) {
	const dataPath = path.join(root, 'src/lib/data', file);
	let text = await readFile(dataPath, 'utf8');
	const wanted = [...new Set([...text.matchAll(/"wiki:([^"]+)"/g)].map((m) => m[1]))];
	await mkdir(path.join(root, 'static', folder), { recursive: true });

	for (const name of wanted) {
		const local = `/${folder}/${name}`;
		const dest = path.join(root, 'static', folder, name);
		if (!existsSync(dest)) {
			let res;
			for (let attempt = 1; attempt <= 3; attempt++) {
				res = await fetch(WIKI + encodeURIComponent(name), {
					headers: { 'User-Agent': 'terrariadle-image-sync' }
				});
				if (res.ok) break;
				await new Promise((r) => setTimeout(r, 1000 * attempt));
			}
			if (!res.ok) {
				console.error(`✗ ${name}: HTTP ${res.status}`);
				failed++;
				continue;
			}
			await writeFile(dest, Buffer.from(await res.arrayBuffer()));
			console.log(`✓ ${local}`);
		}
		text = text.replaceAll(`"wiki:${name}"`, JSON.stringify(local));
	}
	await writeFile(dataPath, text);
}
if (failed) {
	console.error(`${failed} image(s) failed; their entries still point at the wiki.`);
	process.exitCode = 1;
}
