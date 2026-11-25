# tools/verify: checking ports against the game's own code

Some of the site is ported from Terraria 1.4.5 (the little world in `src/lib/world`, the coin
drop in `src/lib/coins`). These tools check a port the strongest way available: run the
**game's own code** on the same inputs and compare the answers, exhaustively where the inputs
can be enumerated and by fuzzing where they can't.

```
decompiled game source ──extract.mjs──▶ oracle/game/*.cs ─┐
                                        oracle/stubs/*.cs ├─▶ Oracle.dll (the "oracle")
                                     oracle/features/*.cs ┘        │
                                                                   ▼
src/lib/... (the port) ◀── features/*.ts ── *.verify.ts ──▶ same cases, compared
```

- **`oracle/`** is a .NET console app. `game/` holds the game's code, extracted from the
  decompiled source (git-ignored: it's the game's, never committed). `stubs/` stands in for the
  rest of the game (ours). `features/` adapts a case to a game call (ours).
- **`extract.mjs`** copies the members listed in `oracle/sources.json` out of the decompiled
  source, every overload, and rewrites the decompiler's artefacts into plain C#. Empty
  `catch {}` blocks are rewritten to report what they caught, so a case can't quietly fail.
- **`build.mjs`** extracts and compiles, and while the compiler can't find a name that the
  game's source declares as a field or small method of the same class (or of a class it
  `inherits` from), adds it to that source's `auto` list and goes again. Types nobody provides
  get **placeholders** (`game/AutoStubs.cs`: empty classes with `dynamic` members), so the code
  compiles; using one at run time throws, refusing the case. What's left it prints, for a
  stub or a decision. A source's `stubbed` list keeps members out, for a hand stub instead.
- **Slices**: `"slices": [{ "name", "from", "to", "after" }]` in a source turns part of a long
  method (between two lines, until its braces balance) into a method of its own, so the oracle
  can run, say, just the movement parts of `Player.Update`, still as the game's code.
- **Stubs that mustn't run** call `Stub.Hit(...)`: the oracle then refuses the case (it
  answers `{"stubs": [...]}`), so a case can't take a path we haven't extracted. A stub for
  something that runs every frame copies the game's own first check, and refuses only past it.
- **`port/`** has a small C# → TypeScript converter for straight-line game code (if/else,
  comparisons, assignments, the game's three-variant frame picks), used to generate tables
  like `src/lib/world/frame-tables.ts`. It refuses lines it doesn't understand.
- **`*.verify.ts`** are Vitest suites (`npm run verify`) that send cases to the oracle and to
  the port and compare. They're skipped when the oracle isn't built.
- **Fixtures**: `RECORD=1 npm run verify` also saves a sample of the game's answers into
  `src/lib/**/fixtures/`, which the normal `npm test` replays, so the ports stay checked
  without the game.

## Running it

You need the .NET 8 SDK and the decompiled game (ILSpy's `ilspycmd -p` output of
`Terraria.exe`: the folder with `Terraria/`, `Terraria.ID/`, … in it).

```bash
TERRARIA_SRC=/path/to/decompiled/src node tools/verify/build.mjs
```

```bash
npm run verify
```

```bash
VERIFY_WORLDS=200000 VERIFY_SEED=7 npm run verify
```

```bash
RECORD=1 npm run verify
```

`build.mjs` builds the oracle. `npm run verify` runs every comparison: framing checks every 3x3
neighbourhood plus 20,000 random worlds. Use `VERIFY_WORLDS` and `VERIFY_SEED` to fuzz more or
differently, and `RECORD=1` to refresh the replayed fixtures.

To regenerate the frame tables after the converter or anchors change:

```bash
node tools/verify/port/frame-tables.mjs
```

## What's verified

