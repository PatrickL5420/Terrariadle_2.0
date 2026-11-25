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
  game's source declares as a field or small method of the same class, adds it to that
  source's `auto` list and goes again. What's left it prints, for a stub or a decision.
- **Stubs that mustn't run** call `Stub.Hit(...)`: the oracle then refuses the case (it
  answers `{"stubs": [...]}`), so a case can't take a path we haven't extracted.
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

| Port                                           | Against                                                      | How                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/lib/world/framing.ts` + `frame-tables.ts` | `WorldGen.TileFrame`, `TileFrameCosmetic`, `SquareTileFrame` | all 589,824 3x3 neighbourhoods; random worlds framed, then edited (place, break, grass knocked to dirt) |
| `TILE_DATA` in `framing.ts`                    | `Main.tile*`, `TileID.Sets.*` after the game's own setup     | `data.verify.ts`, via the `lookup` feature                                                              |

## Verifying a new feature

Say the next port is `Collision.TileCollision`:

1. **Extract it.** Add the members to `oracle/sources.json` (for example
   `{ "file": "Terraria/Collision.cs", "class": "Collision", "members": ["TileCollision"] }`) and
   run `build.mjs`. Stub what it reports as missing in `oracle/stubs/` (call `Stub.Hit` in
   anything the feature shouldn't reach), or list it in `members` if it's real logic.
2. **Adapt it.** Write `oracle/features/Collision.cs` (an `IFeature`: a JSON case in, the game's
   result out, setting up `Main.tile` and the like) and register it in `Program.cs`.
3. **Mirror it.** Write `features/collision.ts`: the case type, `runCollision(case)` calling the
   port, and generators (every input when there are few, else seeded random ones).
4. **Compare.** Write `collision.verify.ts` like `framing.verify.ts`: `oracle('collision',
cases)` against `cases.map(runCollision)`, with `report()` on mismatches.
5. **Record.** Run `RECORD=1 npm run verify` and add a replay test next to the port.

`lookup` reads any static game table by name (`{"fields": ["Main.tileSolid"], "indices":
[0, 1]}`): use it to check the data a port assumes, as `data.verify.ts` does.

## Equivalences relied on

- The oracle can't feed the game's random numbers (`Main.rand` isn't virtual). Framing's only
  random draw is the centre block's new variant when `SquareTileFrame` resets it, so the cases
  set that variant first and frame without the reset: the same thing, with the variant chosen
  by the case. The port takes the variant as an argument in the same way.
