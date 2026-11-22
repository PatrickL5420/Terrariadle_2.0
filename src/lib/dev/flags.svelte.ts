/**
 * Switches the dev panel flips. Always at their defaults in production (the panel isn't
 * loaded there), so these checks cost nothing for real players.
 */
export const devFlags = $state({
	/** Show every hint without needing the guesses. */
	unlockHints: false,
	/** Bumped to make the game page reload today's state. */
	refresh: 0
});
