// Token Radar v3 dashboard: board, detail drawer, live tokens, model panel.
// Reads window.RADAR (written by main.ts as data.js). No fetch, no network.
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');
const state = { q: '', cat: '', chain: '', wl: false, scope: 'all', sort: 'rank', dir: 1 };

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return money(n);
};
const pct = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const ageText = (d) => (d === null || d === undefined ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fill the header stats, the footer, and the model tab's fixed numbers. */
function fillChrome() {
  const med = R.rows[Math.floor(R.rows.length / 2)].implied_value_usd;
  $('stats').innerHTML =
    stat(moneyShort(R.rows[0].implied_value_usd), 'Top implied value') +
    stat(String(R.board_size), 'Protocols ranked') +
    stat(String(R.watchlist_size), 'On the watchlist') +
    stat(moneyShort(med), 'Median implied value');
  $('asof').textContent = R.as_of;
  $('src').textContent = 'Source: ' + R.source;
  $('gmult').textContent = R.global_multiple.toFixed(3);
  $('medchg').textContent = R.median_change_7d === null ? 'not reported' : R.median_change_7d.toFixed(2) + '%';
  $('coverage').textContent = `The board ranks ${R.board_size} pre-token protocols: all ${R.watchlist_size} of the snapshot's watchlist plus ${R.early_size} early ones below the $50M floor, chosen by TVL. ${R.live_size} protocols whose token already trades are set aside in the Live tokens tab, where the market — not the model — prices them.`;
  const cats = [...new Set(R.rows.map((r) => r.category || 'Uncategorised'))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
  $('factrows').innerHTML = [
    ['TVL × category multiple', 'Base value, priced off the live market in the same category', '0.08–0.60'],
    ['Momentum (asymmetric)', '7-day TVL change; falls count 0.7, rises 0.4 — a launch is priced on what survives', '0.44–1.80'],
    ['Momentum vs category', 'Did it beat its own category median week?', '0.88–1.18'],
    ['Sector heat', 'Live tokens in its category: rising sector, worth more', '0.93–1.08'],
    ['Age (hump-shaped)', 'Credibility grows to ~3 years with no token, then slowly decays', '0.55–1.00'],
    ['Liquidity depth', 'Log-scale TVL: deeper liquidity holds a launch price better', '0.92–1.00'],
    ['Chain breadth', 'More chains, more reach', '1.00–1.20'],
    ['Category concentration', 'Owning most of a category leaves less headroom', '0.94–1.00'],
  ].map((f) => `<tr><td><strong>${f[0]}</strong></td><td>${f[1]}</td><td class="num">${f[2]}</td></tr>`).join('');
  // Category multiples: one row per category on the board, with live counts and medians.
  const liveByCat = {};
  for (const l of R.live) {
    const k = l.category || 'Uncategorised';
    (liveByCat[k] = liveByCat[k] || []).push(l);
  }
  const byCat = {};
  for (const r of R.rows) {
    const k = r.category || 'Uncategorised';
    if (!byCat[k]) byCat[k] = r.multiple;
  }
  $('catrows').innerHTML = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map((k) => {
    const live = liveByCat[k] || [];
    const meds = live.map((l) => l.change_7d).filter((v) => v !== null).sort((a, b) => a - b);
    const med = meds.length ? meds[Math.floor(meds.length / 2)] : null;
    return `<tr><td>${esc(k)}</td><td class="num">${byCat[k].toFixed(3)}</td><td class="num">${live.length}</td><td class="num">${med === null ? '—' : pct(med)}</td></tr>`;
  }).join('');
}
function stat(v, label) { return `<div class="stat"><b>${esc(v)}</b><span>${esc(label)}</span></div>`; }

/** The rows after scope, search and filters, in the chosen sort order. */
function filtered() {
  let list = R.rows;
  if (state.scope === 'watchlist' || state.wl) list = list.filter((r) => r.watchlist);
  else if (state.scope === 'top40') list = list.filter((r) => r.rank <= 40);
  else if (state.scope === 'early') list = list.filter((r) => !r.watchlist);
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  }
  if (state.cat) list = list.filter((r) => (r.category || 'Uncategorised') === state.cat);
  if (state.chain) list = list.filter((r) => r.chains.includes(state.chain));
  const key = state.sort;
  const dir = state.dir;
  const cmp = {
    rank: (a, b) => a.rank - b.rank,
    implied: (a, b) => a.implied_value_usd - b.implied_value_usd,
    tvl: (a, b) => a.tvl_usd - b.tvl_usd,
    chg: (a, b) => (a.change_7d ?? -9999) - (b.change_7d ?? -9999),
    age: (a, b) => (a.age_days ?? -1) - (b.age_days ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
    cat: (a, b) => (a.category || '').localeCompare(b.category || ''),
  }[key] || ((a, b) => a.rank - b.rank);
  return [...list].sort((a, b) => dir * cmp(a, b));
}

const maxImplied = R.rows[0].implied_value_usd;

/** One board row's HTML. */
function rowHtml(r) {
  const chg = r.change_7d === null ? '<span>—</span>' : `<span class="${r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</span>`;
  const chains = r.chains.length === 0 ? '—' : esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : '');
  const barW = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
  return `<tr data-slug="${esc(r.slug)}">
    <td class="num rank">${r.rank}</td>
    <td><span class="name">${esc(r.name)}</span>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<span class="sub">${esc(r.slug)}</span></td>
    <td>${esc(r.category || '—')}</td>
    <td>${chains}</td>
    <td class="num">${moneyShort(r.tvl_usd)}</td>
    <td class="num">${chg}</td>
    <td class="num">${ageText(r.age_days)}</td>
    <td class="num"><strong>${money(r.implied_value_usd)}</strong><span class="bar" style="width:${Math.min(barW, 90)}px"></span></td>
  </tr>`;
}

function render() {
  const list = filtered();
  rowsEl.innerHTML = list.map(rowHtml).join('');
  $('count').textContent = `${list.length} of ${R.board_size} shown`;
  document.querySelectorAll('#board th.sortable').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.k === state.sort);
  });
}

