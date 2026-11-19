# Terrariadle

Daily Terraria guessing games: **Boss Guesser**, **Accessory Guesser** and **Modifier Guesser**.
Pick a guess and every property is compared to the answer: 🟩 match, 🟨 partial, 🟥 miss,
▲▼ the answer is higher/lower. Hints unlock after 4, 7 and 12 guesses.

Visuals are from [Terrariadle](https://github.com/BradyDriebergen/Terrariadle_2.0) by Brady
Driebergen (MIT). Game data and images come from the
[Terraria Wiki](https://terraria.wiki.gg/) (CC BY-NC-SA 3.0). This is an unofficial fan project,
not affiliated with Re-Logic.

## How it works

- **SvelteKit on Vercel.** Pages are prerendered static HTML; `/api/*` runs as one serverless function.
- **No database for game data.** Every boss, accessory and modifier is a JSON file in `src/lib/data/`.
- **The daily answer is computed, not stored.** Each mode walks its answer pool in an order shuffled
  by `DAILY_SECRET` (`src/lib/engine/daily.ts`). No repeats until the pool is used up, no cron jobs.
  Puzzles reset at midnight US Eastern (`RESET_TIME_ZONE`).
- **Player progress lives in the browser** (`localStorage`), like Wordle.
- **The only server state** is the "you were the Nth person" counter, in Upstash Redis. Without
  Redis configured it falls back to memory, which is fine for local development.
- **Guesses and hints are cacheable.** `GET /api/boss/guess?id=…&day=…` depends only on its URL,
  so Vercel's CDN serves repeat guesses without running a function. Requests for any day other
  than today are rejected, so nobody can peek at tomorrow's answer.

```
src/lib/engine/   compare.ts (green/yellow/red/arrows), daily.ts (answer picking), types.ts
src/lib/games/    one config per mode: columns, hints, theme (+ data tests)
src/lib/data/     bosses.json, accessories.json, modifiers.json
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

## Deploy to Vercel

1. Import the repository in Vercel. It detects SvelteKit; no settings needed.
2. Add the environment variable `DAILY_SECRET` (any long random string). **Required**: without it
   the API refuses to run, because anyone could compute the answers from this public code.
3. Optional: add Upstash Redis from the Vercel Marketplace (Storage tab). It sets
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which enables solve counts.

Changing `DAILY_SECRET`, or adding or removing entries, reshuffles the answer order, which can
change the current day's answer. Deploy those changes just after midnight Eastern.

## Images

Boss sprites are in `static/bosses/`. Accessory images still point at the wiki (`"wiki:File.png"`
in the data). Before deploying, download them so the site doesn't hotlink the wiki:

```bash
npm run fetch-images
```

That saves them into `static/accessories/` and rewrites the data file to use the local copies.

## Adding a game mode

1. Add `src/lib/data/<things>.json`.
2. Add `src/lib/games/<thing>.ts` exporting a `GameConfig`: its columns (`exact`, `number`,
   `ranked`, `set` or `stats`), three hints and a rarity theme.
3. Register it in `src/lib/games/index.ts`. The routes, header and home page pick it up.

## Data status

The stats were entered by hand and still need checking against the wiki, especially accessory
rarities, crafting tiers and event-boss values. Please fix anything wrong in the JSON.
