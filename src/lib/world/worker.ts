/**
 * The little world, run off the page's thread: each message asks for some steps in a sky
 * colour, and is answered with a Frame of what changed (see ./view). The world is made on the
 * first message and kept.
 */
import type { RGB } from './light';
import { World, type Sound } from './sim';
import { Recorder } from './view';

export interface Request {
	steps: number;
	sky: RGB;
}

let world: World | null = null;
const recorder = new Recorder();

self.onmessage = (e: MessageEvent<Request>) => {
	world ??= new World();
	const sounds: Sound[] = [];
	for (let n = 0; n < e.data.steps; n++) world.update(e.data.sky, (s) => sounds.push(s));
	const frame = recorder.frame(world, sounds);
	self.postMessage(frame, { transfer: Recorder.transfer(frame) });
};
