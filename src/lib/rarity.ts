export const RARITIES = [
	'White',
	'Blue',
	'Green',
	'Orange',
	'Light Red',
	'Pink',
	'Light Purple',
	'Lime',
	'Yellow',
	'Cyan',
	'Red',
	'Expert'
] as const;

export type RarityName = (typeof RARITIES)[number];

export const rarityColors: Record<RarityName, string> = {
	White: '#ffffff',
	Blue: '#177cff',
	Green: '#35d400',
	Orange: '#ffa600',
	'Light Red': '#ff8080',
	Pink: '#ffbdf0',
	'Light Purple': '#be9bdc',
	Lime: '#69f75c',
	Yellow: '#fbff00',
	Cyan: '#00fff7',
	Red: '#ff0000',
	Expert: '#ff6bf3'
};
