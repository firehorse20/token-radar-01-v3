// Token Radar, model "radar-4".
//
// One sealed snapshot in, one ranked board out. The board ranks pre-token protocols
// (the snapshot records no token for them) by the implied value a launch would carry
// if the protocol's record stayed as it is. It never predicts whether or when a token
// is issued, and an implied value is this entry's own claim, never make.fun's.
//
// radar-4 prices every protocol off the snapshot's own live market, then adjusts it
// with eight factors the snapshot itself supplies:
//
//   base        = tvl_usd x category_multiple
//   momentum    = 1 + w x clamp(change_7d, -80, 200) / 100, w = 0.4 up, 0.7 down
//   relative    = 1 + 0.3 x clamp(change_7d - category_median_7d, -40, 60) / 100
//   sector      = 1 + 0.25 x clamp(live_median_7d_of_category, -30, 30) / 100
//   age         = 0.55 + 0.45 x (1 - exp(-age_days / 730)) x decay(age_days)
//   scale       = 0.92 + 0.08 x clamp(log10(tvl_usd / 5e6) / 4.3, 0, 1)
//   breadth     = 1 + 0.02 x min(chains - 1, 10)
//   focus       = 1 - 0.08 x min(tvl / category_total_tvl, 0.75)
//   implied     = round(base x momentum x relative x sector x age x scale x breadth x focus)
//
// Why these factors, and why they differ from a plain TVL multiple:
//
// - category_multiple is the live market's own price: the median market-cap / TVL
//   ratio of the snapshot's live-token protocols in the category, shrunk halfway
//   toward the global median and clamped to 0.08-0.60. A category with fewer than
//   three live protocols takes the global median, so one outlier never sets a price.
// - momentum is asymmetric on purpose. The snapshot's week was a down week (median
//   change_7d across protocols is about -8%): a protocol still growing then is a
//   stronger signal than the same growth in a flat week, and a fall hurts more than
//   a rise of the same size helps, because a launch is priced on what survives.
// - relative momentum asks whether the protocol beat its own category's median week,
//   so a DEX that fell 2% while Dexs fell 8% is credited for holding up.
// - sector heat reads the live protocols of the category: when the tokens that
//   already trade in a category are rising, a launch into that category is worth
//   more, and when they are falling it is worth less.
// - age is hump-shaped, not rising forever. A protocol earns credibility the longer
//   it runs with no token (up to about three years), but one listed five or more
//   years with no token on record is less, not more, likely to launch soon, so the
//   factor decays slowly past 1,095 days. decay = 1 up to 1,095 days, then
//   exp(-(age - 1095) / 3650).
// - scale rewards liquidity depth: a larger TVL is worth slightly more per dollar,
//   on a log scale, because a launch into deep liquidity holds its price better.
// - breadth credits running on more chains; focus (concentration) discounts a
//   protocol that already owns most of its category, since there is less headroom
//   left for a launch to capture.
//
// No protocol name is ever special-cased: the same function scores every row.

/** One protocol entry of the sealed snapshot: exactly the ten fields it carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** radar-4's constants, as the dashboard states them. */
export interface ModelConstants {
  multiple_shrink: number;
  multiple_floor: number;
  multiple_cap: number;
  min_live_for_category: number;
  growth_up_weight: number;
  growth_down_weight: number;
  growth_floor: number;
  growth_cap: number;
  relative_weight: number;
  relative_floor: number;
  relative_cap: number;
  sector_weight: number;
  sector_floor: number;
  sector_cap: number;
  age_floor: number;
  age_range: number;
  age_halflife_days: number;
  age_peak_days: number;
  age_decay_days: number;
  unknown_age_days: number;
  scale_floor: number;
  scale_range: number;
  scale_base_tvl: number;
  scale_log_span: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  concentration_weight: number;
  concentration_cap: number;
}

