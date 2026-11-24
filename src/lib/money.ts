/** Terraria money: 100 copper = 1 silver, 100 silver = 1 gold, 100 gold = 1 platinum. */
export const COINS = ['platinum', 'gold', 'silver', 'copper'] as const;
export type Coin = (typeof COINS)[number];

export const COIN_VALUE: Record<Coin, number> = {
	platinum: 1_000_000,
	gold: 10_000,
	silver: 100,
	copper: 1
};

/** 1_020_005 copper -> { platinum: 1, gold: 2, silver: 0, copper: 5 } */
export function splitCoins(copper: number): Record<Coin, number> {
	let left = Math.max(0, Math.round(copper));
	const out = {} as Record<Coin, number>;
	for (const coin of COINS) {
		out[coin] = Math.floor(left / COIN_VALUE[coin]);
		left -= out[coin] * COIN_VALUE[coin];
	}
	return out;
}

/** 75_050 copper -> "7g 50s 50c" (0 -> "None"). Drawn as coin icons by $lib/ui/CoinText. */
export function coins(copper: number): string {
	const split = splitCoins(copper);
	const text = COINS.filter((c) => split[c])
		.map((c) => `${split[c]}${c[0]}`)
		.join(' ');
	return text || 'None';
}

/**
 * Stacks to drop for an amount, like an enemy's coin drop: each denomination's count is spread
 * over a few stacks, at most `max` stacks in all. The stacks always add up to the amount.
 */
export function dropStacks(copper: number, max = 20): { coin: Coin; count: number }[] {
	const split = splitCoins(copper);
	const present = COINS.filter((c) => split[c]);
	const per = Math.max(1, Math.floor(max / Math.max(1, present.length)));
	const stacks: { coin: Coin; count: number }[] = [];
	for (const coin of present) {
		const n = Math.min(per, split[coin]);
		for (let i = 0; i < n; i++) {
			// Spread the count evenly; the first stacks take the remainder.
			const count = Math.floor(split[coin] / n) + (i < split[coin] % n ? 1 : 0);
			stacks.push({ coin, count });
		}
	}
	return stacks;
}
