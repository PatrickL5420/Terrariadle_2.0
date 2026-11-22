import type { ParamMatcher } from '@sveltejs/kit';
import { gameSlugs } from '$lib/games';

export const match: ParamMatcher = (param) => gameSlugs.includes(param);