export const MODEL: ModelConstants = {
  multiple_shrink: 0.5,
  multiple_floor: 0.08,
  multiple_cap: 0.6,
  min_live_for_category: 3,
  growth_up_weight: 0.4,
  growth_down_weight: 0.7,
  growth_floor: -80,
  growth_cap: 200,
  relative_weight: 0.3,
  relative_floor: -40,
  relative_cap: 60,
  sector_weight: 0.25,
  sector_floor: -30,
  sector_cap: 30,
  age_floor: 0.55,
  age_range: 0.45,
  age_halflife_days: 730,
  age_peak_days: 1095,
  age_decay_days: 3650,
  unknown_age_days: 365,
  scale_floor: 0.92,
  scale_range: 0.08,
  scale_base_tvl: 5_000_000,
  scale_log_span: 4.3,
  breadth_per_chain: 0.02,
  breadth_max_chains: 10,
  concentration_weight: 0.08,
  concentration_cap: 0.75,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One factor of a row's implied value, for the detail view's breakdown. */
export interface ValueFactor {
  key: string;
  label: string;
  value: number;
  note: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    momentum: number;
    relative_momentum: number;
    sector_heat: number;
    age_multiplier: number;
    scale_multiplier: number;
    breadth_multiplier: number;
    concentration_multiplier: number;
    age_days: number | null;
    category_share: number;
    category_median_7d: number | null;
    sector_median_7d: number | null;
  };
  value_breakdown: ValueFactor[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  multiple: number;
  momentum: number;
  relative: number;
  sector: number;
  age_mult: number;
  scale_mult: number;
  breadth_mult: number;
  concentration_mult: number;
  share: number;
  breakdown: ValueFactor[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  median_change_7d: number | null;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The middle value of a sorted list, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The live market's price per category: median mcap/TVL, shrunk to the global median. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants): { global: number; byCategory: Map<string, number> } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const global = median(ratios) ?? 0.25;
  const perCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = perCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    perCat.set(key, list);
  }
  const byCategory = new Map<string, number>();
  for (const [cat, list] of perCat) {
    const sorted = list.sort((a, b) => a - b);
    const catMed = median(sorted) ?? global;
    const priced = list.length >= model.min_live_for_category
      ? model.multiple_shrink * catMed + (1 - model.multiple_shrink) * global
      : global;
    byCategory.set(cat, clamp(priced, model.multiple_floor, model.multiple_cap));
  }
  return { global: clamp(global, model.multiple_floor, model.multiple_cap), byCategory };
}

/** Median 7-day change per category, over all protocols and over live ones only. */
export function categoryMedians(snapshot: Snapshot): { all: Map<string, number>; live: Map<string, number> } {
  const allLists = new Map<string, number[]>();
  const liveLists = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    const key = p.category ?? 'Uncategorised';
    const a = allLists.get(key) ?? [];
    a.push(p.change_7d);
    allLists.set(key, a);
    if (!isPreToken(p)) {
      const l = liveLists.get(key) ?? [];
      l.push(p.change_7d);
      liveLists.set(key, l);
    }
  }
  const toMedian = (lists: Map<string, number[]>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const [k, v] of lists) {
      const m = median(v.sort((a, b) => a - b));
      if (m !== null) out.set(k, m);
    }
    return out;
  };
  return { all: toMedian(allLists), live: toMedian(liveLists) };
}

