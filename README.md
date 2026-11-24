# Terrariadle

Daily Terraria guessing games: **Bossdle**, **Accessorydle**, **Modifierdle**, **Accessory Modifierdle**,
**Armordle**, **Tooltipdle**, **Fishdle**, **Critterdle**, **Enemydle** and **Versiondle**.
Pick a guess and every property is compared to the answer: 🟩 match, 🟨 partial, 🟥 miss,
▲▼ the answer is higher/lower. Hints unlock after 4, 7 and 12 guesses.

Based on [Terrariadle](https://github.com/BradyDriebergen/Terrariadle_2.0) by Brady Driebergen
(MIT). The UI is styled after Terraria's own inventory, hotbar and tooltips. Game data and images come from the
[Terraria Wiki](https://terraria.wiki.gg/) (CC BY-NC-SA 3.0). This is an unofficial fan project,
not affiliated with Re-Logic.

## How it works

- **SvelteKit on Vercel.** Pages are prerendered static HTML; `/api/*` runs as one serverless function.
- **No database for game data.** Every boss, accessory and modifier is a JSON file in `src/lib/data/`.
- **The daily answer is computed, not stored.** Each mode walks its answer pool in an order shuffled
  by `DAILY_SECRET` (`src/lib/engine/daily.ts`). No repeats until the pool is used up, no cron jobs.
  Puzzles reset at midnight Sydney time (`RESET_TIME_ZONE`).
- **Player progress lives in the browser** (`localStorage`), like Wordle.
- **The only server state** is the "you were the Nth person" counter, in Upstash Redis. Without
  Redis configured it falls back to memory, which is fine for local development.
- **Guesses and hints are cacheable.** `GET /api/boss/guess?id=…&day=…` depends only on its URL,
  so Vercel's CDN serves repeat guesses without running a function. Requests for any day other
  than today are rejected, so nobody can peek at tomorrow's answer.

```
src/lib/engine/   compare.ts (green/yellow/red/arrows), daily.ts (answer picking), types.ts
src/lib/games/    one config per mode: columns, hints, theme (+ data tests)
src/lib/ui/       Terraria menu components: Panel, Button, IconButton, TextField, Icon
src/lib/data/     one JSON file per game (bosses.json, critters.json, …)
src/lib/server/   answers.ts (secret answer), counter.ts (Redis)
src/routes/[mode=mode]/   the game page, shared by every mode
src/routes/api/[mode=mode]/   today, guess, hint, solve
```

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test && npm run check && npm run lint
```

`npm test` also validates the data: unknown values (typos), duplicate ids and any two entries with
identical stats, which players couldn't tell apart, all fail the test run.

### Dev tools

`npm run dev` and Vercel preview deployments add a **🛠 Dev** button (or press the backtick key).
The panel lets you:

- **Answer:** see today's answer, reroll it at random, or pick a specific one. Forced answers
  only last until the day changes, and rerolling clears your progress for that mode.
- **Time travel:** move the game a day forward or back to test the reset and yesterday's answer.
- **Player:** auto-solve through the real API, unlock all hints, reset your progress for one or
  every mode, and reset the solve counts.
- **Schedule:** the next 14 scheduled answers for each mode.
- **Tasks** (local only): run the wiki sync (report or write), image download, tests and
  type-check, with their output in the panel.

All of it is off in production: `/api/dev` and `/ui` return 404 and the panel isn't in the
build. Local dev and previews use their own `dev:` / `preview:` keys in Redis, so they can't touch
real solve counts. Previews also ignore `DAILY_SECRET`, so their dev tools can't reveal production
answers.

On a preview, rerolls and time travel are saved in Redis so every serverless function sees them.
Without Redis available to the Preview environment they only last within one function instance.

## Deploy to Vercel

1. Import the repository in Vercel. It detects SvelteKit; no settings needed.
2. Add the environment variable `DAILY_SECRET` (any long random string). **Required**: without it
   the API refuses to run, because anyone could compute the answers from this public code.
3. Optional: add Upstash Redis from the Vercel Marketplace (Storage tab). It sets
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which enables solve counts.

Changing `DAILY_SECRET`, or adding or removing entries, reshuffles the answer order, which can
change the current day's answer. Deploy those changes just after midnight Sydney time.

## Game data and the wiki

Stats come from the [Terraria Wiki](https://terraria.wiki.gg/)'s data tables:

```bash
npm run sync-wiki
```

```bash
npm run sync-wiki -- --write
```

The first reports differences; `--write` applies them. `--only=fish,boss` syncs just those games
(boss, armor, tooltip, accessory, modifier, fish, critter, enemy, version).

| Data        | From the wiki                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Curated by hand                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Bosses      | Max HP (Classic, all parts), defense; checks the drop hint                                                                                                                                                                                                                                                                                                                                                                                                     | stage, biome, summon, body type, time, hints |
| Accessories | rarity, hardmode, defense, expert-only, crafting tier, tooltip, image; checks the source                                                                                                                                                                                                                                                                                                                                                                       | function, class boost, source, "where found" |
| Modifiers   | everything (rebuilt from the Modifiers page)                                                                                                                                                                                                                                                                                                                                                                                                                   | the skip list in the script                  |
| Armor       | everything: every armor set (one entry per class variant, e.g. Chlorophyte armor (Summon)), plus Wizard hats and single pieces: total defense, rarity, category, class, how it's obtained, set bonus                                                                                                                                                                                                                                                           | nothing                                      |
| Tooltips    | every item with a tooltip (minus armor, paintings, treasure bags, banners); only unique tooltips are answers. Tooltip text is server-only (`src/lib/server/tooltip-text.json`)                                                                                                                                                                                                                                                                                 | nothing                                      |
| Fish        | every Angler quest fish: height and biome (hints). The quote is revealed a word at a time (`/api/fish/clue`) and words revealed count in the score. It's server-only (`src/lib/server/fish-quotes.json`), with the fish's own name replaced by ???                                                                                                                                                                                                             | nothing                                      |
| Critters    | the Critters page's main, butterfly, dragonfly and gold critter tables: environment, AI type, rarity, sell price, bait power (n/a is None). The coloured dragonflies are one entry; gem squirrels and gem bunnies are groups where any member is a correct guess (`group` in the data)                                                                                                                                                                         | the merge/group lists in the script          |
| Enemies     | every enemy on the Enemies page except bosses, event bosses, boss servants and unspawnable ones (special seed enemies included): Hardmode, HP, attack (Classic; worms use the head), AI type, Lifeform Analyzer rare, event, banner. Hardmode comes from the page section, Hardmode-only events, or the wiki's Hardmode-only category. 1.4.5's bonus-drop slime variants (Dirt Slime, Torch Slime…) are skipped: they copy the stats of the slime they replace | the skip list in the script                  |
| Versions    | every desktop version an accessory was added or changed in, with its release date (Desktop version history page). Which version added / changed each accessory comes from the wiki's History data, including accessories that share a page (Wings, Strings, Watches…), and is server-only (`src/lib/server/version-puzzles.json`)                                                                                                                              | `VERSION_RENAMED` in the script              |

**Accessories are imported automatically.** Every playable accessory on the wiki is added
(not vanity, music boxes, developer items or console-only items). New ones get best-guess
Function, Class Boost, Source and "where" values from the wiki's tags, drops, recipes and
tooltips, marked `"reviewed": false`, and are listed in
[`review/accessories.md`](review/accessories.md). After checking one, delete its
`"reviewed": false` and the sync won't touch those columns again. Imported accessories can be
guessed but aren't daily answers until you delete their `"pool": false`. Entries that would be
identical to another in every column are hidden with `"exclude"` and listed in the review file.

Anything it can't decide is printed under "Needs attention". After adding entries, run
`npm run fetch-images` to download their images into `static/` (the site never hotlinks the
wiki) and `npm test` to catch typos and lookalike entries.

## UI components

`src/lib/ui/` holds reusable components styled after Terraria's menus (bestiary, character and
world creation). Their styles live in `src/app.css` and the icons in `static/ui/` come from the
wiki's [UI images](https://terraria.wiki.gg/wiki/Category:UI_images). `/ui` shows every component and
state in `npm run dev` and on previews.

## Sky

The background is Terraria's main-menu sky on Sydney time (`src/lib/sky/`): day runs 4:30 AM to
7:30 PM and night 7:30 PM to 4:30 AM, exactly as in the game (one game tick per real second).
The sky, sun and moon colours and the sun and moon's path follow the game's own formulas, the
moon shows the real moon phase, and the textures in `static/sky/` (forest background, clouds,
sun, moon) come from the wiki. Dev tools: add `?skytime=21:30` to a URL to see another time.

## Adding a game mode

1. Add `src/lib/data/<things>.json`.
2. Add `src/lib/games/<thing>.ts` exporting a `GameConfig`: its columns (`exact`, `number`,
   `ranked`, `set` or `stats`), three hints and a rarity theme.
3. Register it in `src/lib/games/index.ts`. The routes, header and home page pick it up.
