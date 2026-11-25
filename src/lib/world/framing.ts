/**
 * How a block picks its sprite from its neighbours: Terraria's WorldGen.TileFrame (via
 * TileFrameCosmetic), for the blocks this little world has: dirt, stone and grass.
 *
 * Each neighbour is first relabelled (the game's TileMergeAttempt calls): the block's own type
 * `T` where it joins up, -2 where it blends into a different block, -1 where there's nothing to
 * join. Then the game's frame tables (below, converted from its code: same conditions, same
 * order) pick a frame; each spot has 3 variants (`variant`, random per tile) to break up repeats.
 * Frames are 16 px tiles on an 18 px grid in Images/Tiles_N.
 */

export const AIR = -1;
export const DIRT = 0;
export const STONE = 1;
export const GRASS = 2;
export const TORCH = 4;

/** Main.tileSolid. */
export const isSolid = (type: number) => type === DIRT || type === STONE || type === GRASS;

export interface Neighbours {
	up: number;
	down: number;
	left: number;
	right: number;
	upLeft: number;
	upRight: number;
	downLeft: number;
	downRight: number;
}

/** Which sides the frame blends into dirt on (the game's mergeUp / Down / Left / Right). */
export interface Merge {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

const SIDES = [
	'up',
	'down',
	'left',
	'right',
	'upLeft',
	'upRight',
	'downLeft',
	'downRight'
] as const;

/** TileMergeAttempt: neighbours that are `lookFor` count as `as`. */
function relabel(n: Neighbours, lookFor: number | ((type: number) => boolean), as: number) {
	for (const side of SIDES) {
		const type = n[side];
		if (typeof lookFor === 'number' ? type === lookFor : type > -1 && lookFor(type)) n[side] = as;
	}
}

/** TileMergeAttemptWeird(T, -1, Main.tileSolid): non-solid neighbours (torches) count as air. */
function dropNonSolid(n: Neighbours, T: number) {
	relabel(n, (type) => !isSolid(type) && type !== T, AIR);
}

/**
 * Picks the frame for block `T` at (i, j) with neighbours `n` (types, -1 for air). `frameOf`
 * frames a neighbouring stone block, which dirt needs to know whether that stone blends into it.
 */
export function pickFrame(
	T: number,
	i: number,
	j: number,
	variant: number,
	n: Neighbours,
	frameOf: (i: number, j: number) => Merge
): { x: number; y: number; merge: Merge } {
	const v = { x: -1, y: -1 };
	const merge: Merge = { up: false, down: false, left: false, right: false };
	const pick = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
		[v.x, v.y] = variant === 0 ? [x0, y0] : variant === 1 ? [x1, y1] : [x2, y2];
	};

	// Stone and grass are both "bricks", and bricks join up with each other.
	if (T === STONE || T === GRASS) relabel(n, (type) => type === STONE || type === GRASS, T);
	if (T === DIRT) {
		// Dirt joins a stone neighbour if that stone's frame blends into it.
		if (n.up === STONE && frameOf(i, j - 1).down) n.up = T;
		if (n.down === STONE && frameOf(i, j + 1).up) n.down = T;
		if (n.left === STONE && frameOf(i - 1, j).right) n.left = T;
		if (n.right === STONE && frameOf(i + 1, j).left) n.right = T;
		// Grass grows on dirt: dirt joins it, and diagonal stone or grass.
		relabel(n, GRASS, T);
		for (const side of ['upLeft', 'upRight', 'downLeft', 'downRight'] as const) {
			if (n[side] === STONE) n[side] = T;
		}
	}
	// Stone blends into dirt.
	if (T === STONE) relabel(n, DIRT, -2);

	// Grass, framed against the dirt it grows on (D).
	let grassFramed = false;
	if (T === GRASS) {
		grassFramed = true;
		dropNonSolid(n, T);
		const D = DIRT;
		grassTable(T, D, i, j, n, pick);
		relabel(n, DIRT, -2);
	}

