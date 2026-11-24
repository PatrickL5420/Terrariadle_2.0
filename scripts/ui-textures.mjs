#!/usr/bin/env node
/**
 * Tints Terraria's UI textures (assets/ui/, extracted from the game) with the colours the game
 * draws them in, into static/ui/game/, for the CSS to use as 9-slice border images.
 *
 * The game draws every UI texture through SpriteBatch with a colour: premultiplied texture times
 * colour (XNA `Color`, alpha included). This does the same, so a CSS border image of the output
 * looks exactly like the game's sprite. Run after changing a colour: `node scripts/ui-textures.mjs`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets/ui');
const OUT = join(root, 'static/ui/game');

/** XNA `Color * float`: every channel, alpha too, scaled and truncated. */
const times = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.trunc(v * f))));
/** XNA `Color.Lerp` (truncates). */
const lerp = (a, b, t) => a.map((v, i) => Math.trunc(v + (b[i] - v) * t));
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
/** Colors.InventoryDefaultColor. */
const INVENTORY = [63, 65, 151, 255];

/** Output name -> [source texture, colour], with where the game uses it. */
const TEXTURES = {
	// UIPanel (PanelBackground / PanelBorder): Select Player's buttons and title, the bestiary.
	'panel-button': ['PanelBackground', times([63, 82, 151, 255], 0.7)], // UITextPanel button
	'panel-hover': ['PanelBackground', [73, 94, 171, 255]], // hovered button, title, bestiary page
	'panel-outer': ['PanelBackground', times([33, 43, 79, 255], 0.8)], // the box around a menu
	'border-black': ['PanelBorder', BLACK],
	'border-hover': ['PanelBorder', [255, 231, 69, 255]], // Colors.FancyUIFatButtonMouseOver
	'border-bestiary': ['PanelBorder', [89, 116, 213, 255]], // UIBestiaryEntryInfoPage
	// The bestiary's text boxes (FlavorTextBestiaryInfoElement): Stat_Panel, no border.
	'panel-inset': ['Bestiary/Stat_Panel', [43, 56, 101, 255]],
	// World creation's choices (GroupOptionButton): panel, selected highlight, hover border.
	option: ['CharCreation/PanelGrayscale', times(lerp(BLACK, INVENTORY, 1), 0.7)],
	'option-selected': [
		'CharCreation/CategoryPanelHighlight',
		times(lerp(INVENTORY, WHITE, 0.7), 0.7)
	],
	'option-hover': ['CharCreation/CategoryPanelBorder', WHITE],
	// World creation's name and seed boxes (UICharacterNameButton).
	field: ['CharCreation/CategoryPanel', times(WHITE, 0.5)],
	// Character creation's category buttons (UIColoredImageButton): drawn at 0.4, 1 when hovered.
	tab: ['CharCreation/CategoryPanel', WHITE],
	'tab-hover': ['CharCreation/CategoryPanelBorder', WHITE],
	'tab-selected': ['CharCreation/CategoryPanelHighlight', WHITE],
	// UIHorizontalSeparator in world creation.
	divider: ['CharCreation/Separator1', times(lerp(WHITE, INVENTORY, 0.85), 0.9)],
	// Item tooltips' box (Main.MouseText: Utils.DrawInvBG).
	tooltip: ['Inventory_Back13', times([23, 25, 81, 255], 0.925)],
	// Inventory slots (ItemSlot.Draw). Their alpha comes from the CSS (Main.inventoryBack).
	slot: ['Inventory_Back', WHITE],
	'slot-selected': ['Inventory_Back14', WHITE], // the selected hotbar slot
	'slot-favorite': ['Inventory_Back10', WHITE], // a favourited item
	// Answer tiles: the white slot, tinted like the game's loadout slots, in the result colours.
	'slot-match': ['Inventory_Back13', [61, 138, 51, 255]],
	'slot-partial': ['Inventory_Back13', [154, 122, 30, 255]],
	'slot-miss': ['Inventory_Back13', [132, 48, 58, 255]]
};

// ---- Minimal PNG (8-bit RGBA, non-interlaced) -------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

function readPng(file) {
	const buf = readFileSync(file);
	let pos = 8;
	let width = 0;
	let height = 0;
	let colorType = 0;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString('ascii', pos + 4, pos + 8);
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			colorType = data[9];
			if (data[8] !== 8 || (colorType !== 6 && colorType !== 2) || data[12] !== 0)
				throw new Error(`${file}: only 8-bit RGB(A) PNGs`);
		} else if (type === 'IDAT') idat.push(data);
		pos += 12 + len;
	}
	const channels = colorType === 6 ? 4 : 3;
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const px = Buffer.alloc(width * height * 4);
	let prev = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? line[x - channels] : 0;
			const b = prev[x];
			const c = x >= channels ? prev[x - channels] : 0;
			const p = a + b - c;
			const pa = Math.abs(p - a);
			const pb = Math.abs(p - b);
			const pc = Math.abs(p - c);
			const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			const add = [0, a, b, (a + b) >> 1, paeth][filter];
			line[x] = (line[x] + add) & 0xff;
		}
		for (let x = 0; x < width; x++) {
			px.set(line.subarray(x * channels, x * channels + 3), (y * width + x) * 4);
			px[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
		}
		prev = line;
	}
	return { width, height, px };
}

function writePng(file, { width, height, px }) {
	const chunk = (type, data) => {
		const out = Buffer.alloc(12 + data.length);
		out.writeUInt32BE(data.length, 0);
		out.write(type, 4, 'ascii');
		data.copy(out, 8);
		out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
		return out;
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const raw = Buffer.alloc(height * (width * 4 + 1));
	for (let y = 0; y < height; y++)
		px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	writeFileSync(
		file,
		Buffer.concat([
			Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			chunk('IHDR', ihdr),
			chunk('IDAT', deflateSync(raw, { level: 9 })),
			chunk('IEND', Buffer.alloc(0))
		])
	);
}

// ---- Tint ---------------------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
for (const [name, [source, color]] of Object.entries(TEXTURES)) {
	const img = readPng(join(SRC, `${source}.png`));
	const px = Buffer.alloc(img.px.length);
	for (let i = 0; i < px.length; i += 4) {
		// The source is straight alpha (as extracted); the game's texture is premultiplied.
		const a = img.px[i + 3];
		const outA = (a * color[3]) / 255;
		for (let c = 0; c < 3; c++) {
			const premul = Math.round((img.px[i + c] * a) / 255);
			const out = (premul * color[c]) / 255; // premultiplied result
			px[i + c] = outA > 0 ? Math.min(255, Math.round((out * 255) / outA)) : 0;
		}
		px[i + 3] = Math.round(outA);
	}
	writePng(join(OUT, `${name}.png`), { width: img.width, height: img.height, px });
	console.log(`${name}.png  ${source} x (${color.join(', ')})`);
}