| Port                                           | Against                                                      | How                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/lib/world/framing.ts` + `frame-tables.ts` | `WorldGen.TileFrame`, `TileFrameCosmetic`, `SquareTileFrame` | all 589,824 3x3 neighbourhoods; random worlds framed, then edited (place, break, grass knocked to dirt)                |
| `TILE_DATA` in `framing.ts`                    | `Main.tile*`, `TileID.Sets.*` after the game's own setup     | `data.verify.ts`, via the `lookup` feature                                                                             |
| `src/lib/world/collision.ts`                   | `Collision.TileCollision`, `StepUp`, `StepDown`              | 200,000 random bodies (player- and item-sized, on grid edges and off) near random ground                               |
| `src/lib/world/player.ts`                      | `Player.Update` for a plain player (see below)               | 5,000 random walks of up to 300 frames, every frame's position, velocity, jump state, step glide and body / leg frames |

Each random suite also checks that its cases really cover what they should (landing, walls,
ceilings and steps for collision; steps up and down, ceiling bumps, full speed, turning, jumps,
landings and stops for movement), so a pass can't come from cases that never get there.

Things the comparisons turned up that reading the code had missed: dirt reframes a stone
neighbour before asking whether it blends; a block's frame change reframes its neighbours; the
fall speed is 10.01, not 10; a run settles around 3 by overshooting and braking; the head bump
reads `Collision.up` after `SlopingCollision` has reset it; and `StepConveyorBelt`, run every
frame, moves the player 5 px down and back up, which in floats can shift it by a hair.

### The movement oracle

`Player.Update` is thousands of lines; the oracle runs the parts a plain player (no items held,
armour, accessories, mount, buffs; dry, on full blocks) goes through, as **slices** of the
game's own `Update` (see `oracle/sources.json`) called in the game's order, plus the game's
`HorizontalMovement`, `JumpMovement`, `DryCollision`, `SlopingCollision`, `PlayerFrame` and
everything they reach. What it leaves out, and why, is in `oracle/stubs/` and
`oracle/features/Movement.cs`: visual-only methods (wing frames, dust, particles; checked not
to touch movement or animation) do nothing, and everything a plain player can't reach (wings,
mounts, liquid, dashing into enemies, armour sets...) refuses the case if it's ever reached.
The world's "space" gravity factor is left out: it's 1 at the surface of a normal-sized world.

Pass `"trace": true` in a movement case to get the position and velocity after each step of
every frame, for finding where a port parts from the game.

## Verifying a new feature

Say the next port is an enemy's AI (`NPC.AI_003_Fighters`, say):

1. **Extract it.** Add the members to `oracle/sources.json` (for example
   `{ "file": "Terraria/NPC.cs", "class": "NPC", "members": ["AI_003_Fighters"] }`) and
   run `build.mjs`. Stub what it reports as missing in `oracle/stubs/` (call `Stub.Hit` in
   anything the feature shouldn't reach), or list it in `members` if it's real logic.
2. **Adapt it.** Write `oracle/features/Fighter.cs` (an `IFeature`: a JSON case in, the game's
   result out, setting up `Main.tile` and the like) and register it in `Program.cs`.
3. **Mirror it.** Write `features/fighter.ts`: the case type, `runFighter(case)` calling the
   port, and generators (every input when there are few, else seeded random ones).
4. **Compare.** Write `fighter.verify.ts` like `movement.verify.ts`, with `verify()`: it streams
   batches and reports the first mismatches. Add a check that the cases reach every behaviour.
5. **Record.** Run `RECORD=1 npm run verify` and add a replay test next to the port.

`lookup` reads any static game table by name (`{"fields": ["Main.tileSolid"], "indices":
[0, 1]}`): use it to check the data a port assumes, as `data.verify.ts` does.

## Floats

The game computes in single-precision floats, so the ports round every float operation
(`Math.fround`, as `f`); its few double fields (the animation counters) stay doubles. The
oracle's answers come back as JSON text and are rounded back to singles before comparing.

## Equivalences relied on

- The oracle can't feed the game's random numbers (`Main.rand` isn't virtual). Framing's only
  random draw is the centre block's new variant when `SquareTileFrame` resets it, so the cases
  set that variant first and frame without the reset: the same thing, with the variant chosen
  by the case. The port takes the variant as an argument in the same way.
