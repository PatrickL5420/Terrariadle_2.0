import { error, json } from '@sveltejs/kit';
import { isCorrect } from '$lib/engine/compare';
import { answerFor, entryOr400, gameOr404, requireToday } from '$lib/server/answers';
import { recordSolve } from '$lib/server/counter';
import type { RequestHandler } from './$types';

export const prerender = false;

/** POST { id, day, player } -> { position }. Only counts if `id` really is today's answer. */
export const POST: RequestHandler = async ({ params, request }) => {
	const game = gameOr404(params.mode);
	const body = await request.json().catch(() => ({}));
	const day = requireToday(body.day);
	const guess = entryOr400(game, body.id);

	if (typeof body.player !== 'string' || !/^[\w-]{8,64}$/.test(body.player)) {
		error(400, 'Invalid player id');
	}
	if (!isCorrect(guess, answerFor(game, day))) error(400, 'That is not the answer');

	return json({ position: await recordSolve(game.slug, day, body.player) });
};
