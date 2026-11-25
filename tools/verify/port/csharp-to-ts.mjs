/**
 * A deliberately small C# -> TypeScript converter for porting straight-line game logic: if /
 * else chains, comparisons, assignments, calls. It works line by line on the game's code (as the
 * decompiler formats it: one statement or brace per line), renaming identifiers through a map,
 * and refuses anything it doesn't recognise, so a port never silently differs from the source.
 *
 * `switch (sel) { case 0: X = a; Y = b; break; case 1: ...; default: ...; }` blocks that only set
 * two values (the game's random-variant frame picks) become one call, `pickCall(a, b, c, d, e, f)`.
 */

/**
 * @param {string[]} lines      the C# lines to convert (complete statements and blocks)
 * @param {object} opts
 * @param {Record<string, string>} opts.names  identifier -> TS expression (whole words)
 * @param {string} opts.selector   the switch variable of frame picks (e.g. 'num6')
 * @param {[string, string]} opts.targets  the two variables a pick sets (e.g. ['val.X', 'val.Y'])
 * @param {string} opts.pick       the TS function a pick becomes
 * @param {[RegExp, string][]} [opts.statements]  whole-statement rewrites, tried first
 * @returns {string[]} TS lines
 */
export function convert(lines, opts) {
	const out = [];
	const word = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const renames = Object.entries(opts.names).sort((a, b) => b[0].length - a[0].length);
	const expr = (e) => {
		let s = e.replace(/([!=])=/g, '$1==');
		for (const [from, to] of renames)
			s = s.replace(new RegExp(`(?<![\\w.])${word(from)}(?![\\w])`, 'g'), to);
		return s;
	};
	const [tx, ty] = opts.targets;
	const assign = new RegExp(`^(${word(tx)}|${word(ty)}) = (-?\\d+);$`);
	for (let k = 0; k < lines.length; k++) {
		const raw = lines[k];
		const indent = raw.match(/^\t*/)[0];
		const line = raw.trim();
		if (!line) continue;

		// A frame pick: switch (selector) { case 0: ...; case 1: ...; default: ...; }
		if (line === `switch (${opts.selector})`) {
			const picks = [];
			let m = k + 1;
			if (lines[m].trim() !== '{') throw new Error(`line ${k}: expected {`);
			for (m++; lines[m].trim() !== '}'; m++) {
				const t = lines[m].trim();
				if (/^case \d+:$|^default:$/.test(t)) {
					const [a, b, brk] = [lines[m + 1].trim(), lines[m + 2].trim(), lines[m + 3].trim()];
					const va = a.match(assign);
					const vb = b.match(assign);
					if (!va || !vb || va[1] !== tx || vb[1] !== ty || brk !== 'break;')
						throw new Error(`line ${m}: unexpected pick ${a} ${b} ${brk}`);
					picks.push(va[2], vb[2]);
					m += 3;
				} else throw new Error(`line ${m}: unexpected in switch: ${t}`);
			}
			if (picks.length !== 6) throw new Error(`line ${k}: a pick needs 3 cases`);
			out.push(`${indent}${opts.pick}(${picks.join(', ')});`);
			k = m;
			continue;
		}
		if (line === '{' || line === '}') {
			out.push(indent + line);
			continue;
		}
		if (line === 'else') {
			out.push(`${indent}else`);
			continue;
		}
		let m = line.match(/^(else if|if) \((.*)\)$/);
		if (m) {
			out.push(`${indent}${m[1]} (${expr(m[2])})`);
			continue;
		}
		const rewrite = (opts.statements ?? []).find(([re]) => re.test(line));
		if (rewrite) {
			out.push(indent + line.replace(rewrite[0], rewrite[1]));
			continue;
		}
		m = line.match(/^([\w.]+) = (.+);$/);
		if (m) {
			out.push(`${indent}${expr(m[1])} = ${expr(m[2])};`);
			continue;
		}
		throw new Error(`can't convert line ${k}: ${line}`);
	}
	return out;
}
