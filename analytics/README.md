# Number Snake analytics

A Cloudflare Worker with a D1 database that receives one record per finished run and answers
with retention aggregates. No identifiers are received or stored: the device reports "day N
since its first play, Mth distinct day, first run of the day" and the server only counts.

## Deploy (once, from this folder)

1. `npm install`
2. `npx wrangler login` — opens the browser; sign in to your Cloudflare account.
3. `npx wrangler d1 create number-snake-analytics` — copy the `database_id` it prints into
   `wrangler.toml`.
4. `npm run schema` — creates the table.
5. `npm run deploy` — prints the Worker URL, e.g. `https://number-snake-analytics.<you>.workers.dev`.
   (Until the secret exists, `/stats` answers 401; `/run` already works.)
6. `npx wrangler secret put STATS_KEY` — paste any long random string; it protects `/stats`.
   Wrangler redeploys with it.
7. In the game, set `ANALYTICS.endpoint` in `src/constants.js` to that URL plus `/run` and push.

## Read the numbers

`https://number-snake-analytics.<you>.workers.dev/stats?key=<STATS_KEY>` returns:

| Field           | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `newDevices`    | devices seen on their first day                         |
| `d1Percent`     | share of them that played again exactly the next day    |
| `d7Percent`     | share that played on day seven                          |
| `runs`, `avgDurationMs`, `avgBestTile`, `dailyRuns` | volume and quality        |

The game's `docs/PLAYTEST.md` says what counts as a good sign.