/** The detail drawer for one protocol: facts, eight-factor breakdown, farm plan. */
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const f = r.breakdown;
  const barFor = (v) => {
    const w = Math.max(4, Math.min(100, Math.round(((v - 0.7) / 0.8) * 100)));
    return `<div class="fbar"><i class="${v < 1 ? 'neg' : ''}" style="width:${w}%"></i></div>`;
  };
  const factors = f.map((x) => {
    if (x.key === 'base') {
      return `<div class="factor"><div class="frow"><span>${esc(x.label)}</span><b>${money(x.value)}</b></div><p class="fnote">${esc(x.note)}</p></div>`;
    }
    return `<div class="factor"><div class="frow"><span>${esc(x.label)}</span><b>${x.value.toFixed(3)}×</b></div>${barFor(x.value)}<p class="fnote">${esc(x.note)}</p></div>`;
  }).join('');
  $('detail').innerHTML =
    `<h2>#${r.rank} ${esc(r.name)}</h2>
    <p class="meta">${esc(r.slug)} · ${esc(r.category || 'Uncategorised')} · ${esc(r.chains.join(', ') || 'no chain listed')}${r.watchlist ? ' · <span class="badge">WATCHLIST</span>' : ''}</p>
    <div class="kv">
      <div><b>${money(r.implied_value_usd)}</b><span>Implied value</span></div>
      <div><b>${moneyShort(r.tvl_usd)}</b><span>TVL</span></div>
      <div><b>${pct(r.change_7d)}</b><span>7-day change</span></div>
      <div><b>${ageText(r.age_days)}</b><span>Listed, no token on record</span></div>
      <div><b>${r.multiple.toFixed(3)}×</b><span>Category multiple</span></div>
      <div><b>${(r.share * 100).toFixed(1)}%</b><span>Of its category's TVL</span></div>
    </div>
    <p class="meta">Implied value is this radar's own model (radar-4), not a promise. The protocol records no token in the snapshot; the record is not proof it has none.</p>
    <h3>Why this value — eight factors</h3>
    ${factors}
    <h3>How to farm it — ${r.farm_steps.length} steps</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('drawer').hidden = false;
  $('scrim').hidden = false;
}
function closeDetail() {
  $('drawer').hidden = true;
  $('scrim').hidden = true;
  if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
}

/** The live-token table. */
function renderLive() {
  $('liverows').innerHTML = R.live.map((l) => `<tr>
    <td><span class="name">${esc(l.name)}</span><span class="sub">${esc(l.slug)}</span></td>
    <td>${esc(l.category || '—')}</td>
    <td>${esc(l.chains.slice(0, 2).join(', '))}${l.chains.length > 2 ? ` +${l.chains.length - 2}` : ''}</td>
    <td class="num">${moneyShort(l.tvl_usd)}</td>
    <td class="num">${l.mcap_usd === null ? '—' : moneyShort(l.mcap_usd)}</td>
    <td class="num">${l.mcap_tvl === null ? '—' : l.mcap_tvl.toFixed(3) + '×'}</td>
    <td class="num">${l.change_7d === null ? '—' : `<span class="${l.change_7d >= 0 ? 'up' : 'down'}">${pct(l.change_7d)}</span>`}</td>
  </tr>`).join('');
}

/** Tab switching. */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + t.dataset.view; });
}));
document.querySelectorAll('.pill[data-scope]').forEach((p) => p.addEventListener('click', () => {
  document.querySelectorAll('.pill[data-scope]').forEach((x) => x.classList.toggle('active', x === p));
  state.scope = p.dataset.scope;
  if (state.scope === 'watchlist') { state.wl = true; $('wl').checked = true; }
  render();
}));
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('wl').addEventListener('change', (e) => { state.wl = e.target.checked; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; state.dir = 1; render(); });
document.querySelectorAll('#board th.sortable').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (state.sort === k) state.dir = -state.dir;
  else { state.sort = k; state.dir = k === 'name' || k === 'cat' ? 1 : -1; }
  if (k === 'rank') state.dir = 1;
  $('sort').value = ['rank', 'implied', 'tvl', 'chg', 'age', 'name', 'cat'].includes(k) ? k : state.sort;
  render();
}));
rowsEl.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) openDetail(tr.dataset.slug);
});
$('close').addEventListener('click', closeDetail);
$('scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

/** Hash routing: #p=<slug> opens a detail, #category=<name> filters the board. */
function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const p = h.get('p');
  if (p) { openDetail(p); return; }
  const c = h.get('category');
  if (c) {
    state.cat = c;
    $('cat').value = c;
    render();
  }
}
window.addEventListener('hashchange', applyHash);

fillChrome();
renderLive();
render();
applyHash();
