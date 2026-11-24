/**
 * Sound effects from the game (static/sounds/). Adding one = one line in SOUNDS; like the game,
 * a sound with several files plays a random one of them.
 */
const SOUNDS = {
	/** A coin bouncing on the ground, and reaching the coin counter. */
	coin: [0, 1, 2, 3, 4].map((i) => `/sounds/coin-${i}.mp3`),
	/** Solving a game. */
	achievement: ['/sounds/achievement.mp3'],
	/** Answering a bonus question. */
	research: ['/sounds/research.mp3'],
	/** A wrong guess: the click the game's menus make when an option is chosen (Menu Open). */
	select: ['/sounds/menu-open.mp3'],
	/** Hovering a button, like the game's menus. */
	tick: ['/sounds/menu-tick.mp3'],
	/** Opening / closing something: hints, quotes. */
	open: ['/sounds/menu-open.mp3'],
	close: ['/sounds/menu-close.mp3'],
	/** Revealing a clue word. */
	grab: ['/sounds/grab.mp3']
} satisfies Record<string, string[]>;

export type SoundName = keyof typeof SOUNDS;

const MUTE_KEY = 'terrariadle:muted';

function storedMute(): boolean {
	try {
		return localStorage.getItem(MUTE_KEY) === '1';
	} catch {
		return false;
	}
}

export const audio = $state({ muted: typeof localStorage === 'undefined' ? false : storedMute() });

export function toggleMute() {
	audio.muted = !audio.muted;
	try {
		localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0');
	} catch {
		/* ignore */
	}
}

export function play(name: SoundName, volume = 0.5) {
	if (audio.muted || typeof Audio === 'undefined') return;
	const files = SOUNDS[name];
	const sound = new Audio(files[Math.floor(Math.random() * files.length)]);
	sound.volume = volume;
	// Browsers block audio until the page has been interacted with; that's fine to miss.
	sound.play().catch(() => {});
}
