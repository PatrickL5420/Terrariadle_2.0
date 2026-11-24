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