	if (v.x === -1 && v.y === -1) blendTable(T, n, grassFramed, pick, merge, v);
	if (v.x < 0 || v.y < 0) basicTable(T, n, grassFramed, pick, v);
	if (v.x <= -1 || v.y <= -1) [v.x, v.y] = [18 + Math.min(2, variant) * 18, 18];
	return { ...v, merge };
}

type Pick = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => void;

/* eslint-disable no-dupe-else-if -- the game's tables have a few unreachable branches; kept as is */

/** The grass part of WorldGen.TileFrameCosmetic (the NeedsGrassFraming block). */
function grassTable(T: number, D: number, i: number, j: number, n: Neighbours, pick: Pick) {
	if (n.up !== T && n.up !== D && (n.down === T || n.down === D)) {
		if (n.left === D && n.right === T) {
			pick(0, 198, 18, 198, 36, 198);
		} else if (n.left === T && n.right === D) {
			pick(54, 198, 72, 198, 90, 198);
		}
	} else if (n.down !== T && n.down !== D && (n.up === T || n.up === D)) {
		if (n.left === D && n.right === T) {
			pick(0, 216, 18, 216, 36, 216);
		} else if (n.left === T && n.right === D) {
			pick(54, 216, 72, 216, 90, 216);
		}
	} else if (n.left !== T && n.left !== D && (n.right === T || n.right === D)) {
		if (n.up === D && n.down === T) {
			pick(72, 144, 72, 162, 72, 180);
		} else if (n.down === T && n.up === D) {
			pick(72, 90, 72, 108, 72, 126);
		}
	} else if (n.right !== T && n.right !== D && (n.left === T || n.left === D)) {
		if (n.up === D && n.down === T) {
			pick(90, 144, 90, 162, 90, 180);
		} else if (n.down === T && n.right === n.up) {
			pick(90, 90, 90, 108, 90, 126);
		}
	} else if (n.up === T && n.down === T && n.left === T && n.right === T) {
		if (n.upLeft !== T && n.upRight !== T && n.downLeft !== T && n.downRight !== T) {
			if (n.downRight === D) {
				pick(108, 324, 126, 324, 144, 324);
			} else if (n.upRight === D) {
				pick(108, 342, 126, 342, 144, 342);
			} else if (n.downLeft === D) {
				pick(108, 360, 126, 360, 144, 360);
			} else if (n.upLeft === D) {
				pick(108, 378, 126, 378, 144, 378);
			} else {
				pick(144, 234, 198, 234, 252, 234);
			}
		} else if (n.upLeft !== T && n.downRight !== T) {
			pick(36, 306, 54, 306, 72, 306);
		} else if (n.upRight !== T && n.downLeft !== T) {
			pick(90, 306, 108, 306, 126, 306);
		} else if (n.upLeft !== T && n.upRight === T && n.downLeft === T && n.downRight === T) {
			pick(54, 108, 54, 144, 54, 180);
		} else if (n.upLeft === T && n.upRight !== T && n.downLeft === T && n.downRight === T) {
			pick(36, 108, 36, 144, 36, 180);
		} else if (n.upLeft === T && n.upRight === T && n.downLeft !== T && n.downRight === T) {
			pick(54, 90, 54, 126, 54, 162);
		} else if (n.upLeft === T && n.upRight === T && n.downLeft === T && n.downRight !== T) {
			pick(36, 90, 36, 126, 36, 162);
		}
	} else if (
		n.up === T &&
		n.down === D &&
		n.left === T &&
		n.right === T &&
		n.upLeft === -1 &&
		n.upRight === -1
	) {
		pick(108, 18, 126, 18, 144, 18);
	} else if (
		n.up === D &&
		n.down === T &&
		n.left === T &&
		n.right === T &&
		n.downLeft === -1 &&
		n.downRight === -1
	) {
		pick(108, 36, 126, 36, 144, 36);
	} else if (
		n.up === T &&
		n.down === T &&
		n.left === D &&
		n.right === T &&
		n.upRight === -1 &&
		n.downRight === -1
	) {
		pick(198, 0, 198, 18, 198, 36);
	} else if (
		n.up === T &&
		n.down === T &&
		n.left === T &&
		n.right === D &&
		n.upLeft === -1 &&
		n.downLeft === -1
	) {
		pick(180, 0, 180, 18, 180, 36);
	} else if (n.up === T && n.down === D && n.left === T && n.right === T) {
		if (n.upRight !== -1) {
			pick(54, 108, 54, 144, 54, 180);
		} else if (n.upLeft !== -1) {
			pick(36, 108, 36, 144, 36, 180);
		}
	} else if (n.up === D && n.down === T && n.left === T && n.right === T) {
		if (n.downRight !== -1) {
			pick(54, 90, 54, 126, 54, 162);
		} else if (n.downLeft !== -1) {
			pick(36, 90, 36, 126, 36, 162);
		}
	} else if (n.up === T && n.down === T && n.left === T && n.right === D) {
		if (n.upLeft !== -1) {
			pick(54, 90, 54, 126, 54, 162);
		} else if (n.downLeft !== -1) {
			pick(54, 108, 54, 144, 54, 180);
		}
	} else if (n.up === T && n.down === T && n.left === D && n.right === T) {
		if (n.upRight !== -1) {
			pick(36, 90, 36, 126, 36, 162);
		} else if (n.downRight !== -1) {
			pick(36, 108, 36, 144, 36, 180);
		}
	} else if (
		(n.up === D && n.down === T && n.left === T && n.right === T) ||
		(n.up === T && n.down === D && n.left === T && n.right === T) ||
		(n.up === T && n.down === T && n.left === D && n.right === T) ||
		(n.up === T && n.down === T && n.left === T && n.right === D)
	) {
		pick(18, 18, 36, 18, 54, 18);
	}
	if (
		(n.up === T || n.up === D) &&
		(n.down === T || n.down === D) &&
		(n.left === T || n.left === D) &&
		(n.right === T || n.right === D)
	) {
		if (
			n.upLeft !== T &&
			n.upLeft !== D &&
			(n.upRight === T || n.upRight === D) &&
			(n.downLeft === T || n.downLeft === D) &&
			(n.downRight === T || n.downRight === D)
		) {
			pick(54, 108, 54, 144, 54, 180);
		} else if (
			n.upRight !== T &&
			n.upRight !== D &&
			(n.upLeft === T || n.upLeft === D) &&
			(n.downLeft === T || n.downLeft === D) &&
			(n.downRight === T || n.downRight === D)
		) {
			pick(36, 108, 36, 144, 36, 180);
		} else if (
			n.downLeft !== T &&
			n.downLeft !== D &&
			(n.upLeft === T || n.upLeft === D) &&
			(n.upRight === T || n.upRight === D) &&
			(n.downRight === T || n.downRight === D)
		) {
			pick(54, 90, 54, 126, 54, 162);
		} else if (
			n.downRight !== T &&
			n.downRight !== D &&
			(n.upLeft === T || n.upLeft === D) &&
			(n.downLeft === T || n.downLeft === D) &&
			(n.upRight === T || n.upRight === D)
		) {
			pick(36, 90, 36, 126, 36, 162);
		}
	}
	if (
		n.up !== D &&
		n.up !== T &&
		n.down === T &&
		n.left !== D &&
		n.left !== T &&
		n.right === T &&
		n.downRight !== D &&
		n.downRight !== T
	) {
		pick(90, 270, 108, 270, 126, 270);
	} else if (
		n.up !== D &&
		n.up !== T &&
		n.down === T &&
		n.left === T &&
		n.right !== D &&
		n.right !== T &&
		n.downLeft !== D &&
		n.downLeft !== T
	) {
		pick(144, 270, 162, 270, 180, 270);
	} else if (
		n.down !== D &&
		n.down !== T &&
		n.up === T &&
		n.left !== D &&
		n.left !== T &&
		n.right === T &&
		n.upRight !== D &&
		n.upRight !== T
	) {
		pick(90, 288, 108, 288, 126, 288);
	} else if (
		n.down !== D &&
		n.down !== T &&
		n.up === T &&
		n.left === T &&
		n.right !== D &&
		n.right !== T &&
		n.upLeft !== D &&
		n.upLeft !== T
	) {
		pick(144, 288, 162, 288, 180, 288);
	} else if (
		n.up !== T &&
		n.up !== D &&
		n.down === T &&
		n.left === T &&
		n.right === T &&
		n.downLeft !== T &&
		n.downLeft !== D &&
		n.downRight !== T &&
		n.downRight !== D
	) {
		pick(144, 216, 198, 216, 252, 216);
	} else if (
		n.down !== T &&
		n.down !== D &&
		n.up === T &&
		n.left === T &&
		n.right === T &&
		n.upLeft !== T &&
		n.upLeft !== D &&
		n.upRight !== T &&
		n.upRight !== D
	) {
		pick(144, 252, 198, 252, 252, 252);
	} else if (
		n.left !== T &&
		n.left !== D &&
		n.down === T &&
		n.up === T &&
		n.right === T &&
		n.upRight !== T &&
		n.upRight !== D &&
		n.downRight !== T &&
		n.downRight !== D
	) {
		pick(126, 234, 180, 234, 234, 234);
	} else if (
		n.right !== T &&
		n.right !== D &&
		n.down === T &&
		n.up === T &&
		n.left === T &&
		n.upLeft !== T &&
		n.upLeft !== D &&
		n.downLeft !== T &&
		n.downLeft !== D
	) {
		pick(162, 234, 216, 234, 270, 234);
	} else if (
		n.up !== D &&
		n.up !== T &&
		(n.down === D || n.down === T) &&
		n.left === D &&
		n.right === D
	) {
		pick(36, 270, 54, 270, 72, 270);
	} else if (
		n.down !== D &&
		n.down !== T &&
		(n.up === D || n.up === T) &&
		n.left === D &&
		n.right === D
	) {
		pick(36, 288, 54, 288, 72, 288);
	} else if (
		n.left !== D &&
		n.left !== T &&
		(n.right === D || n.right === T) &&
		n.up === D &&
		n.down === D
	) {
		pick(0, 270, 0, 288, 0, 306);
	} else if (
		n.right !== D &&
		n.right !== T &&
		(n.left === D || n.left === T) &&
		n.up === D &&
		n.down === D
	) {
		pick(18, 270, 18, 288, 18, 306);
	} else if (n.up === T && n.down === D && n.left === D && n.right === D) {
		pick(198, 288, 216, 288, 234, 288);
	} else if (n.up === D && n.down === T && n.left === D && n.right === D) {
		pick(198, 270, 216, 270, 234, 270);
	} else if (n.up === D && n.down === D && n.left === T && n.right === D) {
		pick(198, 306, 216, 306, 234, 306);
	} else if (n.up === D && n.down === D && n.left === D && n.right === T) {
		pick(144, 306, 162, 306, 180, 306);
	}
	if (n.up !== T && n.up !== D && n.down === T && n.left === T && n.right === T) {
		if ((n.downLeft === D || n.downLeft === T) && n.downRight !== D && n.downRight !== T) {
			pick(0, 324, 18, 324, 36, 324);
		} else if ((n.downRight === D || n.downRight === T) && n.downLeft !== D && n.downLeft !== T) {
			pick(54, 324, 72, 324, 90, 324);
		}
	} else if (n.down !== T && n.down !== D && n.up === T && n.left === T && n.right === T) {
		if ((n.upLeft === D || n.upLeft === T) && n.upRight !== D && n.upRight !== T) {
			pick(0, 342, 18, 342, 36, 342);
		} else if ((n.upRight === D || n.upRight === T) && n.upLeft !== D && n.upLeft !== T) {
			pick(54, 342, 72, 342, 90, 342);
		}
	} else if (n.left !== T && n.left !== D && n.up === T && n.down === T && n.right === T) {
		if ((n.upRight === D || n.upRight === T) && n.downRight !== D && n.downRight !== T) {
			pick(54, 360, 72, 360, 90, 360);
		} else if ((n.downRight === D || n.downRight === T) && n.upRight !== D && n.upRight !== T) {
			pick(0, 360, 18, 360, 36, 360);
		}
	} else if (n.right !== T && n.right !== D && n.up === T && n.down === T && n.left === T) {
		if ((n.upLeft === D || n.upLeft === T) && n.downLeft !== D && n.downLeft !== T) {
			pick(0, 378, 18, 378, 36, 378);
		} else if ((n.downLeft === D || n.downLeft === T) && n.upLeft !== D && n.upLeft !== T) {
			pick(54, 378, 72, 378, 90, 378);
		}
	}
	if (
		(n.up === T || n.up === D) &&
		(n.down === T || n.down === D) &&
		(n.left === T || n.left === D) &&
		(n.right === T || n.right === D) &&
		n.upLeft !== -1 &&
		n.upRight !== -1 &&
		n.downLeft !== -1 &&
		n.downRight !== -1
	) {
		if ((i + j) % 2 === 1) {
			pick(108, 198, 126, 198, 144, 198);
		} else {
			pick(18, 18, 36, 18, 54, 18);
		}
	}
}

