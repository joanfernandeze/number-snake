# Number Snake analytics

A Cloudflare Worker with a D1 database that receives one record per finished run and answers
with retention aggregates. No identifiers are received or stored: the device reports "day N
since its first play, Mth distinct day, first run of the day" and the server only counts.

## Deploy (once, from this folder)

1. `npm install`
2. `npx wrangler login` — opens the browser; sign in to your Cloudflare account.
3. `npx wrangler d1 create number-snake-analytics` — copy the `database_id` it prints into
   `wrangler.toml`. This repo's `wrangler.toml` already carries the real `database_id`, so the
   paste is only needed when creating a brand-new database.
4. `npm run schema` — creates the table.
5. `npm run deploy` — prints the Worker URL, e.g. `https://number-snake-analytics.<you>.workers.dev`.
   (Until the secret exists, `/stats` answers 401; `/run` already works.)
6. `npx wrangler secret put STATS_KEY` — paste any long random string; it protects `/stats`.
   Wrangler redeploys with it.
7. In the game, set `ANALYTICS.endpoint` in `src/constants.js` to that URL plus `/run` and push.

## Upgrading an existing deployment (once — campaign, 2026-09-14/15)

The game now sends campaign runs (`mode: 'campaign'`, `cause: 'won'`, a `level`, and the `stars`
the run earned). A Worker deployed before this rejects them, so redeploy **before** pushing the
game. Run the `ALTER TABLE`s before `npm run deploy`: a Worker deployed first answers 500 to every
`/run` and `/stats` until the columns exist. Each `ALTER TABLE` runs once; a second run fails with
"duplicate column name". First upgrade: run 1, 2, 3 in order. If you already ran the `level` line
on an earlier redeploy, run 2 and 3 only.

1. `npx wrangler d1 execute number-snake-analytics --remote --command "ALTER TABLE runs ADD COLUMN level INTEGER"`
2. `npx wrangler d1 execute number-snake-analytics --remote --command "ALTER TABLE runs ADD COLUMN stars INTEGER"`
3. `npm run deploy`

A fresh install gets both columns from `schema.sql` and needs only step 3.

## Read the numbers

`https://number-snake-analytics.<you>.workers.dev/stats?key=<STATS_KEY>` returns:

| Field           | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `newDevices`    | devices seen on their first day                         |
| `d1Percent`     | share of them that played again exactly the next day    |
| `d7Percent`     | share that played on day seven                          |
| `runs`, `avgDurationMs`, `avgBestTile`, `dailyRuns` | volume and quality        |
| `campaignRuns`, `campaignWins` | campaign attempts and how many ended in victory |
| `levels`        | per level: `{ level, runs, wins, threeStars }` — where the win rate collapses is the level to tune; `threeStars` says whether anyone earns the third star |

The game's `docs/PLAYTEST.md` says what counts as a good sign.