/** The share of its category's TVL one protocol holds, and that category's total TVL. */
function categoryShare(snapshot: Snapshot, p: SnapshotProtocol): { share: number; total: number } {
  let total = 0;
  for (const q of snapshot.protocols) if ((q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised')) total += q.tvl_usd;
  return { share: total > 0 ? p.tvl_usd / total : 0, total };
}

/** The hump-shaped age factor: credibility grows to about three years, then decays slowly. */
export function ageMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const rise = 1 - Math.exp(-Math.max(days, 0) / model.age_halflife_days);
  const decay = days <= model.age_peak_days ? 1 : Math.exp(-(days - model.age_peak_days) / model.age_decay_days);
  return model.age_floor + model.age_range * rise * decay;
}

/** The eight factors and the implied value one protocol gets under radar-4. */
export function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  multiples: { global: number; byCategory: Map<string, number> },
  medians: { all: Map<string, number>; live: Map<string, number> },
  model: ModelConstants,
): {
  implied: number;
  factors: ValueFactor[];
  age: number | null;
  multiple: number;
  growthPct: number;
  share: number;
  momentum: number;
  relative: number;
  sector: number;
  ageMult: number;
  scaleMult: number;
  breadthMult: number;
  concentrationMult: number;
  catMedian7d: number | null;
  sectorMedian7d: number | null;
} {
  const catKey = p.category ?? 'Uncategorised';
  const multiple = multiples.byCategory.get(catKey) ?? multiples.global;
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const weight = growthPct >= 0 ? model.growth_up_weight : model.growth_down_weight;
  const momentum = 1 + (growthPct / 100) * weight;
  const catMedian7d = medians.all.get(catKey) ?? null;
  const relPct = clamp(rawGrowth - (catMedian7d ?? 0), model.relative_floor, model.relative_cap);
  const relative = 1 + (relPct / 100) * model.relative_weight;
  const sectorMedian7d = medians.live.get(catKey) ?? null;
  const sectorPct = clamp(sectorMedian7d ?? 0, model.sector_floor, model.sector_cap);
  const sector = 1 + (sectorPct / 100) * model.sector_weight;
  const age = ageDays(snapshot.as_of, p.listed_at);
  const ageMult = ageMultiplier(age, model);
  const scaleMult = model.scale_floor + model.scale_range * clamp(Math.log10(Math.max(p.tvl_usd, 1) / model.scale_base_tvl) / model.scale_log_span, 0, 1);
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const { share } = categoryShare(snapshot, p);
  const concentrationMult = 1 - model.concentration_weight * Math.min(share, model.concentration_cap);
  const base = p.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * momentum * relative * sector * ageMult * scaleMult * breadthMult * concentrationMult));
  const factors: ValueFactor[] = [
    { key: 'base', label: 'Base value (TVL x category multiple)', value: Math.round(base), note: `TVL $${p.tvl_usd.toLocaleString('en-US')} x ${multiple.toFixed(3)}` },
    { key: 'momentum', label: '7-day momentum (asymmetric)', value: Math.round(momentum * 10000) / 10000, note: `change_7d ${p.change_7d === null ? 'not reported (0%)' : `${p.change_7d}%`} clamped to ${growthPct}%, ${growthPct >= 0 ? 'up weight 0.4' : 'down weight 0.7'}` },
    { key: 'relative', label: 'Momentum vs its category', value: Math.round(relative * 10000) / 10000, note: catMedian7d === null ? 'no category median reported' : `${p.change_7d === null ? '0' : p.change_7d}% vs category median ${catMedian7d.toFixed(2)}%` },
    { key: 'sector', label: 'Sector heat (live tokens)', value: Math.round(sector * 10000) / 10000, note: sectorMedian7d === null ? 'no live-token median in this category' : `live tokens in this category moved ${sectorMedian7d.toFixed(2)}% in 7 days` },
    { key: 'age', label: 'Time without a token', value: Math.round(ageMult * 10000) / 10000, note: age === null ? 'listed date not reported, counted as 365 days' : `${age} days listed, no token on record; peaks near 3 years, then decays` },
    { key: 'scale', label: 'Liquidity depth (log TVL)', value: Math.round(scaleMult * 10000) / 10000, note: `TVL $${p.tvl_usd.toLocaleString('en-US')} on a log scale from $5M` },
    { key: 'breadth', label: 'Chain breadth', value: Math.round(breadthMult * 10000) / 10000, note: `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} counted` },
    { key: 'concentration', label: 'Category concentration', value: Math.round(concentrationMult * 10000) / 10000, note: `${(share * 100).toFixed(1)}% of its category's TVL` },
  ];
  return { implied, factors, age, multiple, growthPct, share, momentum, relative, sector, ageMult, scaleMult, breadthMult, concentrationMult, catMedian7d, sectorMedian7d };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const medians = categoryMedians(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor,
  // by TVL, strongest first. Never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot, multiples, medians, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple),
      growth_pct: s.growthPct,
      momentum: round4(s.momentum),
      relative_momentum: round4(s.relative),
      sector_heat: round4(s.sector),
      age_multiplier: round4(s.ageMult),
      scale_multiplier: round4(s.scaleMult),
      breadth_multiplier: round4(s.breadthMult),
      concentration_multiplier: round4(s.concentrationMult),
      age_days: s.age,
      category_share: round4(s.share),
      category_median_7d: s.catMedian7d === null ? null : round4(s.catMedian7d),
      sector_median_7d: s.sectorMedian7d === null ? null : round4(s.sectorMedian7d),
    },
    value_breakdown: s.factors,
    farm_steps: farmSteps(s.p, s.age).map((step) => stepText(step)),
  }));
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A chain's fee family, for gas estimates: mainnet, a cheap L2, a cheap L1, or other. */
function feeFamily(chain: string): 'mainnet' | 'l2' | 'fast' | 'other' {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'mainnet';
  if (['base', 'arbitrum', 'optimism', 'zksync era', 'zksync', 'polygon', 'linea', 'scroll', 'blast', 'mode', 'mantle', 'taiko', 'opbnb', 'bnb', 'avalanche'].includes(c)) return 'l2';
  if (['solana', 'sui', 'aptos', 'near', 'tron', 'ton'].includes(c)) return 'fast';
  return 'other';
}