/** Blocks that blend into dirt (ChecksForMerge / tileMergeDirt), with their merge flags. */
function blendTable(
	T: number,
	n: Neighbours,
	grassFramed: boolean,
	pick: Pick,
	merge: Merge,
	v: { x: number; y: number }
) {
	if (v.x === -1 && v.y === -1) {
		if (!grassFramed) dropNonSolid(n, T);
		if (n.up > -1 && n.up !== T) {
			n.up = -1;
		}
		if (n.down > -1 && n.down !== T) {
			n.down = -1;
		}
		if (n.left > -1 && n.left !== T) {
			n.left = -1;
		}
		if (n.right > -1 && n.right !== T) {
			n.right = -1;
		}
		if (n.up !== -1 && n.down !== -1 && n.left !== -1 && n.right !== -1) {
			if (n.up === -2 && n.down === T && n.left === T && n.right === T) {
				pick(144, 108, 162, 108, 180, 108);
				merge.up = true;
			} else if (n.up === T && n.down === -2 && n.left === T && n.right === T) {
				pick(144, 90, 162, 90, 180, 90);
				merge.down = true;
			} else if (n.up === T && n.down === T && n.left === -2 && n.right === T) {
				pick(162, 126, 162, 144, 162, 162);
				merge.left = true;
			} else if (n.up === T && n.down === T && n.left === T && n.right === -2) {
				pick(144, 126, 144, 144, 144, 162);
				merge.right = true;
			} else if (n.up === -2 && n.down === T && n.left === -2 && n.right === T) {
				pick(36, 90, 36, 126, 36, 162);
				merge.up = true;
				merge.left = true;
			} else if (n.up === -2 && n.down === T && n.left === T && n.right === -2) {
				pick(54, 90, 54, 126, 54, 162);
				merge.up = true;
				merge.right = true;
			} else if (n.up === T && n.down === -2 && n.left === -2 && n.right === T) {
				pick(36, 108, 36, 144, 36, 180);
				merge.down = true;
				merge.left = true;
			} else if (n.up === T && n.down === -2 && n.left === T && n.right === -2) {
				pick(54, 108, 54, 144, 54, 180);
				merge.down = true;
				merge.right = true;
			} else if (n.up === T && n.down === T && n.left === -2 && n.right === -2) {
				pick(180, 126, 180, 144, 180, 162);
				merge.left = true;
				merge.right = true;
			} else if (n.up === -2 && n.down === -2 && n.left === T && n.right === T) {
				pick(144, 180, 162, 180, 180, 180);
				merge.up = true;
				merge.down = true;
			} else if (n.up === -2 && n.down === T && n.left === -2 && n.right === -2) {
				pick(198, 90, 198, 108, 198, 126);
				merge.up = true;
				merge.left = true;
				merge.right = true;
			} else if (n.up === T && n.down === -2 && n.left === -2 && n.right === -2) {
				pick(198, 144, 198, 162, 198, 180);
				merge.down = true;
				merge.left = true;
				merge.right = true;
			} else if (n.up === -2 && n.down === -2 && n.left === T && n.right === -2) {
				pick(216, 144, 216, 162, 216, 180);
				merge.up = true;
				merge.down = true;
				merge.right = true;
			} else if (n.up === -2 && n.down === -2 && n.left === -2 && n.right === T) {
				pick(216, 90, 216, 108, 216, 126);
				merge.up = true;
				merge.down = true;
				merge.left = true;
			} else if (n.up === -2 && n.down === -2 && n.left === -2 && n.right === -2) {
				pick(108, 198, 126, 198, 144, 198);
				merge.up = true;
				merge.down = true;
				merge.left = true;
				merge.right = true;
			} else if (n.up === T && n.down === T && n.left === T && n.right === T) {
				if (n.upLeft === -2) {
					pick(18, 108, 18, 144, 18, 180);
				}
				if (n.upRight === -2) {
					pick(0, 108, 0, 144, 0, 180);
				}
				if (n.downLeft === -2) {
					pick(18, 90, 18, 126, 18, 162);
				}
				if (n.downRight === -2) {
					pick(0, 90, 0, 126, 0, 162);
				}
			}
		} else {
			if (
				T !== 2 &&
				T !== 23 &&
				T !== 60 &&
				T !== 70 &&
				T !== 109 &&
				T !== 199 &&
				T !== 477 &&
				T !== 492 &&
				T !== 633 &&
				T !== 661 &&
				T !== 662
			) {
				if (n.up === -1 && n.down === -2 && n.left === T && n.right === T) {
					pick(234, 0, 252, 0, 270, 0);
					merge.down = true;
				} else if (n.up === -2 && n.down === -1 && n.left === T && n.right === T) {
					pick(234, 18, 252, 18, 270, 18);
					merge.up = true;
				} else if (n.up === T && n.down === T && n.left === -1 && n.right === -2) {
					pick(234, 36, 252, 36, 270, 36);
					merge.right = true;
				} else if (n.up === T && n.down === T && n.left === -2 && n.right === -1) {
					pick(234, 54, 252, 54, 270, 54);
					merge.left = true;
				}
			}
			if (n.up !== -1 && n.down !== -1 && n.left === -1 && n.right === T) {
				if (n.up === -2 && n.down === T) {
					pick(72, 144, 72, 162, 72, 180);
					merge.up = true;
				} else if (n.down === -2 && n.up === T) {
					pick(72, 90, 72, 108, 72, 126);
					merge.down = true;
				}
			} else if (n.up !== -1 && n.down !== -1 && n.left === T && n.right === -1) {
				if (n.up === -2 && n.down === T) {
					pick(90, 144, 90, 162, 90, 180);
					merge.up = true;
				} else if (n.down === -2 && n.up === T) {
					pick(90, 90, 90, 108, 90, 126);
					merge.down = true;
				}
			} else if (n.up === -1 && n.down === T && n.left !== -1 && n.right !== -1) {
				if (n.left === -2 && n.right === T) {
					pick(0, 198, 18, 198, 36, 198);
					merge.left = true;
				} else if (n.right === -2 && n.left === T) {
					pick(54, 198, 72, 198, 90, 198);
					merge.right = true;
				}
			} else if (n.up === T && n.down === -1 && n.left !== -1 && n.right !== -1) {
				if (n.left === -2 && n.right === T) {
					pick(0, 216, 18, 216, 36, 216);
					merge.left = true;
				} else if (n.right === -2 && n.left === T) {
					pick(54, 216, 72, 216, 90, 216);
					merge.right = true;
				}
			} else if (n.up !== -1 && n.down !== -1 && n.left === -1 && n.right === -1) {
				if (n.up === -2 && n.down === -2) {
					pick(108, 216, 108, 234, 108, 252);
					merge.up = true;
					merge.down = true;
				} else if (n.up === -2) {
					pick(126, 144, 126, 162, 126, 180);
					merge.up = true;
				} else if (n.down === -2) {
					pick(126, 90, 126, 108, 126, 126);
					merge.down = true;
				}
			} else if (n.up === -1 && n.down === -1 && n.left !== -1 && n.right !== -1) {
				if (n.left === -2 && n.right === -2) {
					pick(162, 198, 180, 198, 198, 198);
					merge.left = true;
					merge.right = true;
				} else if (n.left === -2) {
					pick(0, 252, 18, 252, 36, 252);
					merge.left = true;
				} else if (n.right === -2) {
					pick(54, 252, 72, 252, 90, 252);
					merge.right = true;
				}
			} else if (n.up === -2 && n.down === -1 && n.left === -1 && n.right === -1) {
				pick(108, 144, 108, 162, 108, 180);
				merge.up = true;
			} else if (n.up === -1 && n.down === -2 && n.left === -1 && n.right === -1) {
				pick(108, 90, 108, 108, 108, 126);
				merge.down = true;
			} else if (n.up === -1 && n.down === -1 && n.left === -2 && n.right === -1) {
				pick(0, 234, 18, 234, 36, 234);
				merge.left = true;
			} else if (n.up === -1 && n.down === -1 && n.left === -1 && n.right === -2) {
				pick(54, 234, 72, 234, 90, 234);
				merge.right = true;
			}
		}
	}
}

