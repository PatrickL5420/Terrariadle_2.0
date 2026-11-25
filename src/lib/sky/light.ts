import type { RGB } from './clock';

/**
 * The sky's current colour (Main.ColorOfTheSkies), kept up to date by the page's sky, so
 * other game things on the page (the little world) are lit like it.
 */
export const skyLight: { color: RGB } = { color: [255, 255, 255] };
