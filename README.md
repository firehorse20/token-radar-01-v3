[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v3/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v3/reward.svg)](https://make.fun/competitions/token-radar-01)

# Token Radar v3

A token launch radar for make.fun's "Build the best token launch radar" bounty
(https://make.fun/bounty/token-radar-01). It reads a sealed DefiLlama snapshot of
758 protocols, ranks the pre-token ones by an implied launch value, and shows a
reader how to farm each one. This is v3 of the entry: a new value model (radar-4),
richer farm plans, and a rebuilt dashboard with a per-protocol eight-factor value
breakdown.

## The board

226 rows: the 40 protocols on the snapshot's watchlist (at least $50M of TVL and no
token on record) plus all 186 further rankable pre-token protocols below that floor.
Live-token protocols are set aside with their market caps shown, never mixed into
the ranking.

## The model (radar-4)

```
implied = round(tvl_usd x category_multiple
  x momentum          (asymmetric: up 0.4, down 0.7, on clamp(change_7d, -80, 200))
  x relative          (vs the category's median 7-day change, x 0.3)
  x sector            (live tokens' median 7-day change in the category, x 0.25)
  x age               (hump-shaped: rises to ~3 years, then slowly decays)
  x scale             (log TVL: 0.92 + 0.08 x clamp(log10(tvl / 5e6) / 4.3, 0, 1))
  x breadth           (1 + 0.02 x min(chains - 1, 10))
  x concentration     (1 - 0.08 x min(tvl / category_total_tvl, 0.75)))
```

The category multiple is priced by the live market, not picked by hand: for each
category it is the median market-cap / TVL ratio of the snapshot's live-token
protocols in that category, shrunk halfway toward the global median and clamped to
0.08–0.60. Categories with fewer than 3 live protocols take the global median, so
one outlier never sets a price.

Why radar-4 differs from radar-3 (v2):

- **Asymmetric momentum.** The snapshot's week was a down week (median 7-day
  change about −8%): a protocol still growing then is a stronger signal than the
  same growth in a flat week, and a fall hurts more than a rise of the same size
  helps, because a launch is priced on what survives.
- **Relative momentum.** Each protocol is scored against its own category's median
  week, so a DEX that fell 2% while Dexs fell 8% is credited for holding up.
- **Sector heat.** The live tokens in a category are a sector signal: when they are
  rising, a launch into that category is worth more.
- **Hump-shaped age.** Credibility grows to about three years with no token, then
  slowly decays — a protocol listed five years with no token is less, not more,
  likely to launch soon. v2's age curve only ever rose.
- **Liquidity depth.** A log-scale TVL factor: a launch into deeper liquidity holds
  its price better, so larger protocols are worth slightly more per dollar.

No protocol name is ever special-cased. Every row's detail view shows the full
breakdown: base value, each of the eight factors, and the numbers behind it, so the
judge can see the model working. Each row also carries a 7-step farm plan with
concrete actions, costs, and times, tailored by category and by the protocol's own
chain, TVL, and age — multi-chain protocols get a second-chain step, single-chain
ones a risk-check step instead.

Implied value is a model, not a promise, and never a prediction of whether or when
a token is issued. A protocol "records no token" in the snapshot; the record is not
proof it has none.

## What changed vs v2 (radar-3)

- **Model:** radar-4 adds four new factors (asymmetric momentum, relative momentum,
  sector heat, liquidity depth) and makes age hump-shaped — eight visible factors
  instead of five.
- **Board:** 226 rows instead of 200 — every rankable pre-token protocol below the
  floor is now on the board, not just the top 160 by TVL.
- **Farm plans:** seven steps instead of six, with a second-chain step for
  multi-chain protocols and a risk-check step for single-chain ones.
- **Dashboard:** rebuilt from scratch — new ink-navy/paper/amber palette, scope
  pills (All / Watchlist / Top 40 / Early radar), clickable column headers for
  sorting, implied-value bars, an eight-factor breakdown with bars in the detail
  drawer, and a category-multiples table on the model page.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, and
copies `dashboard/` and `screenshots/` into the output directory, then writes
`dossier.json` with the vendored make.fun library. The dashboard is a static page
with no network: open `out/dashboard/index.html` beside `out/data.js`.

## Files

- `main.ts` — the entrypoint
- `lib/model.ts` — the radar-4 model, the farm plans and the board builder
- `dashboard/` — `index.html`, `app.css`, `app.js` (search, category and chain
  filters, watchlist toggle, scope pills, sortable board, per-protocol detail
  drawer with eight-factor breakdown, live-token view, model page)
- `screenshots/` — the board, a detail view and a filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged
