import type { Coin } from '$lib/money';
import { moneyStacks } from '$lib/coins/world';

/**
 * Coins on their way to the coin counter. Winning queues a drop; $lib/components/CoinDrop
 * plays it, and the counter holds back `pending` until each coin is collected.
 */
export interface Drop {
	id: number;
	/** CSS selector of the element the coins burst out of (the middle of the screen if none). */
	from?: string;
	stacks: { coin: Coin; count: number }[];
}

export const purse = $state({ pending: 0, drops: [] as Drop[] });

let nextId = 0;

/** Drops `amount` copper out of `from`, or adds it straight away with reduced motion. */
export function dropCoins(amount: number, from?: string) {
	if (amount <= 0) return;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	purse.pending += amount;
	purse.drops.push({ id: nextId++, from, stacks: moneyStacks(amount) });
}

/** A collected stack reaches the counter. */
export function collected(value: number) {
	purse.pending = Math.max(0, purse.pending - value);
}