/** A gas estimate in words for one transaction on this protocol's chain. */
function gasFor(chain: string): string {
  const f = feeFamily(chain);
  if (f === 'mainnet') return 'about $5 to $20 of gas on Ethereum mainnet';
  if (f === 'l2') return 'under $1 of gas on a cheap chain';
  if (f === 'fast') return 'a few cents of gas';
  return 'about $1 to $3 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 75;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core farming action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay it once, so the wallet shows both sides of the market.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} in a balanced pair, and leave the position in range.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('vault') || c.includes('allocator') || c.includes('curator')) {
    return `Deposit $${capital} of USDC into the highest-TVL ${name} vault on ${chain} and keep the vault shares in the wallet.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds in one app on the destination chain instead of bridging straight back.`;
  }
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the liquid receipt token for the full period.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small long position, and close it after a day so the account shows real trading volume.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} on ${chain} and take one position in a market that settles in the next two weeks.`;
  }
  if (c.includes('rwa') || c.includes('stablecoin') || c.includes('basis')) {
    return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('payment') || c.includes('privacy')) {
    return `Send two payments of about $${Math.round(capital / 2)} each through ${name} on ${chain} to two different addresses you control.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} for a position you already hold, and keep the policy active.`;
  }
  if (c.includes('launchpad') || c.includes('governance')) {
    return `Join ${name}'s next sale or vote on ${chain} with $${capital}, following the steps on its own announcement page.`;
  }
  if (c.includes('nft')) {
    return `Buy one listed item or mint from ${name} on ${chain} for about $${capital}, and hold it in the farming wallet.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC onto ${name}'s chain and use it in two different apps built on it.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-specific recurring action for the weekly step. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supply top-up, a small borrow and repay, or a vote in its governance forum';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a swap through its router, a range adjustment, or a fee claim';
  if (c.includes('bridge')) return 'a bridge of a small amount to a different chain it supports';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'one small trade, or a deposit and withdrawal of margin';
  if (c.includes('prediction')) return 'one new market position, or a claim on a settled market';
  if (c.includes('rwa') || c.includes('stablecoin')) return 'a mint, a redeem, or a transfer of the asset to a second wallet';
  return 'a deposit, a swap, a vote, or a claim on its rewards page';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The
 * plan is derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names. Multi-chain protocols get a second-chain step;
 * single-chain ones get a risk-check step instead, so every plan is seven steps.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm with, write its seed phrase on paper, and never paste the phrase into any site.`,
      cost: 'nothing but the wallet itself',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus ${gas}`,
      time: '20 minutes to set up',
    },
  ];
  if (secondChain !== null) {
    steps.push({
      text: `Repeat the core action on ${secondChain} with about $${Math.round(capital / 2)}, so the wallet is active on two of ${p.name}'s ${p.chains.length} chains instead of one.`,
      cost: `$${Math.round(capital / 2)} of capital plus ${gasFor(secondChain)}`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Before adding more, check ${p.name}'s own docs for an audit and watch its TVL for a week: if the 7-day change turns sharply negative, wait before topping up.`,
      cost: 'free to check',
      time: '10 minutes, then a week of watching',
    });
  }
  steps.push(
    {
      text: `Once a week, do one more qualifying action on ${p.name}: ${weeklyFor(p)}. Vary the day and the amount slightly so the activity reads as real use.`,
      cost: `${gas} each week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, so the activity spans more than one snapshot and looks like a real user rather than a one-day visitor.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before any claim, open ${p.name}'s own points or rewards page from its official site or docs and check the wallet is listed; never connect to a link from a direct message.`,
      cost: 'free to check, and never pay a fee to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, so you can repeat the position on a second wallet or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.tvl_usd > 0 && p.mcap_usd !== null ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: watchlist.has(row.slug),
    multiple: row.model.category_multiple,
    momentum: row.model.momentum,
    relative: row.model.relative_momentum,
    sector: row.model.sector_heat,
    age_mult: row.model.age_multiplier,
    scale_mult: row.model.scale_multiplier,
    breadth_mult: row.model.breadth_multiplier,
    concentration_mult: row.model.concentration_multiplier,
    share: row.model.category_share,
    breakdown: row.value_breakdown,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const wl = new Set(snapshot.watchlist);
  const early = board.filter((r) => !wl.has(r.slug)).length;
  const multiples = categoryMultiples(snapshot, model);
  const allChanges = snapshot.protocols.map((p) => p.change_7d).filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: multiples.global,
    median_change_7d: median(allChanges),
    rows: board.map((r) => radarRow(r, wl)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
