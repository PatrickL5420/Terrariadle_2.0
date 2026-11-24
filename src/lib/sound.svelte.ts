/**
 * Sound effects from the game (static/sounds/). Adding one = one line in SOUNDS; like the game,
 * a sound with several files plays a random one of them.
 */
const SOUNDS = {
	coin: [0, 1, 2, 3, 4].map((i) => `/sounds/coin-${i}.wav`)
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
