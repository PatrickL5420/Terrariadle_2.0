/**
 * Talks to the oracle (tools/verify/oracle: the game's own code, compiled): sends cases for a
 * feature, gets the game's answers. Batched, one process per batch.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DLL = fileURLToPath(new URL('../oracle/bin/Release/net8.0/Oracle.dll', import.meta.url));

/** Whether the oracle has been built (`node tools/verify/build.mjs`). */
export const oracleBuilt = existsSync(DLL);

interface Reply<R> {
	result?: R;
	error?: string;
	stubs?: string[];
}

/** The game's results for `cases`, in order. Throws if any case errored or hit a stub. */
export function oracle<C, R>(feature: string, cases: C[], batch = 20_000): R[] {
	const out: R[] = [];
	for (let start = 0; start < cases.length; start += batch) {
		const chunk = cases.slice(start, start + batch);
		const input = chunk.map((c) => JSON.stringify({ feature, case: c })).join('\n') + '\n';
		const run = spawnSync('dotnet', [DLL], { input, maxBuffer: 2 ** 31 - 1, encoding: 'utf8' });
		if (run.status !== 0) throw new Error(`oracle failed: ${run.stderr}`);
		const lines = run.stdout.trim().split('\n');
		if (lines.length !== chunk.length)
			throw new Error(`oracle answered ${lines.length} of ${chunk.length} cases`);
		lines.forEach((line, k) => {
			const reply = JSON.parse(line) as Reply<R>;
			if (reply.error || reply.stubs)
				throw new Error(
					`oracle: case ${start + k} ${reply.error ? `errored: ${reply.error}` : `reached stubs: ${reply.stubs!.join(', ')}`}\n${JSON.stringify(chunk[k])}`
				);
			out.push(reply.result!);
		});
	}
	return out;
}
