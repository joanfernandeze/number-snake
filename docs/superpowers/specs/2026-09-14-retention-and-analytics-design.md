# Retention and Analytics — Design

**Date:** 2026-09-14
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Approved for planning
**Builds on:** `2026-06-30-number-snake-design.md` (the game), the difficulty levels and obstacles of
2026-09-10, and the author's own research in `Gig_idea/docs` (AdMob eCPM benchmarks, web game
packaging, viral web games).

---

## 1. Why this, before any advertising

Monetisation in this genre is downstream of retention. The author's viral-games report puts the
number on it: Chicken Road made $7.5M in two quarters on a D1 retention of 48–52 %, and his AdMob
report says rewarded video only pays when there is session depth to place it in. We have **no
retention data at all**: telemetry lives in each device's `localStorage`, so we can see one
player's runs and nothing about whether anyone comes back.

So the first monetisation work is to be able to **measure** retention across players, and to build
the two mechanics that create it in web puzzle games — a **daily challenge** with a **streak**, and
a **spoiler-free share card**, which the report calls "the single most important viral innovation
of the genre". Advertising comes after we know there is a habit to place it in.

## 2. Analytics without identifying anyone

Retention needs to know that Tuesday's player is Monday's player. The usual answer is a device
identifier, which in the EU is pseudonymous data and drags a consent dialog behind it.

**The device computes its own history and sends only aggregable facts.** Alongside every run
record it already builds, the client adds:

| Field           | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| `daySince`      | days since this device's first ever play (0 on the first day)      |
| `daysPlayed`    | number of distinct days this device has played, including today    |
| `firstOfDay`    | true on the first run of a calendar day                            |
| `daily`         | true when the run was a daily challenge attempt                    |

No identifier travels. The server counts: new devices are records with `daySince = 0` and
`firstOfDay`; devices returning the next day are records with `daySince = 1` and `firstOfDay`.
The ratio is D1. The same shape gives D7 and "days played" distributions. A device that clears its
storage looks new again; that is an acceptable error for a prototype.

**Transport:** a Cloudflare Worker with a D1 (SQLite) database. `POST /run` validates the record's
shape and inserts it; `GET /stats?key=…` returns aggregates behind a shared secret. The client
posts with `navigator.sendBeacon` (falling back to `fetch` with `keepalive`), fire-and-forget:
sending can never block the game and a failure is silently dropped. The endpoint URL lives in
`constants.js`; an empty string disables sending, so the game works unchanged without a backend.
Free tiers cover this with a wide margin. The author owns the Cloudflare account and authorises
deployment; the code, schema and deploy steps are prepared for him.

**Privacy:** nothing personal, nothing identifying, only gameplay facts. A one-line notice on the
game-over panel says so. This is a design position, not legal advice; a real launch should have
a privacy page reviewed by someone qualified.

## 3. Daily challenge

- **Same board for everyone each day.** The seed is derived from the local calendar date, so the
  ritual resets at the player's midnight (Wordle's choice). The daily always plays on **Classic**
  so results are comparable.
- **One attempt counts.** The first run of the day is the daily. Its result is recorded and cannot
  be replaced. Afterwards the player may **practise** the same board as often as they like;
  practice runs are marked as such and never touch the daily record, the streak or the card.
- **Streak** = consecutive local days with a daily completed, no grace days. Missing a day resets
  it to zero; the best streak ever is kept.
- **Entry points:** a **Daily** button on the start screen and on the game-over panel, showing
  today's state: "Daily #N — play" or "Daily #N — 128 · 54 s". `#N` counts days since the
  game's daily epoch (2026-09-14 is Daily #1).
- **State** lives in `localStorage`: a map of date → result, plus the streak. This is also what the
  analytics record marks with `daily: true`.

## 4. Share card

Spoiler-free text in the Wordle tradition, produced by a pure, tested formatter:

```
Number Snake · Daily #42
🐍 Best tile 128 · 54 s · 🔥 7-day streak
https://joanfernandeze.github.io/number-snake/
```

For a normal run the second line drops the streak and the first says the level. A **Share** button
on the game-over panel uses `navigator.share` where it exists (phones) and copies to the clipboard
otherwise, reusing the copy fallback the Stats panel already has. The game's name and URL are
constants so a rename is one line.

## 5. What is deliberately not in this pass

Accounts, cloud save, a leaderboard, any advertising SDK, cosmetics, and a consent dialog (made
unnecessary by §2). Server-side save of progress is noted as important for iOS (Safari evicts PWA
data after seven days) but needs identity, which this pass avoids on purpose.

## 6. Success criteria

After one week with a handful of testers on the public URL:

| Metric (from the Worker's `/stats`)        | Good sign                          |
| ------------------------------------------ | ---------------------------------- |
| D1 (returned the next day)                 | ≥ 30 % (report's winners: 48–52 %) |
| D7                                         | ≥ 10 %                             |
| Runs per session                           | 5+ (spec §2 of the original)       |
| Daily played on ≥ 2 distinct days per device | most returning devices           |
| Share button used                          | at all, by anyone but the author   |

If D1 is under 20 % with the daily in place, the loop is not a habit and the next move is the
mechanic, not the monetisation.

## 7. Open questions for after the data

- Local midnight vs a single global reset, once there are players in more than one timezone.
- Whether the daily should have its own level or stay on Classic.
- Whether a practice run should show a ghost of the daily attempt.
- Which portal (Poki / CrazyGames) to submit to, once retention justifies advertising at all.