/** The frames every block has: joined to its own type on any combination of sides. */
function basicTable(
	T: number,
	n: Neighbours,
	grassFramed: boolean,
	pick: Pick,
	v: { x: number; y: number }
) {
	if (v.x < 0 || v.y < 0) {
		if (!grassFramed) dropNonSolid(n, T);
		if (T === GRASS) relabel(n, -2, T);
		if (n.up === T && n.down === T && n.left === T && n.right === T) {
			if (n.upLeft !== T && n.upRight !== T) {
				pick(108, 18, 126, 18, 144, 18);
			} else if (n.downLeft !== T && n.downRight !== T) {
				pick(108, 36, 126, 36, 144, 36);
			} else if (n.upLeft !== T && n.downLeft !== T) {
				pick(180, 0, 180, 18, 180, 36);
			} else if (n.upRight !== T && n.downRight !== T) {
				pick(198, 0, 198, 18, 198, 36);
			} else {
				pick(18, 18, 36, 18, 54, 18);
			}
		} else if (n.up !== T && n.down === T && n.left === T && n.right === T) {
			pick(18, 0, 36, 0, 54, 0);
		} else if (n.up === T && n.down !== T && n.left === T && n.right === T) {
			pick(18, 36, 36, 36, 54, 36);
		} else if (n.up === T && n.down === T && n.left !== T && n.right === T) {
			pick(0, 0, 0, 18, 0, 36);
		} else if (n.up === T && n.down === T && n.left === T && n.right !== T) {
			pick(72, 0, 72, 18, 72, 36);
		} else if (n.up !== T && n.down === T && n.left !== T && n.right === T) {
			pick(0, 54, 36, 54, 72, 54);
		} else if (n.up !== T && n.down === T && n.left === T && n.right !== T) {
			pick(18, 54, 54, 54, 90, 54);
		} else if (n.up === T && n.down !== T && n.left !== T && n.right === T) {
			pick(0, 72, 36, 72, 72, 72);
		} else if (n.up === T && n.down !== T && n.left === T && n.right !== T) {
			pick(18, 72, 54, 72, 90, 72);
		} else if (n.up === T && n.down === T && n.left !== T && n.right !== T) {
			pick(90, 0, 90, 18, 90, 36);
		} else if (n.up !== T && n.down !== T && n.left === T && n.right === T) {
			pick(108, 72, 126, 72, 144, 72);
		} else if (n.up !== T && n.down === T && n.left !== T && n.right !== T) {
			pick(108, 0, 126, 0, 144, 0);
		} else if (n.up === T && n.down !== T && n.left !== T && n.right !== T) {
			pick(108, 54, 126, 54, 144, 54);
		} else if (n.up !== T && n.down !== T && n.left !== T && n.right === T) {
			pick(162, 0, 162, 18, 162, 36);
		} else if (n.up !== T && n.down !== T && n.left === T && n.right !== T) {
			pick(216, 0, 216, 18, 216, 36);
		} else if (n.up !== T && n.down !== T && n.left !== T && n.right !== T) {
			pick(162, 54, 180, 54, 198, 54);
		}
	}
}
