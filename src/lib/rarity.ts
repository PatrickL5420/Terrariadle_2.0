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

const tiles: Record<RarityName, [wall: string, block: string]> = {
	White: ['WoodWall', 'Wood'],
	Blue: ['StoneWall', 'StoneBlock'],
	Green: ['DungeonWall', 'DungeonBrick'],
	Orange: ['HellstoneWall', 'HellstoneBrick'],
	'Light Red': ['PearlstoneWall', 'PearlstoneBlock'],
	Pink: ['CrystalBlockWall', 'CrystalBlock'],
	'Light Purple': ['ChlorophyteBrickWall', 'ChlorophyteBrick'],
	Lime: ['LihzahrdBrickWall', 'LihzahrdBrick'],
	Yellow: ['MartianConduitWall', 'MartianConduitPlating'],
	Cyan: ['SmoothMarbleWall', 'SmoothMarbleBlock'],
	Red: ['LuminiteBrickWall', 'LuminiteBrick'],
	Expert: ['LuminiteBrickWall', 'LuminiteBrick']
};

export const rarityBackground = (r: RarityName) => `url('/ui/backgrounds/${tiles[r][0]}.png')`;
export const rarityBorder = (r: RarityName) => `url('/ui/borders/${tiles[r][1]}.png')`;
