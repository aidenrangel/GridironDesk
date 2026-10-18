(() => {
const CUR_SEASON = 2026;
let SEASON = Number(store0('season', CUR_SEASON));
function store0(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
const isCur = () => SEASON === CUR_SEASON;
/* ---------- leagues ---------- */
const LEAGUES = {
  nfl: { key: 'nfl', name: 'NFL', path: 'football/nfl', core: 'football/leagues/nfl', uidLeague: 28, headshots: 'nfl', logos: 'nfl', nteams: 32, teamsQ: 'limit=40', sbQ: '', stQ: '&level=3', regWeeks: 18, hasDivisions: true, playoffSpots: 7, playoffLabel: 'Playoffs',
    post: [['1','Wild Card','WC'],['2','Divisional','DIV'],['3','Conf. Championship','CONF'],['5','Super Bowl','SB']], fantasy: true, odds: true, injuries: true },
  cfb: { key: 'cfb', name: 'College Football', path: 'football/college-football', core: 'football/leagues/college-football', uidLeague: 23, headshots: 'college-football', logos: 'ncaa', nteams: 134, teamsQ: 'limit=200&groups=80', sbQ: '&groups=80&limit=300', stQ: '&group=80', regWeeks: 15, hasDivisions: false, playoffSpots: 12, playoffLabel: 'Rankings',
    post: [['1','Bowls & CFP','BOWL']], fantasy: false, odds: false, injuries: false }
};
let LEAGUE = LEAGUES[store0('league', 'nfl')] || LEAGUES.nfl;
let API, API2, API3, WEB, CORE;
function applyLeagueUrls() {
  API  = `https://site.api.espn.com/apis/site/v2/sports/${LEAGUE.path}`;
  API2 = `https://site.api.espn.com/apis/v2/sports/${LEAGUE.path}`;
  API3 = `https://site.api.espn.com/apis/site/v3/sports/${LEAGUE.path}`;
  WEB  = `https://site.web.api.espn.com/apis/common/v3/sports/${LEAGUE.path}`;
  CORE = `https://sports.core.api.espn.com/v2/sports/${LEAGUE.core}`;
}
applyLeagueUrls();
const isCFB = () => LEAGUE.key === 'cfb';
const SB_URL = () => `${API}/scoreboard${LEAGUE.sbQ ? '?' + LEAGUE.sbQ.slice(1) : ''}`;
const LK = k => `${LEAGUE.key}:${k}`;   // league-scoped storage key
const view = document.getElementById('view');
const cache = new Map();
let currentWeek = null, refreshTimer = null, teamIndex = null, rosterIndex = null, rosterLoading = null;

/* ---------- utils ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let favs = store.get(LK('favTeams'), null); if (!favs) { favs = LEAGUE.key === 'nfl' ? (store.get('favTeams', null) || []) : []; store.set(LK('favTeams'), favs); }
const isFav = id => id != null && favs.includes(String(id));
const favGame = ev => ev.competitions[0].competitors.some(c => isFav(c.team.id));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const logo = t => t?.logos?.[0]?.href || t?.logo || '';
const fmtDate = d => new Date(d).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtShort = d => new Date(d).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const fmtDay = d => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
const ago = d => { const m = (Date.now() - new Date(d)) / 60000; return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const fail = e => `<div class="err"><b>Couldn't load data.</b><br>${esc(e.message)}<br><span class="muted">ESPN's feed may be blocked on this network, or the endpoint changed.</span><br><button onclick="location.reload()">Reload</button></div>`;
const byHome = c => [c.competitors.find(x => x.homeAway === 'away'), c.competitors.find(x => x.homeAway === 'home')];
const sgn = n => (n > 0 ? '+' : '') + n;
const num = v => { const m = String(v ?? '').replace(/,/g, '').match(/^-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
const ord = n => n + (['th','st','nd','rd'][(n % 100 >> 3 ^ 1 && n % 10) || 0] || 'th');
const injTag = s => { const k = /out/i.test(s) ? 'out' : /reserve|ir\b/i.test(s) ? 'ir' : /question/i.test(s) ? 'q' : /doubt/i.test(s) ? 'd' : ''; return `<span class="tag ${k}">${esc(s)}</span>`; };
const rankTag = r => r ? `<span class="rk ${r <= 8 ? 'top' : r >= 25 ? 'bot' : ''}">${ord(r)}</span>` : '';
const hsOf = a => a?.headshot?.href || (a?.id ? `https://a.espncdn.com/i/headshots/${LEAGUE.headshots}/players/full/${a.id}.png` : '');
const rankBadge = c => { const r = num(c?.curatedRank?.current); return r && r <= 25 ? `<span class="rkb">${r}</span>` : ''; };
const scoreOf = x => num(x.score?.displayValue ?? x.score?.value ?? x.score ?? 0);
let toastT; const toast = m => { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); };

async function getJSON(url, ttl = 60000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`ESPN returned ${r.status} for ${url.replace(/^https?:\/\/[^/]+/, '')}`);
      const v = await r.json();
      cache.set(url, { t: Date.now(), v });
      return v;
    } catch (e) { lastErr = e; console.warn(`fetch failed (try ${attempt + 1})`, url, e); await new Promise(res => setTimeout(res, 400 * (attempt + 1))); }
  }
  throw new Error(`${lastErr?.message || 'Request failed'} (${url.replace(/^https?:\/\/[^/]+/, '')})`);
}

/* ESPN's /teams/* paths don't always answer cross-origin requests, so each team lookup has a fallback feed. */
const COLORS = { 1:'a71930',2:'00338d',3:'0b162a',4:'fb4f14',5:'311d00',6:'002244',7:'fb4f14',8:'0076b6',9:'204e32',10:'0c2340',11:'002c5f',12:'e31837',13:'000000',14:'003594',15:'008e97',16:'4f2683',17:'002244',18:'d3bc8d',19:'0b2265',20:'125740',21:'004c54',22:'97233f',23:'ffb612',24:'0080c6',25:'aa0000',26:'002244',27:'d50a0a',28:'5a1414',29:'0085ca',30:'006778',33:'241773',34:'03202f' };
let learnedColors = store.get(LK('teamColors'), {});
function noteColors(events) { let changed = false; (events || []).forEach(ev => ev.competitions?.[0]?.competitors?.forEach(c => { if (c.team?.color && !learnedColors[c.team.id]) { learnedColors[c.team.id] = c.team.color; changed = true; } })); if (changed) store.set(LK('teamColors'), learnedColors); }
const colorOf = t => '#' + (t?.color || (LEAGUE.key === 'nfl' ? COLORS[t?.id] : null) || learnedColors[t?.id] || '556');
async function teamsIndex() {
  if (teamIndex) return teamIndex;
  const idx = {};
  const sources = [
    async () => { const d = await getJSON(`${API2}/standings?season=${SEASON}${LEAGUE.stQ}`, 300000); normStandings(d).children.forEach(c => c.children.forEach(div => (div.standings?.entries || []).forEach(e => idx[e.team.id] = { ...e.team, color: LEAGUE.key === 'nfl' ? COLORS[e.team.id] : learnedColors[e.team.id], conf: c.abbreviation, confName: c.name, div: div.name, stats: e.stats }))); },
    async () => { const d = await getJSON(`${API}/teams?${LEAGUE.teamsQ}`, 3600000); (d.sports?.[0]?.leagues?.[0]?.teams || []).forEach(x => { idx[x.team.id] = { ...(idx[x.team.id] || {}), ...x.team }; if (x.team.color) learnedColors[x.team.id] = x.team.color; }); store.set(LK('teamColors'), learnedColors); },
    async () => { const d = await getJSON(SB_URL(), 30000); noteColors(d.events); d.events.forEach(ev => ev.competitions[0].competitors.forEach(c => { if (!idx[c.team.id]) idx[c.team.id] = c.team; })); }
  ];
  let lastErr;
  for (const s of sources) { try { await s(); if (Object.keys(idx).length >= LEAGUE.nteams * 0.9 && (LEAGUE.key === 'nfl' || Object.keys(learnedColors).length > 50)) break; } catch (e) { lastErr = e; console.warn('teams source failed', e); } }
  if (!Object.keys(idx).length) throw lastErr || new Error('No team list available from any ESPN feed.');
  teamIndex = idx; return idx;
}
// normalize: every conference gets a `children` list of divisions; conferences without divisions become one division named after themselves
function normStandings(d) { return { ...d, children: (d?.children || []).map(c => ({ ...c, children: (c.children && c.children.length) ? c.children : [{ name: c.name, abbreviation: c.abbreviation, standings: c.standings }] })) }; }
async function standingsL3() { return normStandings(await getJSON(`${API2}/standings?season=${SEASON}${LEAGUE.stQ}`, 300000)); }
const P4 = ['SEC','Big Ten','Big 12','ACC'];
const confOrder = (a, b) => { const ia = P4.findIndex(p => (a.name || '').includes(p) || a.abbreviation === p), ib = P4.findIndex(p => (b.name || '').includes(p) || b.abbreviation === p); if (ia >= 0 || ib >= 0) return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib); if (/independ/i.test(a.name) !== /independ/i.test(b.name)) return /independ/i.test(a.name) ? 1 : -1; return (a.name || '').localeCompare(b.name || ''); };
async function teamInfo(id) {
  try { const d = await getJSON(`${API}/teams/${id}`, 300000); if (d.team) return d.team; } catch (e) { console.warn('team feed fallback', e.message); }
  const [idx, st] = await Promise.all([teamsIndex(), standingsL3().catch(() => null)]);
  const t = { ...(idx[id] || { id: String(id), displayName: 'Team ' + id }) };
  t.color = t.color || (LEAGUE.key === 'nfl' ? COLORS[id] : learnedColors[id]) || '556';
  if (st) for (const conf of st.children || []) for (const div of conf.children || []) {
    const entries = div.standings?.entries || []; const i = entries.findIndex(e => e.team.id === String(id));
    if (i >= 0) { const e = entries[i]; t.standingSummary = `${ord(i + 1)} in ${div.name}`; t.conf = conf.name; t.record = { items: [{ type: 'total', summary: e.stats.find(s => s.name === 'overall')?.displayValue || '', stats: e.stats }] }; }
  }
  return t;
}
const POST = () => LEAGUE.post;
async function seasonCalendar() {
  const base = isCur() ? await getJSON(SB_URL(), 30000) : await getJSON(`${API}/scoreboard?dates=${SEASON}&seasontype=2&week=1${LEAGUE.sbQ}`, 600000);
  const cal = base.leagues?.[0]?.calendar || [];
  const reg = (cal.find(c => c.label === 'Regular Season')?.entries || []).map(e => ({ key: String(Number(e.value)), n: Number(e.value), type: 2, label: e.label, short: 'W' + Number(e.value) }));
  if (!reg.length) for (let i = 1; i <= LEAGUE.regWeeks; i++) reg.push({ key: String(i), n: i, type: 2, label: 'Week ' + i, short: 'W' + i });
  const postEntries = cal.find(c => c.label === 'Postseason')?.entries || [];
  const post = POST().map(([v, l, sh]) => { const e = postEntries.find(x => String(Number(x.value)) === v); return { key: 'p' + v, n: Number(v), type: 3, label: e?.label || l, short: sh, date: e?.startDate }; });
  // only list playoff rounds that have started (current season) or all of them (past seasons)
  const now = Date.now();
  return { reg, post: post.filter(x => !isCur() || !x.date || new Date(x.date) - now < 7 * 86400000), cur: isCur() ? (base.week?.number || 1) : null };
}
async function seasonGames(includePost = true) {
  const cal = await seasonCalendar();
  const want = [...cal.reg, ...(includePost ? cal.post : [])];
  const weeks = await Promise.all(want.map(w => getJSON(`${API}/scoreboard?seasontype=${w.type}&week=${w.n}&dates=${SEASON}${LEAGUE.sbQ}`, w.type === 2 && isCur() ? 120000 : 600000).then(d => (d.events || []).map(ev => ({ ...ev, _post: w.type === 3, _wk: w }))).catch(() => [])));
  return weeks.flat();
}
async function teamSchedule(id) {
  try { const d = await getJSON(`${API}/teams/${id}/schedule?season=${SEASON}`, 120000); if (d.events) return d.events; } catch (e) { console.warn('schedule feed fallback', e.message); }
  const all = await seasonGames();
  return all.filter(ev => ev.competitions[0].competitors.some(c => c.team.id === String(id))).sort((a, b) => new Date(a.date) - new Date(b.date));
}
async function teamRoster(id) {
  try { const r = await getJSON(`${API}/teams/${id}/roster`, 3600000); if (r.athletes) return r.athletes; } catch (e) { console.warn('roster feed fallback', e.message); }
  const r = await getJSON(`${WEB}/teams/${id}/roster`, 3600000);
  return (r.positionGroups || []).map(g => ({ position: g.displayName || g.type, items: (g.athletes || []).map(p => ({ ...p, injuries: p.status && !/active/i.test(p.status.name || p.status) ? [{ status: p.status.name || String(p.status) }] : [] })) }));
}
/* ESPN ranks every stat high-to-low; for these, lower is better, so the rank is flipped (1 = fewest). */
const LOWER_BETTER = new Set(['passing.sacks','passing.interceptions','miscellaneous.totalGiveaways','general.totalPenaltyYards','general.totalPenalties','defensive.pointsAllowedPerGame','miscellaneous.thirdDownConvPctAllowed','general.fumblesLost','general.fumbles']);
const NTEAMS = () => LEAGUE.nteams;
async function teamStats(id) {
  try { const d = await getJSON(`${CORE}/seasons/${SEASON}/types/2/teams/${id}/statistics`, 600000); const out = {};
    (d.splits?.categories || []).forEach(c => c.stats.forEach(s => { const k = c.name + '.' + s.name; const v = LOWER_BETTER.has(k) && s.rank ? { ...s, rank: NTEAMS() + 1 - s.rank, rankDisplayValue: ord(NTEAMS() + 1 - s.rank) } : s; out[k] = v; if (!out[s.name]) out[s.name] = v; })); return out;
  } catch (e) { console.warn('team stats unavailable', e.message); return null; }
}
async function allRosters(onProgress) {
  if (rosterIndex) return rosterIndex;
  if (rosterLoading) return rosterLoading;
  rosterLoading = (async () => {
    const idx = await teamsIndex();
    const cached = store.get(LK('rosters:' + SEASON), null);
    if (cached && Date.now() - cached.t < 86400000 && cached.list?.length > 1000) { rosterIndex = cached.list.map(p => ({ ...p, team: idx[p.tid] || { id: p.tid, abbreviation: '', displayName: '' } })); onProgress?.(1); return rosterIndex; }
    const ids = Object.keys(idx); const out = []; let done = 0;
    await Promise.all(ids.map(async id => {
      try { const groups = await teamRoster(id);
        groups.forEach(g => (g.items || []).forEach(p => out.push({ id: p.id, name: p.displayName, pos: p.position?.abbreviation || '', jersey: p.jersey || '', hs: hsOf(p), team: idx[id], inj: p.injuries?.[0]?.status || '' })));
      } catch {} done++; onProgress?.(done / ids.length);
    }));
    rosterIndex = out;
    store.set(LK('rosters:' + SEASON), { t: Date.now(), list: out.map(p => ({ id: p.id, name: p.name, pos: p.pos, jersey: p.jersey, hs: p.hs, tid: p.team.id, inj: p.inj })) });
    return out;
  })();
  return rosterLoading;
}
/* Full league leaders: ESPN's site feed stops at ~10 per category; the core feed goes to 100 but
   returns players as id links, so names come from the roster index (with a fetch fallback). */
let leadersFull = null, leadersLoading = null;
async function fullLeaders(onProgress) {
  if (leadersFull) return leadersFull;
  if (leadersLoading) return leadersLoading;
  leadersLoading = (async () => {
    const site = getJSON(`${API3}/leaders?season=${SEASON}`, 300000).catch(() => null);
    if (isCFB()) { const siteD = await site; leadersFull = (siteD?.leaders?.categories || []).map(c => ({ ...c, expandable: true })); return leadersFull; }
    let core = null;
    try { core = await getJSON(`${CORE}/seasons/${SEASON}/types/2/leaders?limit=100`, 300000); } catch (e) { console.warn('core leaders unavailable', e.message); }
    const siteD = await site;
    if (!core?.categories?.length) { leadersFull = siteD?.leaders?.categories || []; return leadersFull; }
    const [roster, idx] = await Promise.all([allRosters(onProgress).catch(() => []), teamsIndex()]);
    const byId = {}; roster.forEach(p => byId[p.id] = p);
    // names already present in the site feed cover anyone missing from rosters
    (siteD?.leaders?.categories || []).forEach(c => c.leaders.forEach(l => { if (!byId[l.athlete.id]) byId[l.athlete.id] = { id: l.athlete.id, name: l.athlete.displayName, pos: l.athlete.position?.abbreviation || '', hs: hsOf(l.athlete), team: idx[l.team?.id] || l.team }; }));
    const idOf = ref => (ref?.$ref || '').match(/\/(athletes|teams)\/(\d+)/)?.[2];
    const missing = new Set();
    const cats = core.categories.map(c => ({ name: c.name, displayName: c.displayName, abbreviation: c.abbreviation, leaders: c.leaders.filter(l => l.value > 0).map(l => { const aid = idOf(l.athlete), tid = idOf(l.team); const p = byId[aid]; if (!p) missing.add(aid); return { displayValue: l.displayValue, value: l.value, athlete: { id: aid, displayName: p?.name || '', headshot: { href: p?.hs || '' }, position: { abbreviation: p?.pos || '' } }, team: p?.team?.id ? p.team : (idx[tid] || { id: tid, abbreviation: '' }) }; }) }));
    // resolve the few unknown players (practice-squad call-ups, recent trades) directly, 12 at a time
    const ids = [...missing]; for (let i = 0; i < ids.length && i < 60; i += 12) {
      await Promise.all(ids.slice(i, i + 12).map(async aid => { try { const a = await getJSON(`${CORE}/seasons/${SEASON}/athletes/${aid}`, 3600000); byId[aid] = { id: aid, name: a.displayName, pos: a.position?.abbreviation || '', hs: hsOf(a) }; } catch {} }));
    }
    cats.forEach(c => c.leaders.forEach(l => { const p = byId[l.athlete.id]; if (p && !l.athlete.displayName) { l.athlete.displayName = p.name; l.athlete.headshot.href = p.hs; l.athlete.position.abbreviation = p.pos; } if (!l.athlete.displayName) l.athlete.displayName = 'Player #' + l.athlete.id; }));
    leadersFull = cats; return cats;
  })();
  return leadersLoading;
}
// games summarised per team from the season scoreboard: results, opponents, margins
async function teamResults() {
  const games = (await seasonGames()).filter(ev => !ev._post); const by = {};
  games.forEach(ev => { const c = ev.competitions[0]; if (!c.status?.type?.completed) return; const [a, h] = byHome(c);
    [[a, h], [h, a]].forEach(([me, op]) => { (by[me.team.id] ||= []).push({ ev, wk: ev.week?.number, op: op.team.id, opTeam: op.team, ms: scoreOf(me), os: scoreOf(op), res: me.winner ? 'W' : op.winner ? 'L' : 'T', home: me.homeAway === 'home' }); }); });
  return by;
}
function sortable(table, rows, cols, render, defaultKey) {
  let key = defaultKey, dir = -1;
  const draw = () => {
    const s = [...rows].sort((a, b) => { const va = cols[key](a), vb = cols[key](b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir; });
    table.querySelector('tbody').innerHTML = s.map(render).join('');
    table.querySelectorAll('th[data-k]').forEach(th => th.classList.toggle('sorted', th.dataset.k === key));
    table.dispatchEvent(new Event('drawn'));
  };
  table.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => { if (key === th.dataset.k) dir = -dir; else { key = th.dataset.k; dir = -1; } draw(); });
  draw();
}
const wire = () => { view.querySelectorAll('tr[data-g]').forEach(tr => tr.onclick = () => location.hash = 'game/' + tr.dataset.g); view.querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = () => location.hash = 'team/' + tr.dataset.t); view.querySelectorAll('tr[data-p]').forEach(tr => tr.onclick = () => { if (tr.dataset.p) location.hash = 'player/' + tr.dataset.p; }); };

/* ---------- SVG charts ---------- */
function lineChart(series, labels, { h = 150, w = 520 } = {}) {
  const pad = { l: 30, r: 10, t: 10, b: 22 }; const n = Math.max(...series.map(s => s.v.length), 2);
  const all = series.flatMap(s => s.v).filter(v => v != null); if (!all.length) return '<div class="empty">No data yet.</div>';
  const mx = Math.max(...all) * 1.1 || 1, mn = 0;
  const x = i => pad.l + i * (w - pad.l - pad.r) / (n - 1), y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - mn) / (mx - mn));
  const ticks = 4; const grid = Array.from({ length: ticks + 1 }, (_, i) => { const v = mn + (mx - mn) * i / ticks; return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; }).join('');
  const paths = series.map(s => { const pts = s.v.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean); return `<path class="${s.cls}" d="M${pts.join('L')}"/>` + (s.area ? `<path class="aA" d="M${pts[0]}L${pts.join('L')}L${x(s.v.length - 1)},${y(0)}L${x(0)},${y(0)}Z"/>` : '') + s.v.map((v, i) => v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="currentColor" style="color:var(--${s.cls === 'lA' ? 'accent' : 'loss'})"/>`).join(''); }).join('');
  const xl = labels.map((l, i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}"><g class="grid">${grid}</g>${paths}${xl}</svg>`;
}
function marginChart(games, { h = 130, w = 520 } = {}) {
  if (!games.length) return '<div class="empty">No games played yet.</div>';
  const pad = { l: 30, r: 10, t: 10, b: 22 }; const mx = Math.max(...games.map(g => Math.abs(g.ms - g.os)), 7);
  const bw = (w - pad.l - pad.r) / games.length, y0 = pad.t + (h - pad.t - pad.b) / 2, sc = (h - pad.t - pad.b) / 2 / mx;
  return `<svg viewBox="0 0 ${w} ${h}"><g class="grid"><line x1="${pad.l}" x2="${w - pad.r}" y1="${y0}" y2="${y0}"/></g><text x="${pad.l - 4}" y="${pad.t + 4}" text-anchor="end">+${mx}</text><text x="${pad.l - 4}" y="${h - pad.b}" text-anchor="end">-${mx}</text>
    ${games.map((g, i) => { const m = g.ms - g.os, hh = Math.abs(m) * sc; return `<rect class="bar ${g.res}" x="${pad.l + i * bw + 2}" y="${m >= 0 ? y0 - hh : y0}" width="${bw - 4}" height="${Math.max(hh, 1)}" rx="2"><title>Wk ${g.wk} vs ${esc(g.opTeam?.abbreviation || '')}: ${g.ms}-${g.os}</title></rect><text x="${pad.l + i * bw + bw / 2}" y="${h - 6}" text-anchor="middle">${esc(g.opTeam?.abbreviation || g.wk)}</text>`; }).join('')}</svg>`;
}
function wpChart(wp, a, h, { hh = 150, w = 520 } = {}) {
  const pad = { l: 34, r: 10, t: 10, b: 20 }; const n = wp.length; if (n < 2) return '';
  const x = i => pad.l + i * (w - pad.l - pad.r) / (n - 1), y = p => pad.t + (hh - pad.t - pad.b) * (1 - p);
  const pts = wp.map((p, i) => `${x(i)},${y(p.homeWinPercentage)}`);
  return `<svg viewBox="0 0 ${w} ${hh}"><g class="grid">${[0, .25, .5, .75, 1].map(p => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(p)}" y2="${y(p)}" class="${p === .5 ? 'mid' : ''}"/><text x="${pad.l - 4}" y="${y(p) + 3}" text-anchor="end">${Math.round(p * 100)}%</text>`).join('')}</g>
    <path class="wpf" d="M${pts[0]}L${pts.join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="wp" d="M${pts.join('L')}"/>
    <text x="${pad.l + 4}" y="${pad.t + 10}">${esc(h)} ↑</text><text x="${pad.l + 4}" y="${hh - pad.b - 4}">${esc(a)} ↓</text></svg>`;
}

/* ---------- theme / search / mobile menu ---------- */
const root = document.documentElement;
const ssel = document.getElementById('seasonSel');
if (ssel) { ssel.innerHTML = Array.from({ length: CUR_SEASON - 2009 }, (_, i) => CUR_SEASON - i).map(y => `<option value="${y}" ${y === SEASON ? 'selected' : ''}>${y}</option>`).join('');
  ssel.onchange = e => setSeason(Number(e.target.value)); }
function setLeague(key) {
  if (!LEAGUES[key] || LEAGUES[key] === LEAGUE) return;
  LEAGUE = LEAGUES[key]; applyLeagueUrls(); store.set('league', key);
  cache.clear(); teamIndex = null; rosterIndex = null; rosterLoading = null; leadersFull = null; leadersLoading = null; liveCache = { t: 0, data: null }; GC.id = null;
  learnedColors = store.get(LK('teamColors'), {}); favs = store.get(LK('favTeams'), []);
  applyLeagueUI(); toast('Switched to ' + LEAGUE.name); ticker(); location.hash = '#home'; route();
}
function applyLeagueUI() {
  document.querySelectorAll('[data-league]').forEach(b => b.classList.toggle('on', b.dataset.league === LEAGUE.key));
  document.querySelectorAll('a[data-r="playoffs"]').forEach(a => { if (!a.querySelector('svg')) a.textContent = LEAGUE.playoffLabel; });
  document.querySelectorAll('a[data-r="fantasy"], a[data-r="odds"], a[data-r="injuries"]').forEach(a => a.classList.toggle('league-hide', (a.dataset.r === 'fantasy' && !LEAGUE.fantasy) || (a.dataset.r === 'odds' && !LEAGUE.odds) || (a.dataset.r === 'injuries' && !LEAGUE.injuries)));
  document.documentElement.dataset.league = LEAGUE.key;
}
document.querySelectorAll('[data-league]').forEach(b => b.onclick = () => setLeague(b.dataset.league));
applyLeagueUI();
function setSeason(y) { SEASON = y; store.set('season', y); cache.clear(); teamIndex = null; rosterIndex = null; rosterLoading = null; leadersFull = null; leadersLoading = null; if (ssel) ssel.value = y; const b = document.getElementById('seasonBanner'); if (b) b.hidden = isCur(); toast((isCur() ? 'Back to the current season' : 'Viewing the ' + y + ' season')); ticker(); route(); }
document.getElementById('seasonBanner')?.querySelector('a')?.addEventListener('click', e => { e.preventDefault(); setSeason(CUR_SEASON); });
if (document.getElementById('seasonBanner')) document.getElementById('seasonBanner').hidden = isCur();
const savedTheme = store.get('theme', null); if (savedTheme) root.dataset.theme = savedTheme;
document.getElementById('theme').onclick = () => { const dark = root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches; root.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', root.dataset.theme); };

const gs = document.getElementById('gs'), gsdd = document.getElementById('gsdd'); let gsSel = 0;
document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== gs && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); gs.focus(); } if (e.key === 'Escape') { gsdd.hidden = true; gs.blur(); } });
let gsTimer, gsSeq = 0;
async function globalSearch() {
  const q = gs.value.trim().toLowerCase(); if (q.length < 2) { gsdd.hidden = true; return; }
  const seq = ++gsSeq;
  const idx = await teamsIndex().catch(() => ({}));
  const teams = Object.values(idx).filter(t => (t.displayName + ' ' + t.abbreviation + ' ' + (t.location || '')).toLowerCase().includes(q)).slice(0, 4);
  const render = (players, loading) => { let html = '';
    if (teams.length) html += `<div class="hd">Teams</div>` + teams.map(t => `<a href="#team/${esc(t.id)}"><img src="${esc(logo(t))}" alt="">${esc(t.displayName)}<small>${esc(t.stats?.find(s => s.name === 'overall')?.displayValue || '')}</small></a>`).join('');
    if (players.length) html += `<div class="hd">Players</div>` + players.map(p => `<a href="#player/${esc(p.id)}"><img class="hs" src="${esc(p.hs)}" alt="">${esc(p.name)}<small>${esc(p.sub)}</small></a>`).join('');
    if (loading) html += '<div class="hd">Searching all players…</div>';
    html += `<a href="#players/${encodeURIComponent(gs.value.trim())}" class="lnk">See all results for "${esc(gs.value.trim())}" →</a>`;
    gsdd.innerHTML = html; gsdd.hidden = false; gsSel = Math.min(gsSel, gsdd.querySelectorAll('a').length - 1); hl(); };
  render(rosterIndex ? rosterIndex.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: `${p.pos} · ${p.team.abbreviation}`, hs: p.hs })) : [], true);
  const hits = await searchAthletes(q, 8).catch(() => []);
  if (seq !== gsSeq) return;
  render(hits, false);
}
const hl = () => { const as = gsdd.querySelectorAll('a'); as.forEach((a, i) => a.classList.toggle('sel', i === gsSel)); };
gs.oninput = () => { clearTimeout(gsTimer); gsTimer = setTimeout(globalSearch, 220); }; gs.onfocus = () => { if (gs.value.trim().length >= 2) globalSearch(); };
gs.onkeydown = e => { const as = gsdd.querySelectorAll('a'); if (e.key === 'ArrowDown') { gsSel = Math.min(gsSel + 1, as.length - 1); hl(); e.preventDefault(); } else if (e.key === 'ArrowUp') { gsSel = Math.max(gsSel - 1, 0); hl(); e.preventDefault(); } else if (e.key === 'Enter' && as[gsSel]) { location.hash = as[gsSel].getAttribute('href'); gsdd.hidden = true; gs.blur(); } };
document.addEventListener('click', e => { if (!e.target.closest('.gear')) document.getElementById('gearMenu')?.removeAttribute('open'); if (!e.target.closest('.moremenu')) document.querySelector('.moremenu')?.removeAttribute('open'); if (!e.target.closest('.search')) gsdd.hidden = true; if (e.target.closest('#gsdd a')) { gsdd.hidden = true; gs.value = ''; } });
document.getElementById('moreBtn').onclick = e => { e.preventDefault(); const old = document.querySelector('.more'); if (old) { old.remove(); return; }
  const wrap = document.createElement('div'); wrap.className = 'more'; 
  wrap.innerHTML = `<div class="dd"><a href="#" id="mshare">Share this page</a>${[['redzone','RedZone'],['playoffs',LEAGUE.playoffLabel],['odds','Playoff odds'],['power','Power index'],['teamstats','Team stats'],['players','Players'],['compare','Compare'],['fantasy','Fantasy'],['injuries','Injuries'],['news','News'],['settings','Settings']].filter(([r]) => !((r === 'fantasy' && !LEAGUE.fantasy) || (r === 'odds' && !LEAGUE.odds) || (r === 'injuries' && !LEAGUE.injuries))).map(([r, l]) => `<a href="#${r}">${l}</a>`).join('')}</div>`;
  document.body.appendChild(wrap); wrap.onclick = () => wrap.remove(); wrap.querySelector('#mshare').onclick = ev => { ev.preventDefault(); document.getElementById('share').click(); }; };

/* ---------- routing ---------- */
function route() {
  const [r, a, b, c] = (location.hash.slice(1) || 'home').split('/');
  const alias = { team: 'teams', player: 'players', pcompare: 'players', game: 'scores', odds: 'playoffs', teamstats: 'power', redzone: 'scores' };
  document.querySelectorAll('#nav a, #bnav a, .moremenu a').forEach(x => x.classList.toggle('on', x.dataset.r === (alias[r] || r)));
  clearInterval(refreshTimer); refreshTimer = null; pollFn = null; document.querySelector('.more')?.remove(); if (r !== 'game' || c !== 'theater') document.body.classList.remove('theater'); document.querySelector('.moremenu')?.removeAttribute('open'); document.getElementById('gearMenu')?.removeAttribute('open');
  view.innerHTML = '<div class="panel"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  window.scrollTo(0, 0);
  const pages = { home, scores, standings, playoffs, odds, power, leaders, players, player, pcompare, teams, team, compare, injuries, news, game: gamecast, fantasy, settings, teamstats, redzone };
  document.querySelectorAll('#nav a').forEach(x => x.toggleAttribute('aria-current', x.classList.contains('on')));
  (pages[r] || home)(a, b, c).catch(e => view.innerHTML = fail(e));
}
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', e => { if (view.querySelector('.skel')) view.innerHTML = fail(e.reason || new Error('Unknown error')); });
window.addEventListener('error', e => { if (view.querySelector('.skel')) view.innerHTML = fail(e.error || new Error(e.message)); });
/* live polling: a fast interval for game pages/ticker, a slower one for heavier pages; paused while the tab is hidden */
const LIVE_MS = () => Math.max(10, Number(store.get('liveInterval', 15))) * 1000;
let pollFn = null, pollFast = true, pollBusy = false;
async function runPoll() { if (pollBusy || document.hidden || !pollFn) return; pollBusy = true; try { cache.clear(); liveCache.t = 0; await pollFn(); ticker(); const u = document.querySelector('.upd'); if (u && /auto-refreshing/.test(u.textContent)) u.textContent = `Live · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`; } catch {} finally { pollBusy = false; } }
const poll = (fn, fast = true) => { pollFn = fn; pollFast = fast; clearInterval(refreshTimer); refreshTimer = setInterval(runPoll, fast ? LIVE_MS() : Math.max(LIVE_MS() * 2, 30000)); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && pollFn) runPoll(); });

/* ---------- ticker ---------- */
async function ticker() {
  try {
    const sb = await getJSON(SB_URL(), 30000);
    currentWeek = sb.week?.number || currentWeek; if (isCur()) watchLive(sb.events); noteColors(sb.events);
    const tEvents = isCFB() ? sb.events.filter(ev => ev.status.type.state === 'in' || favGame(ev) || ev.competitions[0].competitors.some(c => num(c.curatedRank?.current) <= 25)).slice(0, 40) : sb.events;
    document.getElementById('ticker').innerHTML = tEvents.map(ev => {
      const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c);
      const live = st.state === 'in';
      const sit = c.situation || {}; const poss = t => live && sit.possession === t.id ? '<i class="tposs"></i>' : '';
      return `<a class="tick ${favGame(ev) ? 'fav' : ''} ${live ? 'live' : ''} ${sit.isRedZone ? 'inrz' : ''}" href="#game/${ev.id}">
        <span class="st ${live ? 'live' : ''}">${live ? '<span class="dot"></span>' : ''}${esc(st.state === 'pre' ? fmtShort(ev.date) : live ? fmtClock(st, c) : st.shortDetail)}${sit.isRedZone ? ' · RZ' : ''}</span>
        <span class="${a.winner ? 'w' : ''}">${esc(a.team.abbreviation)}${poss(a)}</span><span class="num">${st.state === 'pre' ? '' : esc(a.score)}</span>
        <span class="${h.winner ? 'w' : ''}">${esc(h.team.abbreviation)}${poss(h)}</span><span class="num">${st.state === 'pre' ? '' : esc(h.score)}</span>
        ${live && sit.shortDownDistanceText ? `<span class="tsit">${esc(sit.shortDownDistanceText)}${sit.possessionText ? ' · ' + esc(sit.possessionText) : ''}</span>` : ''}</a>`;
    }).join('');
  } catch (e) { /* ticker is optional */ }
}

/* ---------- scores ---------- */
function myTeamsStrip(events) {
  if (!favs.length) return '';
  const cards = favs.map(f => { const ev = events.find(e => e.competitions[0].competitors.some(c => c.team.id === f)); const idx = teamIndex || {}; const t = idx[f];
    if (!ev) return t ? `<a class="mt" href="#team/${esc(f)}" style="--tc:${colorOf(t)}"><img src="${esc(logo(t))}" alt=""><div><b>${esc(t.abbreviation)}</b><small>Bye week</small></div></a>` : '';
    const c = ev.competitions[0], me = c.competitors.find(x => x.team.id === f), op = c.competitors.find(x => x.team.id !== f), st = ev.status.type;
    const txt = st.state === 'pre' ? fmtShort(ev.date) : `${me.score}–${op.score} · ${st.state === 'in' ? fmtClock(st, c) : st.shortDetail}`;
    const lp = st.state === 'in' && c.situation?.lastPlay?.text ? `<small class="mt-last">${esc(c.situation.lastPlay.text.slice(0, 70))}${c.situation.lastPlay.text.length > 70 ? '…' : ''}</small>` : '';
    return `<a class="mt ${st.state === 'in' ? 'live' : ''}" href="#game/${ev.id}" style="--tc:${colorOf(me.team)}"><img src="${esc(me.team.logo)}" alt=""><div><b>${esc(me.team.abbreviation)} ${me.homeAway === 'home' ? 'vs' : '@'} ${esc(op.team.abbreviation)}</b><small>${st.state === 'in' ? '<span class="dot"></span>' : ''}${esc(txt)}</small>${lp}</div></a>`; }).join('');
  return `<div class="mystrip"><span class="lbl">My teams</span>${cards}</div>`;
}
/* score notifications for my teams (page must be open; uses the browser Notification API) */
const lastScores = {};
function watchScores(events) {
  events.filter(favGame).forEach(ev => { const c = ev.competitions[0], [a, h] = byHome(c); const key = ev.id, cur = `${a.score}-${h.score}|${ev.status.type.state}`;
    const prev = lastScores[key]; lastScores[key] = cur; if (!prev || prev === cur) return;
    const [ps] = prev.split('|'); const msg = ev.status.type.completed ? `Final: ${a.team.abbreviation} ${a.score}, ${h.team.abbreviation} ${h.score}` : `${a.team.abbreviation} ${a.score}, ${h.team.abbreviation} ${h.score} (${ev.status.type.shortDetail})`;
    if (ps !== `${a.score}-${h.score}` || ev.status.type.completed) notify(ev.name || 'Score update', msg); });
}
function notify(title, body) { toast(body); if (store.get('notify', false) && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, icon: 'icon-192.png', tag: title }); } catch {} } }

async function scores(week) {
  const cal = await seasonCalendar(); const allW = [...cal.reg, ...cal.post];
  const base = isCur() ? await getJSON(SB_URL(), 30000) : null;
  // current season: ESPN's live week (may be a playoff round); past seasons: the Super Bowl
  const liveKey = base ? (base.season?.type === 3 ? 'p' + base.week?.number : String(base.week?.number || 1)) : (cal.post[cal.post.length - 1]?.key || '18');
  const key = allW.some(x => x.key === String(week)) ? String(week) : liveKey;
  const wobj = allW.find(x => x.key === key) || allW[0]; const wi = allW.indexOf(wobj);
  const sb = (base && key === liveKey) ? base : await getJSON(`${API}/scoreboard?seasontype=${wobj.type}&week=${wobj.n}&dates=${SEASON}${LEAGUE.sbQ}`, isCur() ? 30000 : 600000);
  if (isCur()) watchScores(sb.events); noteColors(sb.events);
  // college: filter chips (Top 25 / conference / my teams)
  const sbFilter = store.get(LK('sbFilter'), isCFB() ? 'top25' : 'all');
  const rankOf = c => num(c.curatedRank?.current) || 99;
  const confsIn = isCFB() ? [...new Set(sb.events.flatMap(ev => ev.competitions[0].competitors.map(c => c.team.conferenceId).filter(Boolean)))] : [];
  const idxC = isCFB() ? await teamsIndex().catch(() => ({})) : {};
  const confName = cid => { const t = Object.values(idxC).find(t => t.conferenceId === cid || t.groups?.id === cid); return t?.confName || t?.conf || ('Conf ' + cid); };
  const passes = ev => { const cs = ev.competitions[0].competitors; if (!isCFB() || sbFilter === 'all') return true; if (sbFilter === 'top25') return cs.some(c => rankOf(c) <= 25) || favGame(ev) || ev.status.type.state === 'in' && cs.some(c => rankOf(c) <= 25); if (sbFilter === 'mine') return favGame(ev); return cs.some(c => c.team.conferenceId === sbFilter); };
  const events = [...sb.events].filter(passes).sort((x, y) => (favGame(y) ? 1 : 0) - (favGame(x) ? 1 : 0));
  const live = sb.events.filter(e => e.status.type.state === 'in');
  const featured = sb.events.find(favGame) || [...live].sort((x, y) => { const d = e => Math.abs(num(e.competitions[0].competitors[0].score) - num(e.competitions[0].competitors[1].score)); return d(x) - d(y); })[0] || sb.events.find(e => e.status.type.state === 'pre') || sb.events[0];
  const byDay = {};
  events.forEach(ev => { const d = new Date(ev.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); (byDay[d] ||= []).push(ev); });
  const anyLive = live.length > 0;
  view.innerHTML = `
    <div class="bar"><div><h1>Scoreboard</h1><h2>${SEASON} ${wobj.type === 3 ? 'postseason' : 'season'} · ${esc(wobj.label)}</h2></div>
      <div class="row">
        ${anyLive ? '<a class="chip on" href="#redzone"><span class="dot"></span>RedZone view</a>' : ''}<span class="upd">${anyLive ? 'Live · auto-refreshing' : isCur() ? 'Updated ' + new Date().toLocaleTimeString() : 'Final results'}</span>
        <button class="chip" id="prevw" ${wi <= 0 ? 'disabled' : ''}>‹</button>
        <select id="wk" aria-label="Week"><optgroup label="Regular season">${cal.reg.map(x => `<option value="${x.key}" ${x.key === key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>${cal.post.length ? `<optgroup label="Postseason">${cal.post.map(x => `<option value="${x.key}" ${x.key === key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>` : ''}</select>
        <button class="chip" id="nextw" ${wi >= allW.length - 1 ? 'disabled' : ''}>›</button>
      </div></div>
    ${myTeamsStrip(sb.events)}
    ${featured ? featuredCard(featured) : ''}
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s4)"><button class="chip ${sbFilter === 'top25' ? 'on' : ''}" data-sbf="top25">Top 25</button><button class="chip ${sbFilter === 'all' ? 'on' : ''}" data-sbf="all">All FBS (${sb.events.length})</button>${favs.length ? `<button class="chip ${sbFilter === 'mine' ? 'on' : ''}" data-sbf="mine">My teams</button>` : ''}<select id="sbconf" aria-label="Conference" style="padding:6px 10px"><option value="">Conference…</option>${confsIn.map(cid => `<option value="${esc(cid)}" ${sbFilter === cid ? 'selected' : ''}>${esc(confName(cid))}</option>`).join('')}</select><span class="muted" style="font-size:12px">${events.length} shown</span></div>` : ''}
    ${events.length ? '' : '<div class="panel"><div class="empty">No games match this filter.</div></div>'}
    <div class="stack">${Object.entries(byDay).map(([d, evs]) => `<div class="panel"><h3>${esc(d)}<span class="muted" style="font-size:12px;letter-spacing:0;text-transform:none">${evs.length} game${evs.length > 1 ? 's' : ''}</span></h3>${evs.map(gameCard).join('')}</div>`).join('')}</div>`;
  view.querySelectorAll('[data-sbf]').forEach(b => b.onclick = () => { store.set(LK('sbFilter'), b.dataset.sbf); scores(key); });
  const sbc = document.getElementById('sbconf'); if (sbc) sbc.onchange = e => { if (e.target.value) { store.set(LK('sbFilter'), e.target.value); scores(key); } };
  document.getElementById('wk').onchange = e => location.hash = `scores/${e.target.value}`;
  document.getElementById('prevw').onclick = () => location.hash = `scores/${allW[wi - 1].key}`;
  document.getElementById('nextw').onclick = () => location.hash = `scores/${allW[wi + 1].key}`;
  if (anyLive) poll(() => scores(key), true);
}
function featuredCard(ev) {
  const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const live = st.state === 'in', pre = st.state === 'pre';
  const odds = c.odds?.[0]; const bc = c.broadcasts?.[0]?.names?.join('/') || '';
  const side = (t, r) => `<div class="side ${r ? 'r' : ''}"><img src="${esc(t.team.logo)}" alt=""><div><b>${rankBadge(t)}${esc(t.team.displayName)}</b><small>${esc(t.records?.[0]?.summary || '')}${live && c.situation?.possession === t.id ? ' · 🏈' : ''}</small></div></div>`;
  return `<a class="feat" href="#game/${ev.id}" style="--ca:${colorOf(a.team)};--cb:${colorOf(h.team)}">${side(a)}<div class="mid">${pre ? '<span style="font-size:22px">' + esc(fmtShort(ev.date)) + '</span>' : esc(a.score) + ' – ' + esc(h.score)}<small class="${live ? 'live' : ''}">${live ? '<span class="dot"></span>' : ''}${esc(pre ? (odds?.details || 'Upcoming') : st.shortDetail)}${live && c.situation?.downDistanceText ? ' · ' + esc(c.situation.downDistanceText) : ''}</small></div>${side(h, true)}
    <div class="sub"><span>${pre ? 'Next up' : live ? 'Live now' : 'Final'}${c.venue?.fullName ? ' · ' + esc(c.venue.fullName) : ''}</span><span>${esc(bc)}${pre && odds?.overUnder ? ' · O/U ' + esc(odds.overUnder) : ''}</span></div></a>`;
}
function gameCard(ev) {
  const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c);
  const done = st.completed, live = st.state === 'in', pre = st.state === 'pre';
  const possId = c.situation?.possession;
  const row = t => `<div class="team ${done ? (t.winner ? 'w' : 'l') : ''}"><img src="${esc(t.team.logo)}" alt="">${rankBadge(t)}<b>${esc(t.team.displayName)}</b><small>${esc(t.records?.[0]?.summary || '')}</small>${live && possId === t.id ? '<span class="poss" title="Possession"></span>' : ''}</div>
    <div class="score ${done && !t.winner ? 'lost' : ''}">${pre ? '' : esc(t.score)}</div>`;
  const bc = c.broadcasts?.[0]?.names?.join('/') || c.broadcast || '';
  const odds = c.odds?.[0];
  const status = live ? `<span class="live"><span class="dot"></span>${esc(st.shortDetail)}</span>` : done ? esc(st.shortDetail) : esc(fmtDate(ev.date));
  const extra = live && c.situation?.downDistanceText ? esc(c.situation.downDistanceText) : pre && odds ? esc(`${odds.details || ''} · O/U ${odds.overUnder ?? ''}`) + (bc ? ' · ' + esc(bc) : '') : esc(bc);
  let tops = '';
  if (!pre && c.leaders?.length) tops = `<div class="tops">${c.leaders.slice(0, 3).map(cat => { const l = cat.leaders?.[0]; return l ? `<span>${esc(cat.abbreviation)} <b>${esc(l.athlete.shortName)}</b> ${esc(l.displayValue)}</span>` : ''; }).join('')}</div>`;
  return `<a class="game ${favGame(ev) ? 'fav' : ''}" href="#game/${ev.id}" style="--ca:${colorOf(a.team)};--cb:${colorOf(h.team)}">${row(a)}${row(h)}<div class="meta"><span>${status}</span><span>${extra}</span></div>${tops}</a>`;
}

/* ---------- game detail ---------- */
async function game(id, tab = 'box') {
  const s = await getJSON(`${API}/summary?event=${id}`, 30000);
  const hdr = s.header?.competitions?.[0];
  if (!hdr) throw new Error('No game header in summary feed.');
  const st = hdr.status.type, [a, h] = byHome(hdr);
  const live = st.state === 'in';
  const lines = t => { const l = t.linescores || []; return [0,1,2,3].map(i => `<span>${l[i] ? esc(l[i].displayValue) : '–'}</span>`).join('') + `<span>${l.length > 4 ? esc(l.slice(4).reduce((n, x) => n + Number(x.value ?? x.displayValue), 0)) : '–'}</span><span><b>${esc(t.score)}</b></span>`; };
  const teamRow = t => `<div class="t"><a href="#team/${esc(t.team.id)}"><img src="${esc(logo(t.team))}" alt=""></a><a href="#team/${esc(t.team.id)}">${esc(t.team.displayName)}</a> <small class="muted">${esc(t.record?.[0]?.displayValue || '')}</small></div>${lines(t)}`;

  const ts = s.boxscore?.teams || [];
  const want = [['totalYards','Total yards'],['netPassingYards','Passing yards'],['rushingYards','Rushing yards'],['yardsPerPlay','Yards / play'],['firstDowns','First downs'],['thirdDownEff','3rd down'],['fourthDownEff','4th down'],['redZoneAttempts','Red zone'],['turnovers','Turnovers'],['sacksYardsLost','Sacks'],['totalPenaltiesYards','Penalties'],['possessionTime','Possession']];
  const tsA = ts.find(x => x.team.id === a.team.id), tsH = ts.find(x => x.team.id === h.team.id);
  const stat = (side, n) => side?.statistics?.find(x => x.name === n)?.displayValue ?? '';
  const cmp = (tsA && tsH) ? `<div class="panel"><h3>Team stats</h3><div class="cmp">${want.map(([n, l]) => {
    const va = stat(tsA, n), vh = stat(tsH, n); if (va === '' && vh === '') return '';
    const toS = v => n === 'possessionTime' ? num(v) * 60 + num(v.split(':')[1] || 0) : num(v);
    const na = toS(va), nh = toS(vh), lower = n === 'turnovers' || n === 'totalPenaltiesYards';
    const aw = lower ? na < nh : na > nh, hw = lower ? nh < na : nh > na, mx = Math.max(na, nh, 1);
    return `<div class="r"><span class="l">${esc(va)}</span><div><div class="lbl">${l}</div><div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${na / mx * 100}%"></i></span><span class="b"><i class="${hw ? 'w' : ''}" style="width:${nh / mx * 100}%"></i></span></div></div><span class="rr">${esc(vh)}</span></div>`;
  }).join('')}</div></div>` : '';

  const wpArr = s.winprobability || []; const last = wpArr[wpArr.length - 1];
  const playText = {}; (s.drives?.previous || []).concat(s.drives?.current ? [s.drives.current] : []).forEach(d => (d.plays || []).forEach(p => playText[p.id] = p));
  const swings = wpArr.map((p, i) => ({ i, id: p.playId, d: i ? p.homeWinPercentage - wpArr[i - 1].homeWinPercentage : 0 })).filter(x => Math.abs(x.d) >= 0.08).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5);
  const keyPlays = swings.map(x => { const p = playText[x.id]; const team = x.d > 0 ? h.team.abbreviation : a.team.abbreviation; return `<div class="play"><span class="q">${p ? 'Q' + esc(p.period?.number) + '<br><small>' + esc(p.clock?.displayValue || '') + '</small>' : ''}</span><span>${p ? esc(p.text) : 'Play ' + esc(x.id)}</span><span class="sw ${x.d > 0 ? 'pos' : 'neg'}">${sgn(Math.round(Math.abs(x.d) * 100))}% ${esc(team)}</span></div>`; }).join('');
  const wp = wpArr.length > 1 ? `<div class="panel"><h3>Win probability${last && !st.completed ? `<span class="pill">${esc(a.team.abbreviation)} ${Math.round((1 - last.homeWinPercentage) * 100)}% · ${esc(h.team.abbreviation)} ${Math.round(last.homeWinPercentage * 100)}%</span>` : ''}</h3><div class="chart">${wpChart(wpArr, a.team.abbreviation, h.team.abbreviation)}</div>${keyPlays ? `<h3>Biggest swings</h3>${keyPlays}` : ''}</div>` : '';

  const plays = (s.scoringPlays || []).map(p => `<div class="play"><span class="q">Q${esc(p.period?.number)}<br><small>${esc(p.clock?.displayValue || '')}</small></span><span><b>${esc(p.team?.abbreviation || '')}</b> ${esc(p.text)} <small class="muted">${esc(p.type?.abbreviation || '')}</small></span><span class="sc">${esc(p.awayScore)}–${esc(p.homeScore)}</span></div>`).join('');
  const cats = ['passing','rushing','receiving','defensive','kicking'];
  const box = (s.boxscore?.players || []).map(side => `<div class="panel"><h3>${esc(side.team.displayName)}</h3>${side.statistics.filter(c => cats.includes(c.name)).map(c => `
    <div class="tw"><table><thead><tr><th>${esc(c.text || c.name)}</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>
    ${c.athletes.slice(0, c.name === 'defensive' ? 8 : 20).map(p => `<tr><td><a class="lnk" href="#player/${esc(p.athlete.id)}">${esc(p.athlete.displayName)}</a></td>${p.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>`).join('');
  const drives = (s.drives?.previous || []).slice().reverse().map(d => { const r = (d.result || d.displayResult || '').toUpperCase(); const k = /TD|TOUCHDOWN/.test(r) ? 'td' : /INT|FUMBLE|DOWNS|SAFETY/.test(r) ? 'to' : '';
    return `<div class="drive"><img src="${esc(logo(d.team))}" alt=""><div><b>${esc(d.team?.abbreviation || '')}</b> <span class="d">${esc(d.description || '')}${d.start?.text ? ' · from ' + esc(d.start.text) : ''}</span></div><span class="r ${k}">${esc(d.displayResult || d.result || '')}</span></div>`; }).join('');
  const info = s.gameInfo || {};
  const bc = hdr.broadcasts?.[0]?.media?.shortName || '';
  const odds = s.pickcenter?.[0];
  // live situation + recent plays
  let liveHTML = '';
  if (live) {
    const sbEv = (cache.get(SB_URL())?.v?.events || []).find(e => e.id === String(id)); const sit = sbEv?.competitions?.[0]?.situation || {};
    const cur = s.drives?.current; const recent = [...(cur?.plays || []), ...((s.drives?.previous || []).slice(-1)[0]?.plays || [])].slice(-12).reverse();
    const possTeam = sit.possession === h.team.id ? h.team : sit.possession === a.team.id ? a.team : null;
    const yl = sit.yardLine != null ? Number(sit.yardLine) : null;
    liveHTML = `<div class="panel live-panel"><h3><span><span class="dot"></span>Live</span><span class="pill">${esc(st.shortDetail)}</span></h3>
      <div class="field"><div class="ez a">${esc(a.team.abbreviation)}</div><div class="turf">${[10,20,30,40,50,40,30,20,10].map((n, i) => `<span class="yd" style="left:${(i + 1) * 10}%">${n}</span>`).join('')}${yl != null ? `<span class="ball" style="left:${Math.max(0, Math.min(100, yl))}%;--tc:${possTeam ? colorOf(possTeam) : 'var(--gold)'}"></span>` : ''}${sit.isRedZone ? '<span class="rz">Red zone</span>' : ''}</div><div class="ez h">${esc(h.team.abbreviation)}</div></div>
      <div class="sit"><b>${possTeam ? esc(possTeam.abbreviation) + ' ball' : ''}</b> ${esc(sit.downDistanceText || sit.shortDownDistanceText || '')}${sit.possessionText ? ' · ' + esc(sit.possessionText) : ''}${sit.lastPlay?.text ? `<div class="muted">Last: ${esc(sit.lastPlay.text)}</div>` : ''}</div>
      ${recent.length ? `<div class="pbp">${recent.map(pl => `<div class="play"><span class="q">Q${esc(pl.period?.number)}<br><small>${esc(pl.clock?.displayValue || '')}</small></span><span>${pl.scoringPlay ? '<b class="pos">SCORE</b> ' : ''}${esc(pl.text)}</span><span class="sc">${pl.start?.downDistanceText ? esc(pl.start.downDistanceText) : ''}</span></div>`).join('')}</div>` : ''}</div>`;
  }
  const tabsHTML = [['box','Box score'],['drives','Drives'],['stats','Team stats']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  view.innerHTML = `<a class="back" href="#scores/${s.header?.season?.type === 3 ? 'p' : ''}${esc(s.header?.week || '')}">← Scoreboard</a>
    <div class="bar"><div><h1>${esc(a.team.displayName)} at ${esc(h.team.displayName)}</h1><h2>${live ? '<span class="dot"></span>' : ''}${esc(st.detail)}${info.venue?.fullName ? ' · ' + esc(info.venue.fullName) : ''}${info.attendance ? ' · ' + Number(info.attendance).toLocaleString() + ' att.' : ''}${info.weather?.temperature != null ? ' · ' + esc(info.weather.temperature) + '°F ' + esc(info.weather.displayValue || '') : ''}</h2></div><span class="upd">${esc(bc)}${odds?.details ? ' · ' + esc(odds.details) + (odds.overUnder ? ' · O/U ' + esc(odds.overUnder) : '') : ''}${live ? ' · auto-refreshing' : ''}</span></div>
    <div class="panel"><div class="box scoreline"><span></span><span class="h">1</span><span class="h">2</span><span class="h">3</span><span class="h">4</span><span class="h">OT</span><span class="h">T</span>${teamRow(a)}${teamRow(h)}</div></div>
    ${liveHTML ? `<div style="margin-top:14px">${liveHTML}</div>` : ''}
    <div class="tabs" style="margin-top:14px">${tabsHTML}</div>
    <div id="gtab"></div>`;
  const content = {
    box: `<div class="two"><div class="stack">${plays ? `<div class="panel"><h3>Scoring summary</h3>${plays}</div>` : ''}${box || '<div class="panel"><div class="empty">Box score appears once the game kicks off.</div></div>'}</div><div class="stack">${wp}${cmp}</div></div>`,
    drives: drives ? `<div class="two"><div class="panel"><h3>Drive chart<span class="pill">most recent first</span></h3>${drives}</div><div class="stack">${wp}</div></div>` : '<div class="panel"><div class="empty">No drives yet.</div></div>',
    stats: cmp ? `<div class="two">${cmp}${wp}</div>` : '<div class="panel"><div class="empty">Team stats appear once the game kicks off.</div></div>'
  };
  document.getElementById('gtab').innerHTML = content[tab] || content.box;
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', `#game/${id}/${b.dataset.tab}`); game(id, b.dataset.tab); });
  if (live) poll(async () => { await getJSON(SB_URL(), 30000).catch(() => {}); return game(id, tab); });
}


/* =====================================================================
   GAMECAST · live game experience (scorebug, field, play feed, win probability,
   game flow, live tiles, pregame / postgame modes, theater layout)
   ===================================================================== */
const GC = { id: null, lastScore: null, seenPlays: new Set(), lastTiles: {}, lastWP: null, tab: 'box', first: true };
const bigPlay = p => p.scoringPlay || /interception|fumble|safety|blocked|touchdown/i.test(p.type?.text || '') || (num(p.statYardage) >= 20 && !/kickoff|punt/i.test(p.type?.text || '')) || (p.start?.down === 4 && num(p.statYardage) >= num(p.start?.distance) && !/punt|field goal/i.test(p.type?.text || ''));
const playKind = p => p.scoringPlay ? 'score' : /interception|fumble/i.test(p.type?.text || '') && !/no fumble/i.test(p.text || '') ? 'turnover' : bigPlay(p) ? 'big' : '';
const fmtClock = (st, c) => st.state === 'in' ? `${c.status?.period ? (c.status.period > 4 ? 'OT' : 'Q' + c.status.period) : ''} ${c.status?.displayClock || ''}`.trim() : st.shortDetail;

// field x% for the team in possession: away drives left→right, home drives right→left
const fieldX = (yardLine, possIsHome) => { const y = Math.max(0, Math.min(100, num(yardLine))); return possIsHome ? 100 - y : y; };

async function gcState(id) {
  const [s, sb] = await Promise.all([getJSON(`${API}/summary?event=${id}`, 15000), getJSON(SB_URL(), 15000).catch(() => null)]);
  const hdr = s.header?.competitions?.[0]; if (!hdr) throw new Error('No game header in summary feed.');
  const ev = (sb?.events || []).find(e => e.id === String(id)); const c = ev?.competitions?.[0];
  const st = (c?.status?.type) || hdr.status.type; const [a, h] = byHome(hdr);
  const sa = c ? c.competitors.find(x => x.homeAway === 'away') : null, sh = c ? c.competitors.find(x => x.homeAway === 'home') : null;
  const score = { a: sa ? num(sa.score) : num(a.score), h: sh ? num(sh.score) : num(h.score) };
  const sit = c?.situation || {};
  const drives = [...(s.drives?.previous || []), ...(s.drives?.current ? [s.drives.current] : [])];
  const plays = drives.flatMap(d => (d.plays || []).map(p => ({ ...p, drive: d })));
  return { s, ev, c, st, a, h, score, sit, drives, plays, wp: s.winprobability || [], live: st.state === 'in', pre: st.state === 'pre', post: st.completed };
}

function scorebugHTML(S) {
  const { a, h, score, st, sit, c, live } = S;
  const poss = sit.possession; const to = (n) => `<span class="tos">${[0,1,2].map(i => `<i class="${i < num(n) ? 'on' : ''}"></i>`).join('')}</span>`;
  const side = (t, sc, isHome) => `<div class="sb-team ${isHome ? 'home' : 'away'} ${poss === t.team.id ? 'poss' : ''}" style="--tc:${colorOf(t.team)}"><img src="${esc(logo(t.team))}" alt=""><div class="sb-name"><b>${rankBadge(isHome ? (S.c?.competitors?.find(x => x.homeAway === 'home')) : (S.c?.competitors?.find(x => x.homeAway === 'away')))}${esc(t.team.abbreviation)}</b><small>${esc(t.record?.[0]?.displayValue || '')}</small>${live ? to(isHome ? sit.homeTimeouts : sit.awayTimeouts) : ''}</div><div class="sb-score" data-side="${isHome ? 'h' : 'a'}">${S.pre ? '' : sc}</div></div>`;
  const mid = live ? `<div class="sb-mid"><b class="sb-clock">${esc(fmtClock(st, c))}</b><small>${esc(sit.downDistanceText || sit.shortDownDistanceText || '')}</small>${sit.isRedZone ? '<em class="rz">Red zone</em>' : ''}</div>` : `<div class="sb-mid"><b class="sb-clock">${S.pre ? esc(fmtShort(S.ev?.date || S.s.header?.competitions?.[0]?.date)) : 'Final'}</b><small>${S.pre ? esc(S.c?.odds?.[0]?.details || '') : esc(st.detail || '')}</small></div>`;
  return `${side(a, score.a, false)}${mid}${side(h, score.h, true)}`;
}

function fieldHTML(S) {
  const { a, h, sit, drives, live } = S;
  const possHome = sit.possession === h.team.id; const possTeam = possHome ? h.team : sit.possession === a.team.id ? a.team : null;
  const cur = drives[drives.length - 1]; const startX = cur?.start?.yardLine != null && possTeam ? fieldX(cur.start.yardLine, possHome) : null;
  const ballX = sit.yardLine != null && possTeam ? fieldX(sit.yardLine, possHome) : null;
  const dist = num(sit.distance); const ltg = ballX != null && dist && sit.down > 0 ? (possHome ? ballX - dist : ballX + dist) : null;
  const lastYds = num(sit.lastPlay?.statYardage);
  return `<div class="gfield"><div class="ez a" style="--tc:${colorOf(a.team)}">${esc(a.team.abbreviation)}</div><div class="turf">
    ${[10,20,30,40,50,40,30,20,10].map((n, i) => `<span class="yd" style="left:${(i + 1) * 10}%">${n}</span>`).join('')}
    ${startX != null && ballX != null ? `<span class="drivepath" style="left:${Math.min(startX, ballX)}%;width:${Math.abs(ballX - startX)}%;--tc:${colorOf(possTeam)}"></span>` : ''}
    ${ltg != null ? `<span class="ltg" style="left:${Math.max(0, Math.min(100, ltg))}%"></span>` : ''}
    ${ballX != null ? `<span class="ball ${live ? 'anim' : ''}" style="left:${ballX}%;--tc:${colorOf(possTeam)}" title="${esc(sit.possessionText || '')}"></span>` : ''}
    ${lastYds && live ? `<span class="lastyd ${lastYds > 0 ? 'pos' : 'neg'}" style="left:${ballX ?? 50}%">${sgn(lastYds)} yds</span>` : ''}
    ${sit.isRedZone ? '<span class="rzglow ' + (possHome ? 'left' : 'right') + '"></span>' : ''}
  </div><div class="ez h" style="--tc:${colorOf(h.team)}">${esc(h.team.abbreviation)}</div></div>
  <div class="sit">${possTeam ? `<b>${esc(possTeam.abbreviation)} ball</b> · ` : ''}${esc(sit.downDistanceText || '')}${sit.possessionText ? ' · ' + esc(sit.possessionText) : ''}${cur?.description && live ? ` · <span class="muted">Drive: ${esc(cur.description)}</span>` : ''}${sit.lastPlay?.text ? `<div class="muted lastplay">Last: ${esc(sit.lastPlay.text)}</div>` : ''}</div>`;
}

function playCard(p, S, isNew) {
  const kind = playKind(p); const team = p.drive?.team; const yds = num(p.statYardage);
  return `<div class="pl ${kind} ${isNew ? 'new' : ''}" data-pid="${esc(p.id)}" style="--tc:${colorOf(team)}"><div class="pl-when"><span>Q${esc(p.period?.number)}</span><small>${esc(p.clock?.displayValue || '')}</small></div>
    <div class="pl-body">${kind ? `<span class="pl-tag ${kind}">${kind === 'score' ? (p.type?.text || 'Score') : kind === 'turnover' ? 'Turnover' : 'Big play'}</span>` : ''}<span class="pl-dd">${esc(p.start?.downDistanceText || p.type?.text || '')}</span><div class="pl-text">${esc(p.text)}</div></div>
    <div class="pl-right"><span class="pl-yds ${yds > 0 ? 'pos' : yds < 0 ? 'neg' : ''}">${/kickoff|punt|timeout|end of|two-minute/i.test(p.type?.text || '') ? '' : (yds || yds === 0 ? sgn(yds) : '')}</span><span class="pl-score num">${esc(p.awayScore)}–${esc(p.homeScore)}</span></div></div>`;
}
function feedHTML(S, newIds = new Set()) {
  const byDrive = [...S.drives].reverse();
  if (!byDrive.length) return '<div class="empty">Plays will appear at kickoff.</div>';
  return byDrive.map((d, i) => { const r = (d.result || d.displayResult || '').toUpperCase(); const k = /TD|TOUCHDOWN|FIELD GOAL|FG/.test(r) ? 'td' : /INT|FUMBLE|DOWNS|SAFETY/.test(r) ? 'to' : '';
    return `<div class="drv ${i === 0 && S.live ? 'cur' : ''}"><div class="drv-h" style="--tc:${colorOf(d.team)}"><img src="${esc(logo(d.team))}" alt=""><b>${esc(d.team?.abbreviation || '')}</b><span class="muted">${esc(d.description || 'In progress')}${d.start?.text ? ' · from ' + esc(d.start.text) : ''}</span><span class="drv-r ${k}">${i === 0 && S.live && !d.result ? '<span class="dot"></span>Current drive' : esc(d.displayResult || d.result || '')}</span></div>${[...(d.plays || [])].reverse().map(p => playCard(p, S, newIds.has(p.id))).join('')}</div>`; }).join('');
}
function flowChart(plays, a, h, { hh = 150, w = 520 } = {}) {
  const pts = plays.filter(p => p.homeScore != null).map(p => num(p.homeScore) - num(p.awayScore)); if (pts.length < 2) return '';
  const pad = { l: 34, r: 10, t: 10, b: 20 }; const mx = Math.max(...pts.map(Math.abs), 7); const n = pts.length;
  const x = i => pad.l + i * (w - pad.l - pad.r) / (n - 1), y = v => pad.t + (hh - pad.t - pad.b) * (1 - (v + mx) / (2 * mx));
  const d = pts.map((v, i) => `${x(i)},${y(v)}`).join('L');
  const qs = []; let lastQ = 0; plays.filter(p => p.homeScore != null).forEach((p, i) => { const q = p.period?.number; if (q && q !== lastQ) { qs.push([i, q]); lastQ = q; } });
  return `<svg viewBox="0 0 ${w} ${hh}"><g class="grid"><line x1="${pad.l}" x2="${w - pad.r}" y1="${y(0)}" y2="${y(0)}" class="mid"/></g><text x="${pad.l - 4}" y="${pad.t + 4}" text-anchor="end">${esc(h)} +${mx}</text><text x="${pad.l - 4}" y="${hh - pad.b}" text-anchor="end">${esc(a)} +${mx}</text>
    ${qs.map(([i, q]) => `<line x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${hh - pad.b}" class="q"/><text x="${x(i) + 3}" y="${hh - 6}">${q > 4 ? 'OT' : 'Q' + q}</text>`).join('')}
    <path class="wpf" d="M${x(0)},${y(0)}L${d}L${x(n - 1)},${y(0)}Z"/><path class="wp" d="M${d}"/></svg>`;
}
function tilesHTML(S) {
  const ts = S.s.boxscore?.teams || []; const tA = ts.find(x => x.team.id === S.a.team.id), tH = ts.find(x => x.team.id === S.h.team.id);
  if (!tA || !tH) return '';
  const want = [['totalYards','Total yds'],['yardsPerPlay','Yds/play'],['thirdDownEff','3rd down'],['turnovers','Turnovers'],['possessionTime','Possession'],['redZoneAttempts','Red zone']];
  const g = (t, n) => t.statistics.find(x => x.name === n)?.displayValue ?? '–';
  return want.map(([n, l]) => { const va = g(tA, n), vh = g(tH, n); const k = n; const prev = GC.lastTiles[k] || {}; const ca = prev.a != null && prev.a !== va ? 'tick' : '', ch = prev.h != null && prev.h !== vh ? 'tick' : ''; GC.lastTiles[k] = { a: va, h: vh };
    return `<div class="tile"><small>${l}</small><div class="tv"><span class="${ca}">${esc(va)}</span><em>${esc(S.a.team.abbreviation)} · ${esc(S.h.team.abbreviation)}</em><span class="${ch}">${esc(vh)}</span></div></div>`; }).join('');
}
function topPerfHTML(S) {
  const sides = S.s.boxscore?.players || []; if (!sides.length) return '';
  const pick = (side, cat, lbl) => { const c = side.statistics.find(x => x.name === cat); if (!c?.athletes?.length) return ''; const i = c.labels.indexOf(lbl); const best = [...c.athletes].sort((x, y) => num(y.stats[i]) - num(x.stats[i]))[0]; if (!best || !num(best.stats[i])) return ''; return `<a class="perf" href="#player/${esc(best.athlete.id)}"><img src="${esc(hsOf(best.athlete))}" alt=""><div><b>${esc(best.athlete.displayName)}</b><small>${esc(cat)} · ${esc(c.labels.map((l, j) => l + ' ' + best.stats[j]).slice(0, 4).join(' · '))}</small></div></a>`; };
  return sides.map(side => `<div class="perf-side" style="--tc:${colorOf(side.team)}"><div class="perf-h"><img src="${esc(logo(side.team))}" alt="">${esc(side.team.abbreviation)}</div>${pick(side, 'passing', 'YDS')}${pick(side, 'rushing', 'YDS')}${pick(side, 'receiving', 'YDS')}</div>`).join('');
}
function wpPanel(S) {
  const wp = S.wp; if (wp.length < 2) return '';
  const last = wp[wp.length - 1], prev = wp[wp.length - 2]; const hp = Math.round(last.homeWinPercentage * 100); const swing = Math.round((last.homeWinPercentage - prev.homeWinPercentage) * 100);
  const playText = {}; S.plays.forEach(p => playText[p.id] = p);
  const swings = wp.map((p, i) => ({ id: p.playId, d: i ? p.homeWinPercentage - wp[i - 1].homeWinPercentage : 0 })).filter(x => Math.abs(x.d) >= 0.08).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 4);
  return `<div class="wpbar-wrap"><b>${esc(S.a.team.abbreviation)} ${100 - hp}%</b><div class="wpbar"><i style="width:${100 - hp}%;background:${colorOf(S.a.team)}"></i><i style="width:${hp}%;background:${colorOf(S.h.team)}"></i></div><b>${esc(S.h.team.abbreviation)} ${hp}%</b></div>
    ${S.live && Math.abs(swing) >= 3 ? `<div class="swing ${swing > 0 ? 'pos' : 'neg'}">${sgn(Math.abs(swing))}% ${esc(swing > 0 ? S.h.team.abbreviation : S.a.team.abbreviation)} on the last play</div>` : ''}
    <div class="chart">${wpChart(wp, S.a.team.abbreviation, S.h.team.abbreviation)}</div>
    ${swings.length ? `<div class="lhead" style="grid-template-columns:1fr"><span>Biggest swings</span></div>${swings.map(x => { const p = playText[x.id]; return `<div class="play"><span class="q">${p ? 'Q' + esc(p.period?.number) + '<br><small>' + esc(p.clock?.displayValue || '') + '</small>' : ''}</span><span>${p ? esc(p.text) : ''}</span><span class="sw ${x.d > 0 ? 'pos' : 'neg'}">${sgn(Math.round(Math.abs(x.d) * 100))}% ${esc(x.d > 0 ? S.h.team.abbreviation : S.a.team.abbreviation)}</span></div>`; }).join('')}` : ''}`;
}
async function pregameHTML(S) {
  const [M, inj, all] = await Promise.all([buildModel().catch(() => null), getJSON(`${API}/injuries`, 300000).catch(() => null), seasonGames().catch(() => [])]);
  const aId = S.a.team.id, hId = S.h.team.id; const pH = M && M.T[hId] && M.T[aId] ? M.pWin(hId, aId) : null;
  const res = (await teamResults().catch(() => ({})));
  const last5 = id => (res[id] || []).slice(-5).map(g => `<span class="${g.res}" title="${esc(g.opTeam?.abbreviation)} ${g.ms}-${g.os}">${g.res}</span>`).join('');
  const h2h = all.filter(ev => ev.id !== String(S.ev?.id) && ev.competitions[0].competitors.some(x => x.team.id === aId) && ev.competitions[0].competitors.some(x => x.team.id === hId));
  const injFor = id => ((inj?.injuries || []).find(t => t.id === id)?.injuries || []).filter(i => /out|doubtful|questionable/i.test(i.status)).slice(0, 6);
  const injList = id => { const l = injFor(id); return l.length ? l.map(i => `<div class="injrow"><span>${esc(i.athlete?.displayName)} <small class="muted">${esc(i.athlete?.position?.abbreviation || '')}</small></span>${injTag(i.status)}</div>`).join('') : '<div class="muted" style="font-size:13px">No notable injuries</div>'; };
  const kickoff = new Date(S.ev?.date || S.s.header?.competitions?.[0]?.date); const odds = S.c?.odds?.[0];
  const teamCol = (t, id) => `<div class="pre-team" style="--tc:${colorOf(t.team)}"><img src="${esc(logo(t.team))}" alt=""><b>${esc(t.team.displayName)}</b><small>${esc(t.record?.[0]?.displayValue || '')}${M?.T[id] ? ' · rating ' + sgn(M.T[id].rating.toFixed(1)) : ''}</small><div class="form">${last5(id)}</div></div>`;
  return `<div class="panel pre"><div class="countdown" id="countdown" data-t="${kickoff.getTime()}">Kickoff ${esc(fmtDate(kickoff))}</div>
    <div class="pre-grid">${teamCol(S.a, aId)}<div class="pre-mid">${pH != null ? `<small>Model win probability</small><div class="wpbar"><i style="width:${(1 - pH) * 100}%;background:${colorOf(S.a.team)}"></i><i style="width:${pH * 100}%;background:${colorOf(S.h.team)}"></i></div><div class="row" style="justify-content:space-between"><b>${Math.round((1 - pH) * 100)}%</b><b>${Math.round(pH * 100)}%</b></div>` : ''}${odds ? `<small style="margin-top:10px">Line</small><b>${esc(odds.details || '')}${odds.overUnder ? ' · O/U ' + esc(odds.overUnder) : ''}</b>` : ''}</div>${teamCol(S.h, hId)}</div></div>
    <div class="half"><div class="panel"><h3>${esc(S.a.team.abbreviation)} injuries</h3><div class="box">${injList(aId)}</div></div><div class="panel"><h3>${esc(S.h.team.abbreviation)} injuries</h3><div class="box">${injList(hId)}</div></div></div>
    ${h2h.length ? `<div class="panel"><h3>Earlier meeting this season</h3>${h2h.map(gameCard).join('')}</div>` : ''}`;
}
function postgameHTML(S) {
  const win = S.score.h > S.score.a ? S.h : S.a, lose = win === S.h ? S.a : S.h;
  const scoring = S.plays.filter(p => p.scoringPlay);
  return `<div class="panel"><h3>Final · recap</h3><div class="box"><b style="font-family:var(--display);font-size:26px;text-transform:uppercase">${esc(win.team.displayName)} ${Math.max(S.score.a, S.score.h)}, ${esc(lose.team.displayName)} ${Math.min(S.score.a, S.score.h)}</b><div class="muted">${scoring.length} scoring plays · ${S.plays.length} plays · ${S.drives.length} drives</div></div>
    ${scoring.length ? scoring.map(p => playCard(p, S, false)).join('') : ''}</div>`;
}

async function gamecast(id, tab = 'box') {
  const theater = tab === 'theater';
  document.body.classList.toggle('theater', theater);
  const fresh = GC.id !== String(id); if (fresh) { GC.id = String(id); GC.lastScore = null; GC.seenPlays = new Set(); GC.lastTiles = {}; GC.first = true; }
  GC.tab = theater ? GC.tab : tab;
  const S = await gcState(id);
  const info = S.s.gameInfo || {}; const bc = S.s.header?.competitions?.[0]?.broadcasts?.[0]?.media?.shortName || S.c?.broadcasts?.[0]?.names?.join('/') || '';
  const newIds = new Set(S.plays.filter(p => !GC.seenPlays.has(p.id)).map(p => p.id)); const firstRender = GC.first; S.plays.forEach(p => GC.seenPlays.add(p.id));
  // alerts on score change / turnovers for my teams and for this open game
  if (GC.lastScore && (GC.lastScore.a !== S.score.a || GC.lastScore.h !== S.score.h)) { const who = S.score.h !== GC.lastScore.h ? S.h : S.a; flashScore(who === S.h ? 'h' : 'a'); liveAlert(`${who.team.abbreviation} scores`, `${S.a.team.abbreviation} ${S.score.a} – ${S.h.team.abbreviation} ${S.score.h} · ${fmtClock(S.st, S.c || {})}`, 'score'); }
  GC.lastScore = { ...S.score };
  const headerBits = [S.st.detail, info.venue?.fullName, info.weather?.temperature != null ? info.weather.temperature + '°F' : '', bc].filter(Boolean).map(esc).join(' · ');
  const existing = !fresh && document.getElementById('gc') && !firstRender;
  if (!existing) {
    view.innerHTML = `<div class="row" style="justify-content:space-between"><a class="back" href="#scores/${S.s.header?.season?.type === 3 ? 'p' : ''}${esc(S.s.header?.week || '')}">← Scoreboard</a><div class="row"><a class="chip" href="#redzone">RedZone view</a><a class="chip ${theater ? 'on' : ''}" href="#game/${esc(id)}/${theater ? 'box' : 'theater'}">${theater ? 'Exit theater' : 'Theater mode'}</a></div></div>
      <div id="gc" class="gc ${S.live ? 'live' : ''}">
        <div class="scorebug" id="scorebug">${scorebugHTML(S)}</div>
        <div class="muted gc-sub" id="gcsub">${headerBits}</div>
        ${S.pre ? `<div id="pregame" class="stack"></div>` : ''}
        ${S.live || S.post ? `<div class="panel" id="fieldpanel">${S.live ? `<h3><span><span class="dot"></span>Live</span><span class="pill" id="gcclock">${esc(fmtClock(S.st, S.c || {}))}</span></h3>` : ''}<div id="field">${S.live ? fieldHTML(S) : ''}</div></div>` : ''}
        ${S.post ? `<div id="postgame" class="stack">${postgameHTML(S)}</div>` : ''}
        <div class="gc-grid">
          <div class="stack">
            ${S.live || S.post ? `<div class="panel"><h3>Play by play<span class="pill">${S.live ? 'newest first · updates live' : 'newest first'}</span></h3><div id="feed" class="feed">${feedHTML(S, firstRender ? new Set() : newIds)}</div></div>` : ''}
          </div>
          <div class="stack">
            ${S.live || S.post ? `<div class="panel"><h3>Live stats</h3><div class="tiles" id="tiles">${tilesHTML(S)}</div></div>` : ''}
            ${S.wp.length > 1 ? `<div class="panel"><h3>Win probability</h3><div id="wp">${wpPanel(S)}</div></div>` : ''}
            ${S.plays.length > 1 ? `<div class="panel"><h3>Game flow<span class="pill">score margin</span></h3><div class="chart" id="flow">${flowChart(S.plays, S.a.team.abbreviation, S.h.team.abbreviation)}</div></div>` : ''}
            ${S.live || S.post ? `<div class="panel"><h3>Top performers</h3><div class="perfs" id="perfs">${topPerfHTML(S)}</div></div>` : ''}
          </div>
        </div>
        <div class="tabs" id="gctabs">${[['box','Box score'],['drives','Drive summary'],['stats','Team stats']].map(([k, l]) => `<button class="${k === GC.tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div id="gtab"></div>
      </div>`;
    if (S.pre) pregameHTML(S).then(html => { const el = document.getElementById('pregame'); if (el) { el.innerHTML = html; tickCountdown(); } }).catch(() => {});
    view.querySelectorAll('#gctabs [data-tab]').forEach(b => b.onclick = () => { GC.tab = b.dataset.tab; view.querySelectorAll('#gctabs button').forEach(x => x.classList.toggle('on', x === b)); renderGameTab(S); });
    GC.first = false;
  } else {
    // incremental update: patch what changed instead of rebuilding
    const sbEl = document.getElementById('scorebug'); if (sbEl) sbEl.innerHTML = scorebugHTML(S);
    const sub = document.getElementById('gcsub'); if (sub) sub.innerHTML = headerBits;
    const f = document.getElementById('field'); if (f && S.live) f.innerHTML = fieldHTML(S);
    const ck = document.getElementById('gcclock'); if (ck) ck.textContent = fmtClock(S.st, S.c || {});
    const feed = document.getElementById('feed'); if (feed && newIds.size) { feed.innerHTML = feedHTML(S, newIds); }
    const t = document.getElementById('tiles'); if (t) t.innerHTML = tilesHTML(S);
    const w = document.getElementById('wp'); if (w) w.innerHTML = wpPanel(S);
    const fl = document.getElementById('flow'); if (fl) fl.innerHTML = flowChart(S.plays, S.a.team.abbreviation, S.h.team.abbreviation);
    const pf = document.getElementById('perfs'); if (pf) pf.innerHTML = topPerfHTML(S);
    if (S.post && !document.getElementById('postgame')) { route(); return; }
    newIds.forEach(pid => { const p = S.plays.find(x => x.id === pid); const k = p && playKind(p); if (k === 'turnover') liveAlert('Turnover', p.text, 'turnover'); });
  }
  renderGameTab(S);
  if (S.live) poll(() => gamecast(id, tab), true); else if (S.pre) { const ms = new Date(S.ev?.date || 0) - Date.now(); if (ms > 0 && ms < 3 * 3600000) poll(() => gamecast(id, tab), false); }
}
function renderGameTab(S) {
  const el = document.getElementById('gtab'); if (!el) return; const s = S.s;
  const ts = s.boxscore?.teams || []; const tsA = ts.find(x => x.team.id === S.a.team.id), tsH = ts.find(x => x.team.id === S.h.team.id);
  const stat = (side, n) => side?.statistics?.find(x => x.name === n)?.displayValue ?? '';
  const want = [['totalYards','Total yards'],['netPassingYards','Passing yards'],['rushingYards','Rushing yards'],['yardsPerPlay','Yards / play'],['firstDowns','First downs'],['thirdDownEff','3rd down'],['fourthDownEff','4th down'],['redZoneAttempts','Red zone'],['turnovers','Turnovers'],['sacksYardsLost','Sacks'],['totalPenaltiesYards','Penalties'],['possessionTime','Possession']];
  const cmp = (tsA && tsH) ? `<div class="panel"><h3>Team stats</h3><div class="cmp">${want.map(([n, l]) => { const va = stat(tsA, n), vh = stat(tsH, n); if (va === '' && vh === '') return ''; const toS = v => n === 'possessionTime' ? num(v) * 60 + num(v.split(':')[1] || 0) : num(v); const na = toS(va), nh = toS(vh), lower = n === 'turnovers' || n === 'totalPenaltiesYards'; const aw = lower ? na < nh : na > nh, hw = lower ? nh < na : nh > na, mx = Math.max(na, nh, 1);
    return `<div class="r"><span class="l">${esc(va)}</span><div><div class="lbl">${l}</div><div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${na / mx * 100}%"></i></span><span class="b"><i class="${hw ? 'w' : ''}" style="width:${nh / mx * 100}%"></i></span></div></div><span class="rr">${esc(vh)}</span></div>`; }).join('')}</div></div>` : '<div class="panel"><div class="empty">Team stats appear once the game kicks off.</div></div>';
  const cats = ['passing','rushing','receiving','defensive','kicking'];
  const box = (s.boxscore?.players || []).map(side => `<div class="panel"><h3>${esc(side.team.displayName)}</h3>${side.statistics.filter(c => cats.includes(c.name)).map(c => `<div class="tw"><table><thead><tr><th>${esc(c.text || c.name)}</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${c.athletes.slice(0, c.name === 'defensive' ? 8 : 20).map(p => `<tr><td><a class="lnk" href="#player/${esc(p.athlete.id)}">${esc(p.athlete.displayName)}</a></td>${p.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>`).join('');
  const drv = S.drives.length ? (() => { const byTeam = {}; S.drives.forEach(d => { const k = d.team?.abbreviation || '?'; const o = (byTeam[k] ||= { n: 0, plays: 0, yds: 0, td: 0, fg: 0, to: 0, punt: 0, secs: 0, team: d.team }); o.n++; o.plays += num(d.offensivePlays); o.yds += num(d.yards); const r = (d.result || '').toUpperCase(); if (/TD/.test(r)) o.td++; else if (/FG/.test(r)) o.fg++; else if (/INT|FUMBLE|DOWNS/.test(r)) o.to++; else if (/PUNT/.test(r)) o.punt++; const [m, sct] = (d.timeElapsed?.displayValue || '0:00').split(':'); o.secs += num(m) * 60 + num(sct); });
    return `<div class="panel"><h3>Drive summary</h3><div class="tw"><table><thead><tr><th>Team</th><th class="num">Drives</th><th class="num">Plays/drive</th><th class="num">Yds/drive</th><th class="num">TD</th><th class="num">FG</th><th class="num">TO</th><th class="num">Punts</th><th class="num">Scoring %</th><th class="num">Avg time</th></tr></thead><tbody>${Object.values(byTeam).map(o => `<tr><td class="tm"><img src="${esc(logo(o.team))}" alt="">${esc(o.team?.abbreviation)}</td><td class="num">${o.n}</td><td class="num">${(o.plays / o.n).toFixed(1)}</td><td class="num">${(o.yds / o.n).toFixed(1)}</td><td class="num">${o.td}</td><td class="num">${o.fg}</td><td class="num ${o.to ? 'neg' : ''}">${o.to}</td><td class="num">${o.punt}</td><td class="num">${Math.round((o.td + o.fg) / o.n * 100)}%</td><td class="num">${Math.floor(o.secs / o.n / 60)}:${String(Math.round(o.secs / o.n % 60)).padStart(2, '0')}</td></tr>`).join('')}</tbody></table></div></div>`; })() : '<div class="panel"><div class="empty">No drives yet.</div></div>';
  const content = { box: `<div class="two"><div class="stack">${box || '<div class="panel"><div class="empty">Box score appears once the game kicks off.</div></div>'}</div><div class="stack">${cmp}</div></div>`, drives: drv, stats: cmp };
  el.innerHTML = content[GC.tab] || content.box;
}
function flashScore(side) { const el = document.querySelector(`.sb-score[data-side="${side}"]`); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
let cdTimer; function tickCountdown() { clearInterval(cdTimer); const el = document.getElementById('countdown'); if (!el) return; const t = Number(el.dataset.t); const f = () => { const d = t - Date.now(); if (d <= 0) { el.textContent = 'Kickoff!'; clearInterval(cdTimer); return; } const days = Math.floor(d / 86400000), h = Math.floor(d % 86400000 / 3600000), m = Math.floor(d % 3600000 / 60000), s = Math.floor(d % 60000 / 1000); const parts = days ? `${days}d ${h}h ${String(m).padStart(2, '0')}m` : h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`; el.innerHTML = `Kickoff in <b class="num">${parts}</b> · ${esc(fmtDate(t))}`; }; f(); cdTimer = setInterval(f, 1000); }

/* ---------- alerts (toast + optional notification + optional sound) ---------- */
let audioCtx; function beep(kind) { if (!store.get('sound', false)) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = kind === 'score' ? 880 : kind === 'turnover' ? 440 : 660; g.gain.value = .08; o.connect(g); g.connect(audioCtx.destination); o.start(); o.frequency.exponentialRampToValueAtTime(kind === 'score' ? 1320 : 330, audioCtx.currentTime + .18); o.stop(audioCtx.currentTime + .22); } catch {} }
function liveAlert(title, body, kind) { toast(`${title}: ${body}`); beep(kind); if (store.get('notify', false) && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, icon: 'icon-192.png', tag: title + body.slice(0, 20) }); } catch {} } }
// league-wide watcher for my teams: score, turnover, red zone entry
const lastSit = {};
function watchLive(events) {
  events.filter(e => e.status.type.state === 'in' && favGame(e)).forEach(ev => { const c = ev.competitions[0], sit = c.situation || {}, [a, h] = byHome(c); const prev = lastSit[ev.id] || {}; const name = `${a.team.abbreviation} @ ${h.team.abbreviation}`;
    if (sit.isRedZone && !prev.rz) { const t = sit.possession === h.team.id ? h : a; if (isFav(t.team.id) || true) liveAlert('Red zone', `${t.team.abbreviation} in the red zone · ${name}`, 'rz'); }
    if (sit.lastPlay?.id && sit.lastPlay.id !== prev.lastPlayId && /interception|fumble/i.test(sit.lastPlay.type?.text || '') && !/no fumble/i.test(sit.lastPlay.text || '')) liveAlert('Turnover', `${sit.lastPlay.text} · ${name}`, 'turnover');
    lastSit[ev.id] = { rz: !!sit.isRedZone, lastPlayId: sit.lastPlay?.id }; });
}

/* ---------- RedZone view: every live game on one screen ---------- */
const rzLast = {};
async function redzone() {
  const sb = await getJSON(SB_URL(), 15000); watchScores(sb.events); watchLive(sb.events);
  const live = sb.events.filter(e => e.status.type.state === 'in'), up = sb.events.filter(e => e.status.type.state === 'pre').sort((x, y) => new Date(x.date) - new Date(y.date)), done = sb.events.filter(e => e.status.type.completed);
  const excite = ev => { const c = ev.competitions[0], [a, h] = byHome(c); const margin = Math.abs(num(a.score) - num(h.score)); const q = c.status?.period || 1; const [m] = (c.status?.displayClock || '15:00').split(':'); const late = q >= 4 ? 1 - num(m) / 15 : (q - 1) / 4 * .5; return (c.situation?.isRedZone ? 3 : 0) + late * 4 + Math.max(0, 3 - margin / 4) + (favGame(ev) ? 2 : 0); };
  live.sort((x, y) => excite(y) - excite(x));
  const tile = ev => { const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const sit = c.situation || {}; const key = ev.id; const prev = rzLast[key]; const changed = prev && (prev.a !== a.score || prev.h !== h.score); rzLast[key] = { a: a.score, h: h.score };
    const row = t => `<div class="rz-team ${sit.possession === t.id ? 'poss' : ''} ${st.completed && !t.winner ? 'lost' : ''}" style="--tc:${colorOf(t.team)}"><img src="${esc(t.team.logo)}" alt=""><b>${esc(t.team.abbreviation)}</b><small>${esc(t.records?.[0]?.summary || '')}</small><span class="num sc ${changed && prev && prev[t.homeAway === 'home' ? 'h' : 'a'] !== t.score ? 'flash' : ''}">${st.state === 'pre' ? '' : esc(t.score)}</span></div>`;
    return `<a class="rz-tile ${st.state} ${sit.isRedZone ? 'inrz' : ''} ${favGame(ev) ? 'fav' : ''}" href="#game/${ev.id}"><div class="rz-top"><span class="${st.state === 'in' ? 'live' : ''}">${st.state === 'in' ? '<span class="dot"></span>' : ''}${esc(st.state === 'in' ? fmtClock(st, c) : st.state === 'pre' ? fmtShort(ev.date) : st.shortDetail)}</span>${sit.isRedZone ? '<em class="rz">RED ZONE</em>' : ''}</div>${row(a)}${row(h)}<div class="rz-sit">${st.state === 'in' ? esc(sit.downDistanceText || '') + (sit.possessionText ? ' · ' + esc(sit.possessionText) : '') : esc(c.broadcasts?.[0]?.names?.join('/') || '')}</div>${sit.lastPlay?.text && st.state === 'in' ? `<div class="rz-last">${esc(sit.lastPlay.text)}</div>` : ''}</a>`; };
  view.innerHTML = `<div class="bar"><div><h1>RedZone</h1><h2>${live.length ? live.length + ' live · sorted by excitement' : 'No live games right now'} · Week ${esc(sb.week?.number || '')}</h2></div><span class="upd">${live.length ? 'Live · auto-refreshing' : ''}</span></div>
    ${live.length ? `<div class="rz-grid">${live.map(tile).join('')}</div>` : ''}
    ${up.length ? `<h3 class="cap" style="margin:var(--s5) 0 var(--s3);color:var(--muted)">Up next</h3><div class="rz-grid">${up.slice(0, 8).map(tile).join('')}</div>` : ''}
    ${done.length ? `<h3 class="cap" style="margin:var(--s5) 0 var(--s3);color:var(--muted)">Final</h3><div class="rz-grid">${done.map(tile).join('')}</div>` : ''}`;
  if (live.length) poll(redzone, true);
}

/* ---------- standings ---------- */
async function standings(conf) {
  const d = await standingsL3();
  const confs = (d.children || []).slice().sort(isCFB() ? confOrder : () => 0);
  const c = confs.find(x => x.abbreviation === conf || x.id === conf) || confs[0];
  const stat = (e, n) => e.stats.find(s => s.name === n)?.displayValue ?? '–';
  const cols = isCFB() ? [['CONF','vs. Conf.'],['OVR','overall'],['PF','pointsFor'],['PA','pointsAgainst'],['DIFF','pointDifferential'],['HOME','Home'],['AWAY','Away'],['vs AP','vs AP Top 25'],['STRK','streak']]
                       : [['W','wins'],['L','losses'],['T','ties'],['PCT','winPercent'],['PF','pointsFor'],['PA','pointsAgainst'],['DIFF','differential'],['HOME','Home'],['AWAY','Road'],['DIV','vs. Div.'],['CONF','vs. Conf.'],['STRK','streak']];
  view.innerHTML = `<div class="bar"><div><h1>Standings</h1><h2>${SEASON} regular season · ${isCFB() ? esc(c?.name || '') : 'click a column to sort'}</h2></div>
    ${isCFB() ? `<select id="confsel" aria-label="Conference">${confs.map(x => `<option value="${esc(x.id || x.abbreviation)}" ${x === c ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<div class="chips">${confs.map(x => `<a class="chip ${x === c ? 'on' : ''}" href="#standings/${esc(x.abbreviation)}">${esc(x.abbreviation)}</a>`).join('')}</div>`}</div>
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s4)">${confs.filter(x => P4.some(p => x.name.includes(p))).map(x => `<a class="chip ${x === c ? 'on' : ''}" href="#standings/${esc(x.id || x.abbreviation)}">${esc(x.abbreviation || x.name)}</a>`).join('')}</div>` : ''}
    <div class="stack">${(c.children || []).map((div, di) => `<div class="panel"><h3>${esc(div.name)}</h3><div class="tw"><table id="st${di}"><thead><tr><th class="sort" data-k="team">Team</th>${cols.map(k => `<th class="num sort" data-k="${k[1]}">${k[0]}</th>`).join('')}</tr></thead><tbody></tbody></table></div></div>`).join('')}</div>`;
  (c.children || []).forEach((div, di) => {
    const colFns = { team: e => e.team.displayName }; cols.forEach(k => colFns[k[1]] = e => { const v = e.stats.find(s => s.name === k[1]); if (v?.value != null && !isNaN(v.value) && !/^\d+-\d+/.test(String(v.displayValue))) return Number(v.value); const m = String(v?.displayValue ?? '').match(/^(\d+)-(\d+)/); return m ? (Number(m[1]) + 0.5) / (Number(m[1]) + Number(m[2]) + 1) + Number(m[1]) / 1000 : String(v?.displayValue ?? ''); });
    const table = document.getElementById('st' + di);
    sortable(table, div.standings.entries, colFns, e => `<tr class="clk ${isFav(e.team.id) ? 'fav' : ''}" data-t="${esc(e.team.id)}"><td class="tm"><img src="${esc(logo(e.team))}" alt="">${esc(e.team.displayName)}</td>${cols.map(k => { const v = stat(e, k[1]); const cls = /differential/i.test(k[1]) ? (num(v) > 0 ? 'pos' : num(v) < 0 ? 'neg' : '') : ''; return `<td class="num ${cls}">${esc(v)}</td>`; }).join('')}</tr>`, isCFB() ? 'vs. Conf.' : 'winPercent');
    table.addEventListener('drawn', wire); wire();
  });
  const cs = document.getElementById('confsel'); if (cs) cs.onchange = e => location.hash = 'standings/' + e.target.value;
}

/* ---------- playoff picture ---------- */
async function playoffs(sub) {
  if (isCFB()) return rankings(sub);
  const d = await getJSON(`${API2}/standings?season=${SEASON}`, 300000);
  const stat = (e, n) => e.stats.find(s => s.name === n)?.displayValue ?? '–';
  const sval = (e, n) => Number(e.stats.find(s => s.name === n)?.value ?? 99);
  const confHTML = c => {
    const entries = [...c.standings.entries].sort((x, y) => sval(x, 'playoffSeed') - sval(y, 'playoffSeed'));
    return `<div class="panel"><h3>${esc(c.name)}<span class="pill">7 qualify</span></h3><div class="tw"><table><thead><tr><th>Seed · Team</th><th class="num">W-L-T</th><th class="num">PCT</th><th class="num">DIFF</th><th class="num">GB</th><th class="num">STRK</th><th>Status</th></tr></thead><tbody>
      ${entries.map((e, i) => { const seed = sval(e, 'playoffSeed'); const cls = seed === 1 ? 'bye' : seed <= 7 ? 'in' : '';
        const label = seed === 1 ? 'Bye' : seed <= 4 ? 'Division leader' : seed <= 7 ? 'Wild card' : seed <= 10 ? 'In the hunt' : '';
        return `<tr class="clk ${i === 7 ? 'cut' : ''} ${isFav(e.team.id) ? 'fav' : ''}" data-t="${esc(e.team.id)}"><td class="tm"><span class="seed ${cls}">${seed < 99 ? seed : '–'}</span><img src="${esc(logo(e.team))}" alt="">${esc(e.team.displayName)}</td><td class="num">${esc(stat(e,'overall'))}</td><td class="num">${esc(stat(e,'winPercent'))}</td><td class="num">${esc(stat(e,'differential'))}</td><td class="num">${esc(stat(e,'gamesBehind'))}</td><td class="num">${esc(stat(e,'streak'))}</td><td class="muted">${label}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  };
  let bracket = '';
  if (!isCur()) {
    const post = (await seasonGames()).filter(ev => ev._post);
    const rounds = POST().map(([v, l]) => [l, post.filter(ev => ev._wk?.n === Number(v))]).filter(x => x[1].length);
    bracket = rounds.length ? `<div class="grid" style="margin-bottom:14px">${rounds.map(([l, evs]) => `<div class="panel"><h3>${esc(l)}</h3>${evs.map(gameCard).join('')}</div>`).join('')}</div>` : '';
  }
  view.innerHTML = `<div class="bar"><div><h1>${isCur() ? 'Playoff picture' : SEASON + ' playoffs'}</h1><h2>${isCur() ? 'If the season ended today · seeds from ESPN\'s standings' : 'Results by round, then final regular-season seeding'}</h2></div>${isCur() ? '<a class="chip" href="#odds">Simulated playoff odds →</a>' : ''}</div>
    ${bracket}<div class="stack">${(d.children || []).map(confHTML).join('')}</div>`;
  wire();
}

/* ---------- college rankings + projected CFP bracket ---------- */
async function rankings(pollName) {
  const d = await getJSON(`${API}/rankings`, 300000); const idx = await teamsIndex().catch(() => ({}));
  const polls = (d.rankings || []).filter(r => r.ranks?.length);
  if (!polls.length) { view.innerHTML = '<div class="panel"><div class="empty">Rankings are published once the season starts.</div></div>'; return; }
  const sel = polls.find(p => p.type === pollName || p.shortName === pollName) || polls.find(p => /cfp|playoff/i.test(p.name)) || polls[0];
  const cfp = polls.find(p => /cfp|playoff/i.test(p.name)) || polls.find(p => /ap/i.test(p.type)) || polls[0];
  const top12 = cfp.ranks.slice(0, 12);
  const tm = r => ({ id: r.team?.id, name: r.team?.nickname ? (r.team.location ? r.team.location + ' ' + r.team.nickname : r.team.nickname) : r.team?.name, abbr: r.team?.abbreviation, logo: r.team?.logo || r.team?.logos?.[0]?.href, rec: r.recordSummary });
  const seedCard = (r, i) => { const t = tm(r); return `<a class="seed-card" href="#team/${esc(t.id)}" style="--tc:${colorOf(idx[t.id] || r.team)}"><span class="sd">${i + 1}</span><img src="${esc(t.logo)}" alt=""><div><b>${esc(t.abbr || t.name)}</b><small>${esc(t.rec || '')}</small></div></a>`; };
  const matchup = (hi, lo) => `<div class="mu">${seedCard(top12[hi], hi)}<span class="muted">vs</span>${seedCard(top12[lo], lo)}</div>`;
  view.innerHTML = `<div class="bar"><div><h1>Rankings</h1><h2>${esc(sel.headline || sel.name)}${sel.occurrence?.displayValue ? ' · ' + esc(sel.occurrence.displayValue) : ''}</h2></div><div class="chips">${polls.map(p => `<a class="chip ${p === sel ? 'on' : ''}" href="#playoffs/${esc(p.type || p.shortName)}">${esc(p.shortName || p.name)}</a>`).join('')}</div></div>
    <div class="two"><div class="panel"><h3>${esc(sel.name)}<span class="pill">${sel.ranks.length} teams</span></h3><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th class="num">Record</th><th class="num">Pts</th><th class="num">1st</th><th class="num">Prev</th><th class="num">Trend</th></tr></thead><tbody>
      ${sel.ranks.map(r => { const t = tm(r); const tr = String(r.trend || '-'); return `<tr class="clk ${isFav(t.id) ? 'fav' : ''}" data-t="${esc(t.id)}"><td class="num">${esc(r.current)}</td><td class="tm"><img src="${esc(t.logo)}" alt="">${esc(t.name)}</td><td class="num">${esc(t.rec || '')}</td><td class="num">${esc(r.points ?? '')}</td><td class="num">${r.firstPlaceVotes ? esc(r.firstPlaceVotes) : ''}</td><td class="num muted">${esc(r.previous || '–')}</td><td class="num ${tr.startsWith('+') ? 'pos' : tr.startsWith('-') && tr !== '-' ? 'neg' : ''}">${esc(tr)}</td></tr>`; }).join('')}
      ${(sel.others || []).length ? `<tr><td colspan="7" class="muted" style="white-space:normal;font-size:13px"><b>Others receiving votes:</b> ${sel.others.map(o => esc((o.team?.nickname || o.team?.name) + ' ' + (o.points || ''))).join(', ')}</td></tr>` : ''}
    </tbody></table></div></div>
    <div class="stack"><div class="panel"><h3>Projected 12-team playoff<span class="pill">from ${esc(cfp.shortName || cfp.name)}</span></h3>
      <div class="lhead" style="grid-template-columns:1fr"><span>First-round byes</span></div><div class="byes">${top12.slice(0, 4).map(seedCard).join('')}</div>
      <div class="lhead" style="grid-template-columns:1fr"><span>First round · on campus</span></div><div class="mus">${matchup(4, 11)}${matchup(5, 10)}${matchup(6, 9)}${matchup(7, 8)}</div>
      <p class="note" style="padding:0 16px 12px;margin:0">Straight seeding from the poll's top 12. The real bracket gives automatic bids to the five highest-ranked conference champions, so the field can differ late in the season.</p></div></div></div>`;
  wire();
}

/* ---------- power index (computed) ---------- */
async function power() {
  const [d, res] = await Promise.all([standingsL3(), teamResults().catch(() => ({}))]);
  const rows = [];
  d.children.forEach(c => c.children.forEach(div => (div.standings?.entries || []).forEach(e => {
    const v = n => Number(e.stats.find(s => s.name === n)?.value ?? 0);
    const w = v('wins'), l = v('losses'), t = v('ties'), g = w + l + t, pf = v('pointsFor'), pa = v('pointsAgainst');
    const pyth = (pf || pa) ? Math.pow(pf, 2.37) / (Math.pow(pf, 2.37) + Math.pow(pa, 2.37)) : 0.5;
    const pct = g ? (w + t / 2) / g : 0;
    rows.push({ team: e.team, conf: c.abbreviation || c.name, w, l, t, g, pf, pa, diff: pf - pa, mov: g ? (pf - pa) / g : 0, pyth, pct, luck: pct - pyth, pythW: pyth * g, streak: e.stats.find(s => s.name === 'streak')?.displayValue || '' });
  })));
  const pctOf = {}; rows.forEach(r => pctOf[r.team.id] = r.pct);
  rows.forEach(r => { const gs = res[r.team.id] || []; r.sos = gs.length ? gs.reduce((n, g) => n + (pctOf[g.op] ?? .5), 0) / gs.length : .5; const l3 = gs.slice(-3); r.last3 = l3.length ? l3.reduce((n, g) => n + (g.ms - g.os), 0) / l3.length : 0; });
  rows.forEach(r => r.rating = r.mov * 0.6 + (r.pyth - 0.5) * 24 + (r.sos - 0.5) * 12 + r.last3 * 0.15);
  rows.sort((a, b) => b.rating - a.rating).forEach((r, i) => r.rank = i + 1);
  view.innerHTML = `<div class="bar"><div><h1>Power index</h1><h2>Computed here from scoring, schedule strength and recent form · not an ESPN ranking</h2></div></div>
    <div class="panel"><h3>All ${rows.length} teams<span class="pill">click a column to sort</span></h3><div class="tw"><table id="pw"><thead><tr><th class="sort" data-k="rank">#</th><th class="sort" data-k="team">Team</th><th class="num sort" data-k="rec">Record</th><th class="num sort" data-k="rating">Rating</th><th class="num sort" data-k="mov">MOV</th><th class="num sort" data-k="pf">PF/G</th><th class="num sort" data-k="pa">PA/G</th><th class="num sort" data-k="pyth">Pyth W-L</th><th class="num sort" data-k="luck">Luck</th><th class="num sort" data-k="sos">SOS</th><th class="num sort" data-k="last3">Last 3 MOV</th><th class="num">STRK</th></tr></thead><tbody></tbody></table></div></div>
    <p class="note">Rating blends margin of victory, Pythagorean expectation (exponent 2.37), opponents' win percentage (SOS) and average margin over the last three games. <b>Luck</b> is actual win% minus expected: positive means the team has won more than its scoring suggests.</p>`;
  const table = document.getElementById('pw');
  sortable(table, rows, { rank: r => -r.rank, team: r => r.team.displayName, rec: r => r.pct, rating: r => r.rating, mov: r => r.mov, pf: r => r.g ? r.pf / r.g : 0, pa: r => r.g ? -r.pa / r.g : 0, pyth: r => r.pyth, luck: r => r.luck, sos: r => r.sos, last3: r => r.last3 },
    r => `<tr class="clk ${isFav(r.team.id) ? 'fav' : ''}" data-t="${esc(r.team.id)}"><td class="num">${r.rank}</td><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.displayName)} <span class="tag">${esc(r.conf)}</span></td><td class="num">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td><td class="num ${r.rating >= 0 ? 'pos' : 'neg'}">${sgn(r.rating.toFixed(1))}</td><td class="num">${sgn(r.mov.toFixed(1))}</td><td class="num">${r.g ? (r.pf / r.g).toFixed(1) : '–'}</td><td class="num">${r.g ? (r.pa / r.g).toFixed(1) : '–'}</td><td class="num">${r.pythW.toFixed(1)}-${(r.g - r.pythW).toFixed(1)}</td><td class="num ${r.luck >= 0 ? 'pos' : 'neg'}">${sgn((r.luck * 100).toFixed(0))}%</td><td class="num">${r.sos.toFixed(3)}</td><td class="num ${r.last3 >= 0 ? 'pos' : 'neg'}">${sgn(r.last3.toFixed(1))}</td><td class="num">${esc(r.streak)}</td></tr>`, 'rank');
  table.addEventListener('drawn', wire); wire();
}

/* ---------- live box scores (ESPN season totals lag until a game is final) ---------- */
// map leaders categories / game-log column names → box score category + label
const LIVE_MAP = { passingYards: ['passing','YDS'], passingTouchdowns: ['passing','TD'], completions: ['passing','C/ATT',0], passingAttempts: ['passing','C/ATT',1], interceptions_thrown: ['passing','INT'],
  rushingYards: ['rushing','YDS'], rushingTouchdowns: ['rushing','TD'], rushingAttempts: ['rushing','CAR'], receivingYards: ['receiving','YDS'], receivingTouchdowns: ['receiving','TD'], receptions: ['receiving','REC'], receivingTargets: ['receiving','TGTS'],
  totalTackles: ['defensive','TOT'], soloTackles: ['defensive','SOLO'], sacks: ['defensive','SACKS'], tacklesForLoss: ['defensive','TFL'], passesDefended: ['defensive','PD'], QBHits: ['defensive','QB HTS'], interceptions: ['interceptions','INT'], fieldGoalsMade: ['kicking','FG',0], extraPointsMade: ['kicking','XP',0] };
let liveCache = { t: 0, data: null };
async function liveBox() {
  if (!isCur()) return { players: {}, games: [] };
  if (liveCache.data && Date.now() - liveCache.t < 30000) return liveCache.data;
  const sb = await getJSON(SB_URL(), 30000).catch(() => ({ events: [] }));
  const live = (sb.events || []).filter(e => e.status.type.state === 'in');
  const players = {};
  await Promise.all(live.map(async ev => { try { const sum = await getJSON(`${API}/summary?event=${ev.id}`, 30000);
    (sum.boxscore?.players || []).forEach(side => side.statistics.forEach(c => c.athletes.forEach(a => { const r = (players[a.athlete.id] ||= { ev, team: side.team, cats: {} }); const o = (r.cats[c.name] ||= {}); c.labels.forEach((l, i) => o[l] = a.stats[i]); }))); } catch {} }));
  liveCache = { t: Date.now(), data: { players, games: live } }; return liveCache.data;
}
const liveVal = (rec, key) => { const m = LIVE_MAP[key]; if (!m || !rec) return 0; const raw = rec.cats[m[0]]?.[m[1]]; if (raw == null) return 0; return m[2] != null ? num(String(raw).split(/[\/-]/)[m[2]]) : num(raw); };

// college: expand one category to ESPN's top 50 by resolving the core feed's athlete links (cached)
async function expandCategory(cat) {
  if (!cat?.expandable || cat.expanded) return cat;
  const core = await getJSON(`${CORE}/seasons/${SEASON}/types/2/leaders?limit=50`, 300000).catch(() => null);
  const cc = (core?.categories || []).find(c => c.name === cat.name); if (!cc) return cat;
  const idx = await teamsIndex().catch(() => ({}));
  const known = {}; cat.leaders.forEach(l => known[l.athlete.id] = l);
  const idOf = ref => (ref?.$ref || '').match(/\/(athletes|teams)\/(\d+)/)?.[2];
  const rows = cc.leaders.filter(l => l.value > 0);
  const out = []; for (let i = 0; i < rows.length; i += 10) { await Promise.all(rows.slice(i, i + 10).map(async l => { const aid = idOf(l.athlete), tid = idOf(l.team); let a = known[aid]?.athlete;
    if (!a) { try { const d = await getJSON(`${CORE}/seasons/${SEASON}/athletes/${aid}`, 3600000); a = { id: aid, displayName: d.displayName, headshot: { href: d.headshot?.href || '' }, position: { abbreviation: d.position?.abbreviation || '' } }; } catch { a = { id: aid, displayName: 'Player #' + aid, headshot: { href: '' }, position: { abbreviation: '' } }; } }
    out.push({ displayValue: l.displayValue, value: l.value, athlete: a, team: idx[tid] || known[aid]?.team || { id: tid, abbreviation: '' } }); })); }
  out.sort((a, b) => b.value - a.value); cat.leaders = out; cat.expanded = true; return cat;
}
/* ---------- leaders ---------- */
const LGROUPS = [
  ['Passing', ['passingYards','passingTouchdowns','QBRating','passerRating','completionPct','yardsPerPassAttempt','interceptions_thrown','passingYardsPerGame','completions','passingAttempts']],
  ['Rushing', ['rushingYards','rushingTouchdowns','yardsPerRushAttempt','rushingAttempts','rushingYardsPerGame','longRushing']],
  ['Receiving', ['receivingYards','receivingTouchdowns','receptions','yardsPerReception','receivingYardsPerGame','receivingTargets','longReception']],
  ['Defense', ['totalTackles','sacks','interceptions','passesDefended','fumblesForced','tacklesForLoss','soloTackles','QBHits','defensiveTouchdowns','fumblesRecovered']],
  ['Kicking', ['fieldGoalsMade','fieldGoalPct','extraPointsMade','longFieldGoalMade','puntYards','grossAvgPuntYards','kickReturnYards','puntReturnYards']],
];
const lowerBetter = n => /interceptions_thrown|fumbles$|sacks_taken/i.test(n);
async function leaders(cat) {
  view.innerHTML = `<div class="bar"><div><h1>League leaders</h1><h2>Loading full leaderboards…</h2></div></div><div class="prog" id="lp"><i style="width:0"></i></div><div class="panel" style="margin-top:14px"><div class="skel"></div><div class="skel"></div></div>`;
  const cats = (await fullLeaders(p => { const b = document.querySelector('#lp i'); if (b) b.style.width = p * 100 + '%'; })).filter(c => c.leaders?.length);
  if (!cats.length) { view.innerHTML = '<div class="panel"><div class="empty">Leaders are posted once the season has stats.</div></div>'; return; }
  const byName = {}; cats.forEach(c => byName[c.name] = c);
  const groups = LGROUPS.map(([g, names]) => [g, names.map(n => byName[n]).filter(Boolean)]).filter(x => x[1].length);
  const used = new Set(groups.flatMap(x => x[1].map(c => c.name)));
  const rest = cats.filter(c => !used.has(c.name)); if (rest.length) groups.push(['More', rest]);
  let sel = byName[cat] || groups[0][1][0];
  const grp = groups.find(x => x[1].includes(sel)) || groups[0];
  const idx = await teamsIndex().catch(() => ({}));
  // add in-progress box-score numbers (ESPN's season totals only update once a game is final)
  const lb = await liveBox().catch(() => ({ players: {}, games: [] }));
  const liveFor = l => liveVal(lb.players[l.athlete.id], sel.name);
  const dec = /\./.test(sel.leaders[0]?.displayValue || '');
  const withLive = l => { const add = liveFor(l); return add ? { ...l, value: l.value + add, displayValue: (l.value + add).toFixed(dec ? 1 : 0), liveAdd: add } : l; };
  if (lb.games.length && LIVE_MAP[sel.name]) { sel = { ...sel, leaders: sel.leaders.map(withLive).sort((a, b) => b.value - a.value) }; }
  const top = sel.leaders[0]?.value || 1;
  const positions = [...new Set(sel.leaders.map(l => l.athlete.position?.abbreviation).filter(Boolean))].sort();
  const teamsIn = [...new Set(sel.leaders.map(l => l.team?.id).filter(Boolean))].map(id => idx[id] || sel.leaders.find(l => l.team?.id === id).team).sort((a, b) => (a.abbreviation || '').localeCompare(b.abbreviation || ''));
  const tcol = l => colorOf(idx[l.team?.id] || l.team);
  const pod = (l, i) => l ? `<a class="pod ${i === 0 ? 'first' : ''}" href="#player/${esc(l.athlete.id)}" style="--tc:${tcol(l)}"><span class="rk">${i + 1}</span><img class="tl" src="${esc(logo(idx[l.team?.id] || l.team))}" alt=""><img class="ph" src="${esc(hsOf(l.athlete))}" alt=""><b>${esc(l.athlete.displayName)}</b><small>${esc(l.athlete.position?.abbreviation || '')} · ${esc(l.team?.abbreviation || '')}</small><span class="v">${esc(l.displayValue)}${l.liveAdd ? '<small class="livetag">+' + esc(l.liveAdd) + ' live</small>' : ''}</span>${i > 0 && sel.leaders[0] ? `<span class="delta">${esc((l.value - sel.leaders[0].value).toFixed(/\./.test(sel.leaders[0].displayValue) ? 1 : 0))} vs leader</span>` : '<span class="delta">leader</span>'}</a>` : '<div></div>';
  const [p1, p2, p3] = sel.leaders;
  let shown = 25, posF = '', teamF = '';
  view.innerHTML = `<div class="bar"><div><h1>League leaders</h1><h2>${SEASON} regular season</h2></div><input id="pq" placeholder="Find a player" aria-label="Filter players" style="min-width:min(100%,260px)"></div>
    <div class="lgroups">${groups.map(([g]) => `<button class="${g === grp[0] ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
    <div class="lcats" id="lcats">${grp[1].map(c => `<a class="${c === sel ? 'on' : ''}" href="#leaders/${esc(c.name)}">${esc(c.displayName)}</a>`).join('')}</div>
    <div class="two"><div class="panel">
      <h3>${esc(sel.displayName)}<span class="pill">${sel.leaders.length} qualifiers${lb.games.length && LIVE_MAP[sel.name] ? ` · <span class="pos"><span class="dot"></span>${lb.games.length} live game${lb.games.length > 1 ? 's' : ''} included</span>` : ''}</span></h3>
      <div class="podium">${pod(p2, 1)}${pod(p1, 0)}${pod(p3, 2)}</div>
      <div class="lfilters" style="margin-top:14px"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em">Filter</span><button class="chip on" data-pos="">All</button>${positions.map(p => `<button class="chip" data-pos="${esc(p)}">${esc(p)}</button>`).join('')}<select id="lteam" aria-label="Team" style="margin-left:auto"><option value="">All teams</option>${teamsIn.map(t => `<option value="${esc(t.id)}">${esc(t.abbreviation || t.displayName)}</option>`).join('')}</select></div>
      <div class="lhead"><span>#</span><span></span><span>Player</span><span>vs leader</span><span>${esc(sel.abbreviation)}</span></div>
      <div id="mainlist"></div>
      <div id="morewrap" class="empty" style="padding:12px"><button class="chip" id="more">${sel.expandable && !sel.expanded ? 'Load ESPN top 50' : 'Show all ' + sel.leaders.length}</button></div>
    </div>
    <div class="stack lside">${grp[1].filter(c => c !== sel).slice(0, 4).concat(groups.filter(x => x !== grp).map(x => x[1][0])).slice(0, 5).map(c => `<div class="panel"><h3>${esc(c.displayName)}<a class="lnk" style="font-size:12px;letter-spacing:0;text-transform:none" href="#leaders/${esc(c.name)}">All ${c.leaders.length} →</a></h3>${c.leaders.slice(0, 5).map((l, i) => `<a class="leader" href="#player/${esc(l.athlete.id)}"><span class="rank num">${i + 1}</span><img src="${esc(hsOf(l.athlete))}" alt="" loading="lazy"><div><div class="nm">${esc(l.athlete.displayName)}</div><div class="sub">${esc(l.athlete.position?.abbreviation || '')} · ${esc(l.team?.abbreviation || '')}</div></div><span class="val">${esc(l.displayValue)}</span></a>`).join('')}</div>`).join('')}</div></div>`;
  const row = (l, i) => { const pct = Math.max(2, Math.min(100, l.value / top * 100)); const t = idx[l.team?.id] || l.team; return `<a class="lrow ${isFav(l.team?.id) ? 'me' : ''}" href="#player/${esc(l.athlete.id)}" style="--tc:${colorOf(t)}"><span class="r ${i < 3 ? 't3' : ''}">${i + 1}</span><img class="ph" src="${esc(hsOf(l.athlete))}" alt="" loading="lazy"><div><div class="nm">${esc(l.athlete.displayName)}</div><div class="sub"><img src="${esc(logo(t))}" alt="">${esc(l.athlete.position?.abbreviation || '')} · ${esc(t?.abbreviation || '')}</div></div><div class="bar" title="${Math.round(pct)}% of leader"><i style="width:${pct}%"></i></div><span class="v">${esc(l.displayValue)}${l.liveAdd ? `<small class="livetag">incl. +${esc(l.liveAdd)} live</small>` : i > 0 ? `<small>${esc((l.value - top).toFixed(/\./.test(l.displayValue) ? 1 : 0))}</small>` : '<small>leader</small>'}</span></a>`; };
  const render = () => { const q = document.getElementById('pq').value.toLowerCase();
    const hits = sel.leaders.filter(l => (!posF || l.athlete.position?.abbreviation === posF) && (!teamF || l.team?.id === teamF) && (!q || (l.athlete.displayName + ' ' + (l.team?.abbreviation || '')).toLowerCase().includes(q)));
    const lim = (q || posF || teamF) ? 200 : shown;
    document.getElementById('mainlist').innerHTML = hits.slice(0, lim).map(l => row(l, sel.leaders.indexOf(l))).join('') || '<div class="empty">No players match.</div>';
    document.getElementById('morewrap').hidden = hits.length <= lim && !(sel.expandable && !sel.expanded); };
  render();
  document.getElementById('pq').oninput = render;
  document.getElementById('more').onclick = async () => { if (sel.expandable && !sel.expanded) { document.getElementById('more').textContent = 'Loading…'; await expandCategory(sel); leaders(cat); return; } shown = 1000; render(); };
  document.getElementById('lteam').onchange = e => { teamF = e.target.value; render(); };
  view.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { posF = b.dataset.pos; view.querySelectorAll('[data-pos]').forEach(x => x.classList.toggle('on', x === b)); render(); });
  view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { const g = groups.find(x => x[0] === b.dataset.g); if (g) location.hash = 'leaders/' + g[1][0].name; });
  if (lb.games.length) poll(() => leaders(cat), false);
}

/* ---------- players (search) ---------- */
async function players(q0) {
  view.innerHTML = `<div class="bar"><div><h1>Players</h1><h2>Current rosters plus every player in ESPN's database (game logs from 2000)</h2></div><input id="ps" placeholder="Name, team or position (e.g. Mahomes, KC, WR)" aria-label="Search players" style="min-width:min(100%,340px)"></div>
    <div class="prog" id="rp"><i style="width:0"></i></div>
    <div class="panel" style="margin-top:14px"><h3 id="pcount">Loading rosters…</h3><div class="plist" id="plist"></div></div>`;
  const input = document.getElementById('ps'); input.value = decodeURIComponent(q0 || ''); input.focus();
  const list = isCFB() ? [] : await allRosters(p => { const b = document.querySelector('#rp i'); if (b) b.style.width = p * 100 + '%'; });
  document.getElementById('rp')?.remove();
  let seq = 0, timer;
  const render = async () => {
    const q = input.value.trim().toLowerCase(); const el = document.getElementById('plist'); if (!el) return; const my = ++seq;
    const hits = q ? list.filter(p => (p.name + ' ' + p.team.abbreviation + ' ' + p.team.displayName + ' ' + p.pos).toLowerCase().includes(q)) : list.filter(p => isFav(p.team.id));
    document.getElementById('pcount').textContent = isCFB() ? (q ? 'Results' : 'Type a player name') : q ? `${hits.length} on current rosters` : favs.length ? `${hits.length} on your teams` : `${list.length} players loaded · type a name (current or past players)`;
    const rowHTML = p => `<a href="#player/${esc(p.id)}"><img src="${esc(p.hs)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b> <span class="muted">#${esc(p.jersey)} ${esc(p.pos)} · ${esc(p.team.displayName)}</span>${p.inj ? ' ' + injTag(p.inj) : ''}</span><img src="${esc(logo(p.team))}" alt="" style="border-radius:0;object-fit:contain"></a>`;
    el.innerHTML = hits.slice(0, 80).map(rowHTML).join('') + (q.length >= 2 ? '<div class="hd" id="alltime" style="padding:10px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">Searching all players since 2000…</div>' : '');
    if (q.length < 2) return;
    const seenIds = new Set(hits.map(p => p.id));
    const remote = (await searchAthletes(q, 20).catch(() => [])).filter(p => !seenIds.has(p.id));
    if (my !== seq) return; const at = document.getElementById('alltime'); if (!at) return;
    at.outerHTML = remote.length ? `<div class="hd" style="padding:10px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">All-time players</div>` + remote.map(p => `<a href="#player/${esc(p.id)}"><img src="${esc(p.hs)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b> <span class="muted">${esc(p.sub)}</span></span><span class="tag">past / other</span></a>`).join('') : (hits.length ? '' : '<div class="empty">No players found. Try a last name.</div>');
  };
  render(); input.oninput = () => { clearTimeout(timer); timer = setTimeout(render, 220); };
}

/* ---------- player page ---------- */
async function player(id, tab = 'season') {
  const [bio, gl, ov, inj, career] = await Promise.all([getJSON(`${WEB}/athletes/${id}`, 600000), getJSON(`${WEB}/athletes/${id}/gamelog?season=${SEASON}`, 120000).catch(() => null), getJSON(`${WEB}/athletes/${id}/overview`, 600000).catch(() => null), getJSON(`${API}/injuries`, 300000).catch(() => null), getJSON(`${WEB}/athletes/${id}/stats`, 3600000).catch(() => null)]);
  const p = bio.athlete; const t = p.team || {};
  const myInj = inj?.injuries?.flatMap(tm => tm.injuries || []).find(i => String(i.athlete?.id) === String(id) || i.athlete?.displayName === p.displayName);
  let glHTML = '', trendHTML = '', splitHTML = '';
  if (gl?.events && gl.seasonTypes?.length) {
    const labels = gl.labels || [], names = gl.names || [];
    const rows = gl.seasonTypes.flatMap(s => (s.categories || []).flatMap(c => (c.events || []).map(e => ({ ...gl.events[e.eventId], stats: e.stats }))));
    rows.sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
    let totals = gl.seasonTypes[0]?.categories?.[0]?.totals;
    // live game not yet in the log: add a row from the box score and bump the totals
    const lb = isCur() ? await liveBox().catch(() => ({ players: {} })) : { players: {} };
    const lrec = lb.players[String(id)]; let liveRow = '';
    if (lrec && !rows.some(r => String(r.id) === String(lrec.ev.id))) {
      const vals = names.map(n => { const key = n === 'interceptions' && /passing/i.test(gl.categories?.[0]?.name || '') ? 'interceptions_thrown' : n; const v = liveVal(lrec, key); return LIVE_MAP[key] ? v : null; });
      const c = lrec.ev.competitions[0]; const me = c.competitors.find(x => x.team.id === lrec.team.id), op = c.competitors.find(x => x.team.id !== lrec.team.id);
      liveRow = `<tr class="hl" data-g="${esc(lrec.ev.id)}" style="cursor:pointer"><td class="num">${esc(lrec.ev.week?.number ?? '')}</td><td class="tm"><img src="${esc(op?.team?.logo || '')}" alt="">${me?.homeAway === 'home' ? 'vs' : '@'} ${esc(op?.team?.abbreviation || '')}</td><td><span class="dot"></span><span class="muted num">${esc(me?.score)}–${esc(op?.score)} · ${esc(lrec.ev.status.type.shortDetail)}</span></td>${vals.map(v => `<td class="num">${v == null ? '–' : esc(v)}</td>`).join('')}</tr>`;
      if (totals) totals = totals.map((t, i) => vals[i] == null ? t : (num(t) + vals[i]).toFixed(/\./.test(String(t)) ? 1 : 0));
    }
    glHTML = `<div class="panel"><h3>${SEASON} game log${liveRow ? '<span class="pill"><span class="pos"><span class="dot"></span>live game included</span></span>' : ''}</h3><div class="tw"><table><thead><tr><th>Wk</th><th>Opp</th><th>Result</th>${labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr class="clk" data-g="${esc(r.id)}"><td class="num">${esc(r.week)}</td><td class="tm"><img src="${esc(r.opponent?.logo)}" alt="">${esc(r.atVs)} ${esc(r.opponent?.abbreviation)}</td><td><span class="res ${esc(r.gameResult)}">${esc(r.gameResult)}</span> <span class="muted num">${esc(r.score)}</span></td>${(r.stats || []).map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}
      ${liveRow}
      ${totals ? `<tr class="hl"><td colspan="3"><b>Season${liveRow ? ' <span class="muted" style="font-weight:400">incl. live</span>' : ''}</b></td>${totals.map(v => `<td class="num"><b>${esc(v)}</b></td>`).join('')}</tr>` : ''}
    </tbody></table></div></div>`;
    if (liveRow && !refreshTimer) poll(() => player(id, tab), false);
    const ki = Math.max(0, names.findIndex(n => /yards|tackles|sacks|interceptions|fieldGoalsMade/i.test(n) && !/perGame|avg|long/i.test(n)));
    if (rows.length >= 2) {
      trendHTML = `<div class="panel"><h3>${esc(gl.displayNames?.[ki] || labels[ki] || 'Trend')} by week</h3><div class="chart">${lineChart([{ v: rows.map(r => num(r.stats?.[ki])), cls: 'lA', area: true }], rows.map(r => 'W' + r.week))}</div></div>`;
      const split = (name, filt) => { const g = rows.filter(filt); const avg = g.length ? (g.reduce((n, r) => n + num(r.stats?.[ki]), 0) / g.length).toFixed(1) : '–'; return `<div class="kpi"><small>${name} (${g.length})</small><b>${avg}</b></div>`; };
      splitHTML = `<div class="panel"><h3>${esc(labels[ki] || '')} per game</h3><div class="kpis">${split('Home', r => r.atVs === 'vs')}${split('Away', r => r.atVs === '@')}${split('In wins', r => r.gameResult === 'W')}${split('In losses', r => r.gameResult === 'L')}</div></div>`;
    }
  }
  let ovHTML = '';
  if (ov?.statistics?.splits?.length) { const st = ov.statistics;
    ovHTML = `<div class="panel"><h3>${esc(st.displayName || 'Career')}</h3><div class="tw"><table><thead><tr><th>Split</th>${st.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(s => `<tr><td>${esc(s.displayName)}</td>${s.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`; }
  // career: season-by-season per category, with a chart on the key stat and career totals row
  const cats = (career?.categories || []).filter(c => c.statistics?.length).map(fillQBR);
  const isRateL = l => /%|AVG|RTG|QBR|LNG|PCT|Y\/|\/G|YPC|YPR|^GP$|^GS$/i.test(l);
  const careerHTML = cats.length ? cats.map((c, ci) => { const rows = [...c.statistics].sort((x, y) => x.season.year - y.season.year);
    const ki = Math.max(0, c.names.findIndex(n => /yards|tackles|sacks|interceptions|fieldGoalsMade|receptions|touchdowns/i.test(n) && !/perGame|avg|long/i.test(n)));
    const gpI = c.labels.indexOf('GP'); const best = rows.reduce((b, r) => num(r.stats[ki]) > num(b.stats[ki]) ? r : b, rows[0]);
    const perG = c.totals && gpI >= 0 && num(c.totals[gpI]) ? c.labels.map((l, i) => isRateL(l) ? '' : (num(c.totals[i]) / num(c.totals[gpI])).toFixed(1)) : null;
    return `<div class="panel"><h3>${esc(c.displayName)}<span class="pill">${rows.length} season${rows.length > 1 ? 's' : ''} · best ${esc(c.labels[ki])}: ${esc(best.stats[ki])} (${best.season.year})</span></h3>
      ${rows.length > 1 && ci === 0 ? `<div class="chart">${lineChart([{ v: rows.map(r => num(r.stats[ki])), cls: 'lA', area: true }], rows.map(r => String(r.season.year).slice(2)))}</div><div class="legend"><span><i></i>${esc(c.displayNames?.[ki] || c.labels[ki])} by season</span></div>` : ''}
      <div class="tw"><table><thead><tr><th>Season</th><th>Team</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(r => `<tr class="${r === best && rows.length > 1 ? 'hl' : ''}"><td class="num">${r.season.year}${r.season.year === SEASON ? ' <span class="tag" style="font-size:10px">current</span>' : ''}</td><td class="muted">${esc((r.teamSlug || '').split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' '))}</td>${r.stats.map((v, i) => `<td class="num ${i === ki && r === best && rows.length > 1 ? 'pos' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
        ${c.totals ? `<tr style="font-weight:600"><td colspan="2">Career</td>${c.totals.map((v, i) => `<td class="num">${c.qbrEstimated && c.labels[i] === 'QBR' ? '≈' : ''}${esc(v)}</td>`).join('')}</tr>` : ''}
        ${perG ? `<tr class="muted"><td colspan="2">Per game</td>${perG.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>` : ''}
      </tbody></table></div>${c.qbrEstimated ? qbrNote(c.qbrSeasons < c.statistics.length ? [c.qbrSeasons + ' of ' + c.statistics.length + ' seasons have QBR; it begins in 2006'] : []) : ''}</div>`; }).join('') : '<div class="panel"><div class="empty">No career statistics available for this player.</div></div>';
  const yrs = [...new Set(cats.flatMap(c => c.statistics.map(r => r.season.year)))];
  const teamsPlayed = [...new Set(cats.flatMap(c => c.statistics.map(r => r.teamSlug)))].filter(Boolean);
  const newsHTML = (ov?.news || []).slice(0, 5).map(n => `<a class="leader" style="grid-template-columns:1fr" href="${esc(n.links?.web?.href || '#')}" target="_blank" rel="noopener"><div><div class="nm">${esc(n.headline)}</div><div class="sub">${esc(n.lastModified ? ago(n.lastModified) : '')}${n.byline ? ' · ' + esc(n.byline) : ''}</div></div></a>`).join('');
  view.innerHTML = `<div class="row" style="justify-content:space-between"><a class="back" href="#players">← Players</a><a class="chip" href="#pcompare/${esc(id)}-${SEASON}/">Compare with another player →</a></div>
    <div class="phero" style="--tc:${colorOf(t)}"><img class="hs" src="${esc(hsOf(p))}" alt=""><div>
      <div class="row"><span class="jer">#${esc(p.jersey || '')}</span><div><h1 style="margin:0">${esc(p.displayName)}</h1><h2>${esc(p.position?.displayName || '')} · <a href="#team/${esc(t.id)}">${esc(t.displayName || 'Free agent')}</a></h2></div></div>
      <div class="bio"><span>HT <b>${esc(p.displayHeight || '–')}</b></span><span>WT <b>${esc(p.displayWeight || '–')}</b></span><span>Age <b>${esc(p.age ?? '–')}</b></span><span>College <b>${esc(p.college?.name || '–')}</b></span><span>Draft <b>${esc(p.displayDraft || 'Undrafted')}</b></span><span>Exp <b>${esc(p.experience?.years ?? p.displayExperience ?? '–')}</b></span><span>Status <b>${esc(p.status?.name || '')}</b>${myInj ? ' ' + injTag(myInj.status) : ''}</span></div>
      ${myInj ? `<div class="muted" style="margin-top:8px;font-size:13px">${esc(myInj.shortComment || myInj.longComment || myInj.details?.type || '')}${myInj.details?.returnDate ? ' · Expected return ' + esc(fmtDay(myInj.details.returnDate)) : ''}</div>` : ''}
    </div></div>
    <div class="tabs">${[['season', SEASON + ' season'],['career', `Career${yrs.length ? ' (' + yrs.length + ' seasons)' : ''}`]].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-ptab="${k}">${l}</button>`).join('')}</div>
    ${tab === 'career' ? `<div class="panel" style="margin-bottom:var(--s4)"><div class="kpis"><div class="kpi"><small>Seasons</small><b>${yrs.length || '–'}</b></div><div class="kpi"><small>Years</small><b style="font-size:18px">${yrs.length ? Math.min(...yrs) + '–' + Math.max(...yrs) : '–'}</b></div><div class="kpi"><small>Teams</small><b style="font-size:18px">${teamsPlayed.length ? teamsPlayed.map(t => esc(t.split('-').pop().toUpperCase())).join(', ') : '–'}</b></div><div class="kpi"><small>Games</small><b>${(() => { const c0 = cats[0]; const i = c0 ? c0.labels.indexOf('GP') : -1; return i >= 0 ? esc(c0.totals?.[i] ?? '–') : '–'; })()}</b></div></div></div>
      <div class="stack">${careerHTML}</div>`
    : `<div class="two"><div class="stack">${glHTML || '<div class="panel"><div class="empty">No game log for this season yet.</div></div>'}${ovHTML}</div>
    <div class="stack">${trendHTML}${splitHTML}${newsHTML ? `<div class="panel"><h3>News</h3>${newsHTML}</div>` : ''}</div></div>`}`;
  view.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { history.replaceState(null, '', `#player/${id}/${b.dataset.ptab}`); player(id, b.dataset.ptab); });
  wire();
}

/* ---------- teams ---------- */
async function teams() {
  const idx = await teamsIndex();
  const list = Object.values(idx).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const card = t => `<a class="tcard" href="#team/${esc(t.id)}" style="--tc:${colorOf(t)};${isFav(t.id) ? 'border-color:var(--gold)' : ''}"><img src="${esc(logo(t))}" alt="" loading="lazy"><b>${esc(t.displayName)}</b><small>${esc(t.stats?.find(s => s.name === 'overall')?.displayValue || '')}</small></a>`;
  let body;
  if (isCFB()) { const groups = {}; list.forEach(t => (groups[t.confName || t.conf || 'Other'] ||= []).push(t)); const names = Object.keys(groups).sort((a, b) => confOrder({ name: a }, { name: b }));
    body = `<input id="tq" placeholder="Find a team" aria-label="Find a team" style="margin-bottom:var(--s4);min-width:min(100%,280px)"><div class="stack" id="tgroups">${names.map(n => `<div class="panel" data-conf="${esc(n)}"><h3>${esc(n)}<span class="pill">${groups[n].length}</span></h3><div class="teams" style="padding:var(--s3)">${groups[n].map(card).join('')}</div></div>`).join('')}</div>`; }
  else body = `<div class="teams">${list.map(card).join('')}</div>`;
  view.innerHTML = `<div class="bar"><div><h1>Teams</h1><h2>${isCFB() ? 'FBS · ' + list.length + ' teams by conference' : 'All 32 clubs'}${favs.length ? ' · ★ ' + favs.map(f => esc(idx[f]?.abbreviation || '')).join(', ') : ''}</h2></div></div>${body}`;
  const tq = document.getElementById('tq'); if (tq) tq.oninput = () => { const q = tq.value.toLowerCase(); view.querySelectorAll('.tcard').forEach(c => c.style.display = !q || c.textContent.toLowerCase().includes(q) ? '' : 'none'); view.querySelectorAll('[data-conf]').forEach(p => p.style.display = [...p.querySelectorAll('.tcard')].some(c => c.style.display !== 'none') ? '' : 'none'); };
}

async function team(id, tab = 'schedule') {
  const t = await teamInfo(id);
  const sd = { events: await teamSchedule(id).catch(e => { console.warn(e); return []; }) };
  const stnd = cache.get(`${API2}/standings?season=${SEASON}&level=3`)?.v || null;
  const inj = cache.get(`${API}/injuries`)?.v || null;
  if ((!stnd || !inj) && !team.warmed) { team.warmed = true; Promise.all([standingsL3().catch(() => null), getJSON(`${API}/injuries`, 300000).catch(() => null)]).then(() => { if (location.hash.startsWith(`#team/${id}`)) team(id, tab).catch(() => {}); }); }
  const rec = t.record?.items?.find(r => r.type === 'total') || t.record?.items?.[0];
  const rs = n => rec?.stats?.find(s => s.name === n)?.displayValue ?? '–';
  const games = (sd.events || []).map(ev => {
    const c = ev.competitions[0];
    const me = c.competitors.find(x => x.team.id === String(id)), op = c.competitors.find(x => x.team.id !== String(id));
    const done = c.status?.type?.completed, state = c.status?.type?.state;
    const res = done ? (me.winner ? 'W' : op.winner ? 'L' : 'T') : '';
    return { ev, c, me, op, done, state, res, wk: ev._post ? (ev._wk?.short || 'PO') : ev.week?.number, post: !!ev._post, ms: scoreOf(me), os: scoreOf(op), opTeam: op.team };
  });
  const played = games.filter(g => g.done);
  const pf = played.reduce((n, g) => n + g.ms, 0), pa = played.reduce((n, g) => n + g.os, 0);
  const next = games.find(g => !g.done);
  const form = played.slice(-5).map(g => `<span class="${g.res}" title="${esc(g.op.team.abbreviation)}">${g.res}</span>`).join('');
  const home = played.filter(g => g.me.homeAway === 'home'), away = played.filter(g => g.me.homeAway !== 'home');
  const wl = arr => `${arr.filter(g => g.res === 'W').length}-${arr.filter(g => g.res === 'L').length}`;
  let divHTML = '';
  if (stnd) for (const conf of stnd.children || []) for (const div of conf.children || []) if ((div.standings?.entries || []).some(e => e.team.id === String(id))) {
    const stat = (e, n) => e.stats.find(s => s.name === n)?.displayValue ?? '–';
    divHTML = `<div class="panel"><h3>${esc(div.name)}</h3><div class="tw"><table><thead><tr><th>Team</th>${isCFB() ? '<th class="num">CONF</th>' : ''}<th class="num">W-L</th><th class="num">DIFF</th></tr></thead><tbody>${div.standings.entries.map(e => `<tr class="clk ${e.team.id === String(id) ? 'hl' : ''}" data-t="${esc(e.team.id)}"><td class="tm"><img src="${esc(logo(e.team))}" alt="">${esc(e.team.abbreviation)}</td>${isCFB() ? `<td class="num">${esc(stat(e,'vs. Conf.'))}</td>` : ''}<td class="num">${esc(stat(e,'overall'))}</td><td class="num">${esc(stat(e, isCFB() ? 'pointDifferential' : 'differential'))}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const tInj = (inj?.injuries || []).find(x => x.id === String(id))?.injuries || [];
  const mine = isFav(id);
  view.innerHTML = `<a class="back" href="#teams">← All teams</a>
    <div class="thero" style="--tc:${colorOf(t)}"><img src="${esc(logo(t))}" alt=""><div><h1 style="margin:0">${esc(t.displayName)}</h1><h2>${esc(t.standingSummary || '')}</h2></div>
      <div style="margin-left:auto;text-align:right"><div class="rec">${esc(rec?.summary || '')}</div><button class="chip gold ${mine ? 'on' : ''}" id="favbtn">${mine ? '★ My team' : '☆ Add to my teams'}</button></div></div>
    <div class="panel" style="margin-bottom:14px"><div class="kpis">
      <div class="kpi"><small>Points for</small><b>${pf}</b></div><div class="kpi"><small>Points against</small><b>${pa}</b></div>
      <div class="kpi"><small>Diff</small><b class="${pf - pa >= 0 ? 'pos' : 'neg'}">${sgn(pf - pa)}</b></div><div class="kpi"><small>PPG / PAPG</small><b>${played.length ? (pf / played.length).toFixed(1) + ' / ' + (pa / played.length).toFixed(1) : '–'}</b></div>
      <div class="kpi"><small>Home / Away</small><b>${wl(home)} / ${wl(away)}</b></div><div class="kpi"><small>Streak</small><b>${esc(rs('streak'))}</b></div><div class="kpi"><small>Last 5</small><div class="form">${form || '<span class="muted">–</span>'}</div></div>
    </div></div>
    <div class="tabs">${[['schedule','Schedule'],['stats','Team profile'],['roster','Roster'],['injuries',`Injuries (${tInj.length})`]].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="two"><div class="stack" id="ttab"></div><div class="stack">
      ${next ? `<div class="panel"><h3>${next.state === 'in' ? 'Live now' : 'Next game'}</h3><a class="next" href="#game/${esc(next.ev.id)}"><img src="${esc(logo(next.op.team))}" alt=""><div><b>${next.me.homeAway === 'home' ? 'vs' : '@'} ${esc(next.op.team.displayName)}</b><div class="muted">${next.state === 'in' ? esc(next.c.status?.type?.shortDetail || '') : esc(fmtDate(next.ev.date))}${next.c.broadcasts?.[0]?.names?.length ? ' · ' + esc(next.c.broadcasts[0].names.join('/')) : ''}</div></div></a></div>` : ''}
      ${played.length ? `<div class="panel"><h3>Margin by game</h3><div class="chart">${marginChart(played)}</div></div>` : ''}
      <div id="remsched"></div>
      ${divHTML}
      <div class="panel"><h3>Compare</h3><div class="empty" style="padding:14px"><a class="chip" href="#compare/${esc(id)}">Head-to-head vs any team →</a></div></div>
    </div></div>`;
  const tt = document.getElementById('ttab');
  if (tab === 'schedule') {
    tt.innerHTML = `${played.length >= 2 ? `<div class="panel"><h3>Scoring trend</h3><div class="chart">${lineChart([{ v: played.map(g => g.ms), cls: 'lA', area: true }, { v: played.map(g => g.os), cls: 'lB' }], played.map(g => 'W' + g.wk))}</div><div class="legend"><span><i></i>Points scored</span><span><i class="b"></i>Points allowed</span></div></div>` : ''}
    <div class="panel"><h3>${SEASON} schedule &amp; results</h3><div class="tw"><table><thead><tr><th>Wk</th><th>Opponent</th><th>Result</th><th class="num">Score</th><th>Status</th></tr></thead><tbody>
      ${games.map(g => `<tr class="clk ${g.post ? 'hl' : ''}" data-g="${esc(g.ev.id)}"><td class="num">${esc(g.wk ?? '')}</td><td class="tm" style="justify-content:flex-start"><img src="${esc(logo(g.op.team))}" alt="">${g.me.homeAway === 'home' ? 'vs' : '@'} ${esc(g.op.team.displayName)} <span class="muted">${esc(g.op.records?.[0]?.summary || '')}</span></td>
        <td><span class="res ${g.res}">${g.res}</span></td><td class="num">${g.state === 'pre' ? '' : g.ms + '–' + g.os}</td>
        <td class="muted">${g.done ? 'Final' : g.state === 'in' ? '<span class="dot"></span>Live' : esc(fmtDate(g.ev.date))}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  } else if (tab === 'stats') {
    tt.innerHTML = '<div class="panel"><div class="skel"></div></div>';
    const [st, ldc] = await Promise.all([teamStats(id), fullLeaders().catch(() => null)]);
    const ld = ldc ? { leaders: { categories: ldc } } : null;
    const cell = (label, key) => { const s = st?.[key]; if (!s) return ''; return `<div><small>${label}</small><b>${esc(s.displayValue)}</b> ${rankTag(s.rank)}</div>`; };
    const off = [['Points / game','scoring.totalPointsPerGame'],['Team QBR','passing.QBR'],['4th down %','miscellaneous.fourthDownConvPct'],['Red zone TD %','miscellaneous.redzoneTouchdownPct'],['Possession / game','miscellaneous.possessionTimeSeconds'],['Yards / game','passing.yardsPerGame'],['Pass yds / game','passing.passingYardsPerGame'],['Rush yds / game','rushing.rushingYardsPerGame'],['3rd down %','miscellaneous.thirdDownConvPct'],['Red zone %','miscellaneous.redzoneScoringPct'],['Giveaways','miscellaneous.totalGiveaways'],['Sacks taken','passing.sacks'],['Completion %','passing.completionPct'],['QB rating','passing.QBRating'],['Yds / carry','rushing.yardsPerRushAttempt'],['Yds / reception','receiving.yardsPerReception']];
    const def = [['Sacks','defensive.sacks'],['Opp 3rd down %','miscellaneous.thirdDownConvPctAllowed'],['Pts allowed / game','defensive.pointsAllowedPerGame'],['Takeaways','miscellaneous.totalTakeaways'],['TO differential','miscellaneous.turnOverDifferential'],['Interceptions','defensiveInterceptions.interceptions'],['Tackles for loss','defensive.tacklesForLoss'],['Passes defended','defensive.passesDefended'],['Forced fumbles','defensive.fumblesForced'],['QB hits','defensive.QBHits']];
    const tl = (ld?.leaders?.categories || []).filter(c => ['passingYards','passingTouchdowns','rushingYards','rushingTouchdowns','receivingYards','receivingTouchdowns','receptions','sacks','interceptions','totalTackles'].includes(c.name)).map(c => { const l = c.leaders.find(x => x.team?.id === String(id)); return l ? `<a class="leader" href="#player/${esc(l.athlete.id)}"><span class="rank num">${c.leaders.indexOf(l) + 1}</span><img src="${esc(hsOf(l.athlete))}" alt="" loading="lazy"><div><div class="nm">${esc(l.athlete.displayName)}</div><div class="sub">${esc(c.displayName)} · ${ord(c.leaders.indexOf(l) + 1)} in NFL</div></div><span class="val">${esc(l.displayValue)}</span></a>` : ''; }).join('');
    tt.innerHTML = (st ? `<div class="panel"><h3>Offense<span class="pill">league rank</span></h3><div class="prof">${off.map(x => cell(...x)).join('')}</div></div><div class="panel"><h3>Defense</h3><div class="prof">${def.map(x => cell(...x)).join('')}</div></div>` : '<div class="panel"><div class="empty">Team statistics feed is unavailable right now.</div></div>')
      + (tl ? `<div class="panel"><h3>Team leaders<span class="pill">with NFL rank</span></h3>${tl}</div>` : '');
  } else if (tab === 'roster') {
    const groups = await teamRoster(id);
    tt.innerHTML = groups.map(g => `<div class="panel"><h3>${esc(g.position)}</h3><div class="tw"><table><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Ht</th><th>Wt</th><th class="num">Age</th><th class="num">Exp</th><th>College</th><th>Status</th></tr></thead><tbody>
      ${(g.items || []).sort((a, b) => (a.position?.abbreviation || '').localeCompare(b.position?.abbreviation || '') || Number(a.jersey || 99) - Number(b.jersey || 99)).map(p => `<tr class="clk" data-p="${esc(p.id)}"><td class="num">${esc(p.jersey || '')}</td><td class="tm"><img src="${esc(hsOf(p))}" alt="" style="border-radius:50%" loading="lazy">${esc(p.displayName)}</td><td>${esc(p.position?.abbreviation || '')}</td><td>${esc(p.displayHeight || '')}</td><td>${esc(p.displayWeight || '')}</td><td class="num">${esc(p.age ?? '')}</td><td class="num">${p.experience?.years ? p.experience.years : 'R'}</td><td>${esc(p.college?.name || '')}</td><td>${p.injuries?.[0]?.status ? injTag(p.injuries[0].status) : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`).join('');
  } else {
    tt.innerHTML = tInj.length ? `<div class="panel"><h3>Injury report</h3><div class="plist">${tInj.map(i => `<a href="#player/${esc(i.athlete?.id || (i.athlete?.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || '')}"><img src="${esc(hsOf(i.athlete))}" alt=""><span><b>${esc(i.athlete?.displayName)}</b> <span class="muted">${esc(i.athlete?.position?.abbreviation || '')}</span> ${injTag(i.status)}<br><span class="muted" style="font-size:12px">${esc(i.details?.type || i.type?.description || '')}${i.details?.returnDate ? ' · return ' + esc(fmtDay(i.details.returnDate)) : ''}${i.shortComment ? ' · ' + esc(i.shortComment) : ''}</span></span><span class="muted" style="font-size:12px">${esc(ago(i.date))}</span></a>`).join('')}</div></div>` : '<div class="panel"><div class="empty">No injuries reported.</div></div>';
  }
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', `#team/${id}/${b.dataset.tab}`); team(id, b.dataset.tab); });
  wire();
  if (isCur()) buildModel().then(M => { const el = document.getElementById('remsched'); if (!el) return; const rem = M.remaining.filter(g => g.a === String(id) || g.h === String(id)).sort((x, y) => (x.wk || 0) - (y.wk || 0));
    const rows = rem.map(g => { const home = g.h === String(id); const op = home ? g.a : g.h; const p = home ? M.pWin(g.h, g.a) : 1 - M.pWin(g.h, g.a); return { g, home, op, p }; });
    const xw = rows.reduce((n, r) => n + r.p, 0); const sos = rows.length ? rows.reduce((n, r) => n + M.T[r.op].rating, 0) / rows.length : 0;
    const hist = store.get(LK('oddsHist:' + SEASON), {}); const pts = Object.keys(hist).map(Number).sort((a, b) => a - b).filter(w => hist[w][id] != null);
    el.outerHTML = (rows.length ? `<div class="panel"><h3>Remaining schedule<span class="pill">${xw.toFixed(1)} proj. wins · opp rating ${sgn(sos.toFixed(1))}</span></h3><div class="tw"><table><thead><tr><th>Wk</th><th>Opponent</th><th class="num">Opp rtg</th><th class="num">Win %</th></tr></thead><tbody>${rows.map(r => `<tr class="clk" data-g="${esc(r.g.ev.id)}"><td class="num">${esc(r.g.wk)}</td><td class="tm"><img src="${esc(logo(M.T[r.op].team))}" alt="">${r.home ? 'vs' : '@'} ${esc(M.T[r.op].team.abbreviation)}</td><td class="num ${M.T[r.op].rating > 0 ? 'neg' : 'pos'}">${sgn(M.T[r.op].rating.toFixed(1))}</td><td class="num ${r.p >= .6 ? 'pos' : r.p <= .4 ? 'neg' : ''}"><b>${Math.round(r.p * 100)}%</b></td></tr>`).join('')}</tbody></table></div></div>` : '')
      + (pts.length >= 2 ? `<div class="panel"><h3>Playoff odds over time</h3><div class="chart">${lineChart([{ v: pts.map(w => hist[w][id] * 100), cls: 'lA', area: true }], pts.map(w => 'W' + w))}</div><p class="note" style="padding:0 14px 10px;margin:0">From your visits to the Odds page each week.</p></div>` : '');
    wire(); }).catch(() => {});
  document.getElementById('favbtn').onclick = () => { favs = mine ? favs.filter(f => f !== String(id)) : [...favs, String(id)]; store.set(LK('favTeams'), favs); toast(mine ? 'Removed from my teams' : t.displayName + ' added to my teams'); team(id, tab); ticker(); };
}

/* ---------- compare ---------- */
async function compare(aId, bId) {
  const idx = await teamsIndex();
  const list = Object.values(idx).sort((a, b) => a.displayName.localeCompare(b.displayName));
  aId = aId || favs[0] || list[0].id; bId = bId || list.find(t => t.id !== aId).id;
  const sel = (id, which) => `<select id="${which}" aria-label="Team ${which}">${list.map(t => `<option value="${t.id}" ${t.id === id ? 'selected' : ''}>${esc(t.displayName)}</option>`).join('')}</select>`;
  const stnd = await getJSON(`${API2}/standings?season=${SEASON}`, 300000);
  const entry = id => (stnd.children || []).flatMap(c => c.standings.entries).find(e => e.team.id === String(id));
  const ea = entry(aId), eb = entry(bId);
  const [sa, sb, sta, stb] = await Promise.all([teamSchedule(aId), teamSchedule(bId), teamStats(aId), teamStats(bId)]);
  const summarize = (events, id) => { const g = events.map(ev => { const c = ev.competitions[0]; const me = c.competitors.find(x => x.team.id === String(id)), op = c.competitors.find(x => x.team.id !== String(id)); return { done: c.status?.type?.completed, me, op, ms: scoreOf(me), os: scoreOf(op), res: c.status?.type?.completed ? (me.winner ? 'W' : op.winner ? 'L' : 'T') : '', opId: op.team.id, ev }; }).filter(g => g.done);
    return { g, pf: g.reduce((n, x) => n + x.ms, 0), pa: g.reduce((n, x) => n + x.os, 0), opIds: new Set(g.map(x => x.opId)) }; };
  const A = summarize(sa, aId), B = summarize(sb, bId);
  const sv = (e, n) => e?.stats?.find(s => s.name === n)?.displayValue ?? '–';
  const nv = (e, n) => Number(e?.stats?.find(s => s.name === n)?.value ?? 0);
  const h2h = sa.filter(ev => ev.competitions[0].competitors.some(x => x.team.id === String(bId)));
  const common = [...A.opIds].filter(x => B.opIds.has(x) && x !== String(aId) && x !== String(bId));
  const rowsDef = [
    ['Record', sv(ea,'overall'), sv(eb,'overall'), nv(ea,'winPercent'), nv(eb,'winPercent')],
    ['Points for / game', A.g.length ? (A.pf / A.g.length).toFixed(1) : '–', B.g.length ? (B.pf / B.g.length).toFixed(1) : '–', A.g.length ? A.pf / A.g.length : 0, B.g.length ? B.pf / B.g.length : 0],
    ['Points against / game', A.g.length ? (A.pa / A.g.length).toFixed(1) : '–', B.g.length ? (B.pa / B.g.length).toFixed(1) : '–', A.g.length ? -A.pa / A.g.length : 0, B.g.length ? -B.pa / B.g.length : 0],
    ['Point differential', sgn(A.pf - A.pa), sgn(B.pf - B.pa), A.pf - A.pa, B.pf - B.pa],
    ['Home', sv(ea,'Home'), sv(eb,'Home'), 0, 0], ['Road', sv(ea,'Road'), sv(eb,'Road'), 0, 0],
    ['vs. Division', sv(ea,'vs. Div.'), sv(eb,'vs. Div.'), 0, 0], ['vs. Conference', sv(ea,'vs. Conf.'), sv(eb,'vs. Conf.'), 0, 0],
    ['Streak', sv(ea,'streak'), sv(eb,'streak'), 0, 0], ['Playoff seed', sv(ea,'playoffSeed'), sv(eb,'playoffSeed'), -nv(ea,'playoffSeed'), -nv(eb,'playoffSeed')],
  ];
  if (sta && stb) [['Yards / game','passing.yardsPerGame'],['Pass yds / game','passing.passingYardsPerGame'],['Rush yds / game','rushing.rushingYardsPerGame'],['3rd down %','miscellaneous.thirdDownConvPct'],['Sacks (def)','defensive.sacks'],['Takeaways','miscellaneous.totalTakeaways'],['TO differential','miscellaneous.turnOverDifferential']].forEach(([l, k]) => { const x = sta[k], y = stb[k]; if (x && y) rowsDef.push([l, x.displayValue + (x.rank ? ` (${ord(x.rank)})` : ''), y.displayValue + (y.rank ? ` (${ord(y.rank)})` : ''), num(x.value), num(y.value)]); });
  const ta = idx[aId], tb = idx[bId];
  view.innerHTML = `<div class="bar"><div><h1>Head to head</h1><h2>${SEASON} season comparison</h2></div><div class="row">${sel(aId, 'ca')}<span class="muted">vs</span>${sel(bId, 'cb')}</div></div>
    <div class="panel"><div class="vs" style="background:linear-gradient(90deg,${colorOf(ta)}33,transparent 30%,transparent 70%,${colorOf(tb)}33)"><a class="side" href="#team/${esc(aId)}"><img src="${esc(logo(ta))}" alt=""><b>${esc(ta.displayName)}</b><span class="num">${esc(sv(ea,'overall'))}</span></a><span class="mid">VS</span><a class="side" href="#team/${esc(bId)}"><img src="${esc(logo(tb))}" alt=""><b>${esc(tb.displayName)}</b><span class="num">${esc(sv(eb,'overall'))}</span></a></div>
    <div class="cmp">${rowsDef.map(([l, va, vb, na, nb]) => { const mx = Math.max(Math.abs(na), Math.abs(nb), 1e-9); const aw = na > nb, bw = nb > na; return `<div class="r"><span class="l ${aw ? 'pos' : ''}">${esc(va)}</span><div><div class="lbl">${l}</div>${na || nb ? `<div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${Math.abs(na) / mx * 100}%"></i></span><span class="b"><i class="${bw ? 'w' : ''}" style="width:${Math.abs(nb) / mx * 100}%"></i></span></div>` : ''}</div><span class="rr ${bw ? 'pos' : ''}">${esc(vb)}</span></div>`; }).join('')}</div></div>
    <div class="half" style="margin-top:14px">
      <div class="panel"><h3>Meetings this season</h3>${h2h.length ? h2h.map(ev => { const c = ev.competitions[0], [x, y] = byHome(c); const done = c.status?.type?.completed; return `<a class="game" href="#game/${esc(ev.id)}" style="--ca:${colorOf(x.team)};--cb:${colorOf(y.team)}"><div class="team"><img src="${esc(logo(x.team))}" alt=""><b>${esc(x.team.displayName)}</b></div><div class="score">${done ? scoreOf(x) : ''}</div><div class="team"><img src="${esc(logo(y.team))}" alt=""><b>${esc(y.team.displayName)}</b></div><div class="score">${done ? scoreOf(y) : ''}</div><div class="meta"><span>Week ${esc(ev.week?.number)}</span><span>${done ? 'Final' : esc(fmtDate(ev.date))}</span></div></a>`; }).join('') : '<div class="empty">These teams don\'t meet in the regular season.</div>'}</div>
      <div class="panel"><h3>Common opponents</h3>${common.length ? `<div class="tw"><table><thead><tr><th>Opponent</th><th>${esc(ta.abbreviation)}</th><th>${esc(tb.abbreviation)}</th></tr></thead><tbody>${common.map(o => { const ga = A.g.filter(x => x.opId === o), gb = B.g.filter(x => x.opId === o); const f = arr => arr.map(x => `<span class="res ${x.res}">${x.res}</span> <span class="num muted">${x.ms}-${x.os}</span>`).join(', '); return `<tr><td class="tm"><img src="${esc(logo(idx[o]))}" alt="">${esc(idx[o]?.displayName || o)}</td><td>${f(ga)}</td><td>${f(gb)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No common opponents played yet.</div>'}</div>
    </div>`;
  const go = () => location.hash = `compare/${document.getElementById('ca').value}/${document.getElementById('cb').value}`;
  document.getElementById('ca').onchange = go; document.getElementById('cb').onchange = go;
}

/* ---------- injuries ---------- */
async function injuries(teamId) {
  if (!LEAGUE.injuries) { view.innerHTML = `<div class="bar"><div><h1>Injury report</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">ESPN doesn't publish a league-wide college injury feed. Team pages show availability where ESPN provides it.</div></div>`; return; }
  const [d, idx] = await Promise.all([getJSON(`${API}/injuries`, 300000), teamsIndex()]);
  const all = (d.injuries || []).flatMap(t => (t.injuries || []).map(i => ({ ...i, teamId: t.id, teamName: t.displayName })));
  const order = { 'Out': 0, 'Doubtful': 1, 'Questionable': 2, 'Injured Reserve': 3 };
  view.innerHTML = `<div class="bar"><div><h1>Injury report</h1><h2>${all.length} players listed · ${esc(ago(d.timestamp))}</h2></div><div class="row"><select id="tsel" aria-label="Team"><option value="">All teams</option>${Object.values(idx).sort((a, b) => a.displayName.localeCompare(b.displayName)).map(t => `<option value="${t.id}" ${t.id === teamId ? 'selected' : ''}>${esc(t.displayName)}</option>`).join('')}</select><select id="ssel" aria-label="Status"><option value="">All statuses</option>${['Out','Doubtful','Questionable','Injured Reserve'].map(s => `<option>${s}</option>`).join('')}</select><input id="iq" placeholder="Player" aria-label="Filter"></div></div>
    <div class="panel"><div class="tw"><table><thead><tr><th>Player</th><th>Team</th><th>Status</th><th>Injury</th><th>Return</th><th>Note</th><th>Updated</th></tr></thead><tbody id="ib"></tbody></table></div></div>`;
  const render = () => { const tv = document.getElementById('tsel').value, sv = document.getElementById('ssel').value, q = document.getElementById('iq').value.toLowerCase();
    const rows = all.filter(i => (!tv || i.teamId === tv) && (!sv || i.status === sv) && (!q || i.athlete?.displayName?.toLowerCase().includes(q))).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(b.date) - new Date(a.date));
    document.getElementById('ib').innerHTML = rows.slice(0, 300).map(i => `<tr class="clk" data-p="${esc(i.athlete?.id || (i.athlete?.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || '')}"><td class="tm"><img src="${esc(hsOf(i.athlete))}" alt="" style="border-radius:50%" loading="lazy">${esc(i.athlete?.displayName)} <span class="muted">${esc(i.athlete?.position?.abbreviation || '')}</span></td><td class="tm"><img src="${esc(logo(idx[i.teamId]))}" alt="">${esc(idx[i.teamId]?.abbreviation || i.teamName)}</td><td>${injTag(i.status)}</td><td style="text-align:left">${esc(i.details?.type || i.type?.description || '')}${i.details?.side ? ' (' + esc(i.details.side) + ')' : ''}</td><td>${i.details?.returnDate ? esc(fmtDay(i.details.returnDate)) : '–'}</td><td style="text-align:left;white-space:normal;max-width:360px;font-size:13px" class="muted">${esc(i.shortComment || '')}</td><td class="muted">${esc(ago(i.date))}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No matches.</td></tr>';
    wire(); };
  render(); ['tsel','ssel','iq'].forEach(k => document.getElementById(k).oninput = render);
}

/* ---------- news ---------- */
async function news() {
  const d = await getJSON(`${API}/news?limit=40`, 300000);
  const arts = (d.articles || []).filter(a => a.links?.web?.href);
  view.innerHTML = `<div class="bar"><div><h1>NFL news</h1><h2>Latest from ESPN · opens on espn.com</h2></div><input id="nq" placeholder="Filter headlines or team" aria-label="Filter news"></div><div class="news" id="nl"></div>`;
  const render = () => { const q = document.getElementById('nq').value.toLowerCase();
    document.getElementById('nl').innerHTML = arts.filter(a => !q || (a.headline + ' ' + (a.description || '') + ' ' + (a.categories || []).map(c => c.description || '').join(' ')).toLowerCase().includes(q)).map(a => `<a class="art" href="${esc(a.links.web.href)}" target="_blank" rel="noopener">${a.images?.[0]?.url ? `<img src="${esc(a.images[0].url)}" alt="" loading="lazy">` : ''}<div><small>${esc(a.type || '')}${a.published ? ' · ' + esc(ago(a.published)) : ''}</small><b>${esc(a.headline)}</b><p>${esc(a.description || '')}</p>${a.byline ? `<small>${esc(a.byline)}</small>` : ''}</div></a>`).join('') || '<div class="empty">No stories match.</div>'; };
  render(); document.getElementById('nq').oninput = render;
}

/* ---------- playoff odds (Monte Carlo, computed here) ---------- */
/* shared rating model: team table, ratings, played/remaining games, win probability */
async function buildModel() {
  const [stnd, gamesAll] = await Promise.all([standingsL3(), seasonGames()]); const games = gamesAll.filter(ev => !ev._post);
  const T = {}; (stnd.children || []).forEach(conf => (conf.children || []).forEach(div => (div.standings?.entries || []).forEach(e => { const v = n => Number(e.stats.find(s => s.name === n)?.value ?? 0); T[e.team.id] = { id: e.team.id, team: e.team, conf: conf.abbreviation, div: div.name, w: v('wins'), l: v('losses'), t: v('ties'), pf: v('pointsFor'), pa: v('pointsAgainst') }; })));
  const ids = Object.keys(T); if (!ids.length) throw new Error('Standings unavailable.');
  ids.forEach(id => { const r = T[id], g = r.w + r.l + r.t; const pyth = (r.pf || r.pa) ? Math.pow(r.pf, 2.37) / (Math.pow(r.pf, 2.37) + Math.pow(r.pa, 2.37)) : .5; r.rating = (g ? (r.pf - r.pa) / g : 0) * 0.6 + (pyth - .5) * 24; r.played = g; });
  const played = [], remaining = [];
  games.forEach(ev => { const c = ev.competitions[0], [a, h] = byHome(c); if (!T[a.team.id] || !T[h.team.id]) return; if (c.status?.type?.completed) played.push({ a: a.team.id, h: h.team.id, as: scoreOf(a), hs: scoreOf(h), ev }); else remaining.push({ a: a.team.id, h: h.team.id, wk: ev.week?.number, ev }); });
  const shrink = Math.min(1, (ids.reduce((n, id) => n + T[id].played, 0) / ids.length) / 8);
  ids.forEach(id => T[id].rating *= shrink);
  const pWin = (home, away) => 1 / (1 + Math.exp(-((T[home].rating - T[away].rating) + 2.2) / 7.5));
  return { T, ids, played, remaining, pWin, games: gamesAll, stnd };
}
async function odds() {
  if (!LEAGUE.odds) { view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">Playoff odds are simulated for the NFL only. For college football, see the <a class="lnk" href="#playoffs">rankings and projected CFP bracket</a>.</div></div>`; return; }
  view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>Simulating the rest of the season…</h2></div></div><div class="prog" id="op"><i style="width:0"></i></div>`;
  const idx = await teamsIndex();
  if (!isCur()) { view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>${SEASON} season</h2></div></div><div class="panel"><div class="empty">Odds are simulated for the current season only. The ${SEASON} playoffs are history: see the <a class="lnk" href="#playoffs">playoff picture</a> for results.</div></div>`; return; }
  const { T, ids, played, remaining, pWin } = await buildModel();
  const N = 5000; const out = {}; ids.forEach(id => out[id] = { playoff: 0, div: 0, bye: 0, top: 0, wins: 0 });
  const h2hBase = {}; played.forEach(g => { const k = g.a + '|' + g.h; (h2hBase[k] ||= [0, 0]); if (g.as > g.hs) h2hBase[k][0]++; else if (g.hs > g.as) h2hBase[k][1]++; });
  const divs = {}; ids.forEach(id => (divs[T[id].conf + '/' + T[id].div] ||= []).push(id));
  const confs = {}; ids.forEach(id => (confs[T[id].conf] ||= []).push(id));
  const run = (from, to) => { for (let n = from; n < to; n++) {
    const W = {}, PD = {}, H = {}; ids.forEach(id => { W[id] = T[id].w + T[id].t / 2; PD[id] = T[id].pf - T[id].pa; });
    Object.entries(h2hBase).forEach(([k, v]) => H[k] = [...v]);
    remaining.forEach(g => { const ph = pWin(g.h, g.a); const k = g.a + '|' + g.h; (H[k] ||= [0, 0]); if (Math.random() < ph) { W[g.h]++; PD[g.h] += 7; PD[g.a] -= 7; H[k][1]++; } else { W[g.a]++; PD[g.a] += 7; PD[g.h] -= 7; H[k][0]++; } });
    const cmp = (x, y) => { if (W[y] !== W[x]) return W[y] - W[x]; const k1 = H[x + '|' + y] || [0, 0], k2 = H[y + '|' + x] || [0, 0]; const xw = k1[0] + k2[1], yw = k1[1] + k2[0]; if (xw !== yw) return yw - xw; return (PD[y] - PD[x]) || (Math.random() - .5); };
    Object.values(confs).forEach(cids => { const winners = Object.entries(divs).filter(([k]) => k.startsWith(T[cids[0]].conf + '/')).map(([, m]) => [...m].sort(cmp)[0]).sort(cmp);
      const wc = cids.filter(id => !winners.includes(id)).sort(cmp).slice(0, 3); const inP = [...winners, ...wc];
      inP.forEach(id => out[id].playoff++); winners.forEach(id => out[id].div++); out[winners[0]].bye++; });
    ids.forEach(id => out[id].wins += W[id]);
  } };
  for (let i = 0; i < N; i += 500) { run(i, i + 500); const b = document.querySelector('#op i'); if (b) b.style.width = ((i + 500) / N * 100) + '%'; await new Promise(r => setTimeout(r, 0)); }
  const rows = ids.map(id => ({ ...T[id], p: out[id].playoff / N, d: out[id].div / N, b: out[id].bye / N, xw: out[id].wins / N }));
  try { const wkNow = (cache.get(SB_URL())?.v?.week?.number) || 0; const hist = store.get(LK('oddsHist:' + SEASON), {}); hist[wkNow] = Object.fromEntries(rows.map(r => [r.id, Math.round(r.p * 1000) / 1000])); store.set(LK('oddsHist:' + SEASON), hist); } catch {}
  const pct = v => v >= .995 ? '>99%' : v <= .005 ? '<1%' : Math.round(v * 100) + '%';
  const cls = v => v >= .75 ? 'pos' : v <= .15 ? 'neg' : '';
  const confHTML = conf => { const r = rows.filter(x => x.conf === conf).sort((x, y) => y.p - x.p || y.d - x.d);
    return `<div class="panel"><h3>${esc(conf)}<span class="pill">${remaining.filter(g => T[g.h].conf === conf).length} games left</span></h3><div class="tw"><table><thead><tr><th>Team</th><th>Division</th><th class="num">Record</th><th class="num">Proj. wins</th><th class="num">Playoffs</th><th class="num">Win div</th><th class="num">#1 seed</th><th>Chance</th></tr></thead><tbody>
      ${r.map(x => `<tr class="clk ${isFav(x.id) ? 'fav' : ''}" data-t="${esc(x.id)}"><td class="tm"><img src="${esc(logo(x.team))}" alt="">${esc(x.team.displayName)}</td><td class="muted">${esc(x.div.replace(/^(AFC|NFC) /, ''))}</td><td class="num">${x.w}-${x.l}${x.t ? '-' + x.t : ''}</td><td class="num">${x.xw.toFixed(1)}</td><td class="num ${cls(x.p)}"><b>${pct(x.p)}</b></td><td class="num ${cls(x.d)}">${pct(x.d)}</td><td class="num">${pct(x.b)}</td><td><div class="obar"><i style="width:${x.p * 100}%"></i></div></td></tr>`).join('')}
    </tbody></table></div></div>`; };
  view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>${N.toLocaleString()} simulations of the remaining ${remaining.length} games · computed on this page</h2></div><a class="chip" href="#playoffs">Current picture →</a></div>
    <div class="stack">${Object.keys(confs).map(confHTML).join('')}</div>
    <p class="note">Each simulation plays every remaining game using the Power Index rating gap plus home-field advantage, then seeds the conferences (division winners, then three wild cards; ties broken by head-to-head, then point differential). Ratings are shrunk toward average early in the season. This is an estimate for fun, not ESPN's FPI.</p>`;
  wire();
}

/* ---------- fantasy ---------- */
const FSCORE = { std: { passYd: .04, passTd: 4, int: -2, rushYd: .1, rushTd: 6, rec: 0, recYd: .1, recTd: 6, fumL: -2, fg: 3, xp: 1 }, half: null, ppr: null };
FSCORE.half = { ...FSCORE.std, rec: .5 }; FSCORE.ppr = { ...FSCORE.std, rec: 1 };
function fantasyFromBox(summary) {
  const out = {}; const get = (c, p, lbl) => { const i = c.labels.indexOf(lbl); return i < 0 ? 0 : num(p.stats[i]); };
  (summary.boxscore?.players || []).forEach(side => side.statistics.forEach(c => c.athletes.forEach(p => {
    const r = (out[p.athlete.id] ||= { id: p.athlete.id, name: p.athlete.displayName, hs: hsOf(p.athlete), pos: p.athlete.position?.abbreviation || '', team: side.team.abbreviation, tid: side.team.id, passYd: 0, passTd: 0, int: 0, rushYd: 0, rushTd: 0, rec: 0, recYd: 0, recTd: 0, fumL: 0, fg: 0, xp: 0 });
    if (c.name === 'passing') { r.passYd += get(c, p, 'YDS'); r.passTd += get(c, p, 'TD'); r.int += get(c, p, 'INT'); }
    if (c.name === 'rushing') { r.rushYd += get(c, p, 'YDS'); r.rushTd += get(c, p, 'TD'); }
    if (c.name === 'receiving') { r.rec += get(c, p, 'REC'); r.recYd += get(c, p, 'YDS'); r.recTd += get(c, p, 'TD'); }
    if (c.name === 'fumbles') r.fumL += get(c, p, 'LOST');
    if (c.name === 'kicking') { r.fg += get(c, p, 'FG') ? num(String(p.stats[c.labels.indexOf('FG')]).split('/')[0]) : 0; r.xp += get(c, p, 'XP') ? num(String(p.stats[c.labels.indexOf('XP')]).split('/')[0]) : 0; }
  }))); return out;
}
const fpts = (r, sc) => r.passYd * sc.passYd + r.passTd * sc.passTd + r.int * sc.int + r.rushYd * sc.rushYd + r.rushTd * sc.rushTd + r.rec * sc.rec + r.recYd * sc.recYd + r.recTd * sc.recTd + r.fumL * sc.fumL + r.fg * sc.fg + r.xp * sc.xp;
async function fantasy(scope = 'week', wk) {
  if (!LEAGUE.fantasy) { view.innerHTML = `<div class="bar"><div><h1>Fantasy</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">Fantasy scoring is set up for the NFL. Switch to NFL from the header to use it.</div></div>`; return; }
  const calF = await seasonCalendar(); const cw = isCur() ? Math.min(calF.cur || 1, calF.reg.length) : calF.reg.length;
  const w = Number(wk) || cw; const fmt = store.get('fformat', 'half');
  view.innerHTML = `<div class="bar"><div><h1>Fantasy</h1><h2>Loading box scores…</h2></div></div><div class="prog" id="fp"><i style="width:0"></i></div>`;
  const all = (await seasonGames()).filter(e => !e._post); const weeks = scope === 'season' ? [...new Set(all.map(e => e.week?.number).filter(Boolean))].filter(n => n <= cw) : [w];
  const evs = all.filter(e => weeks.includes(e.week?.number) && e.status?.type?.state !== 'pre');
  const totals = {}; let done = 0;
  await Promise.all(evs.map(async ev => { try { let f = ev.status.type.completed ? store.get(LK('fbox:' + ev.id), null) : null;
      if (!f) { const sum = await getJSON(`${API}/summary?event=${ev.id}`, ev.status.type.completed ? 86400000 : 60000); f = fantasyFromBox(sum); if (ev.status.type.completed) store.set(LK('fbox:' + ev.id), f); }
    Object.values(f).forEach(r => { const t = (totals[r.id] ||= { ...r, games: 0, passYd: 0, passTd: 0, int: 0, rushYd: 0, rushTd: 0, rec: 0, recYd: 0, recTd: 0, fumL: 0, fg: 0, xp: 0 }); ['passYd','passTd','int','rushYd','rushTd','rec','recYd','recTd','fumL','fg','xp'].forEach(k => t[k] += r[k]); t.games++; t.team = r.team; }); } catch {} done++; const b = document.querySelector('#fp i'); if (b) b.style.width = done / evs.length * 100 + '%'; }));
  const sc = FSCORE[fmt]; const rows = Object.values(totals).map(r => ({ ...r, pts: fpts(r, sc) })).filter(r => r.pts !== 0 || r.games);
  const posOf = r => r.pos || (r.passYd > 50 ? 'QB' : r.fg || r.xp ? 'K' : r.rec > r.rushYd / 10 ? 'WR' : 'RB');
  rows.forEach(r => r.posx = posOf(r));
  let posF = store.get('fpos', '');
  view.innerHTML = `<div class="bar"><div><h1>Fantasy</h1><h2>${scope === 'season' ? SEASON + ' season to date' : 'Week ' + w} · ${fmt === 'ppr' ? 'Full PPR' : fmt === 'half' ? 'Half PPR' : 'Standard'}</h2></div>
    <div class="row"><div class="chips"><a class="chip ${scope === 'week' ? 'on' : ''}" href="#fantasy/week/${w}">Week</a><a class="chip ${scope === 'season' ? 'on' : ''}" href="#fantasy/season">Season</a></div>
      ${scope === 'week' ? `<select id="fw" aria-label="Week">${Array.from({ length: cw }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select>` : ''}
      <select id="ff" aria-label="Scoring"><option value="std" ${fmt === 'std' ? 'selected' : ''}>Standard</option><option value="half" ${fmt === 'half' ? 'selected' : ''}>Half PPR</option><option value="ppr" ${fmt === 'ppr' ? 'selected' : ''}>Full PPR</option></select></div></div>
    <div class="panel"><div class="lfilters"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em">Position</span>${['','QB','RB','WR','TE','K'].map(p => `<button class="chip ${p === posF ? 'on' : ''}" data-fpos="${p}">${p || 'All'}</button>`).join('')}<input id="fq" placeholder="Player or team" style="margin-left:auto;padding:5px 8px;font-size:13px"></div>
      <div class="tw"><table id="ft"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th class="num sort" data-k="pts">PTS</th>${scope === 'season' ? '<th class="num sort" data-k="ppg">PPG</th><th class="num sort" data-k="games">G</th>' : ''}<th class="num sort" data-k="passYd">Pass</th><th class="num sort" data-k="passTd">PaTD</th><th class="num sort" data-k="int">INT</th><th class="num sort" data-k="rushYd">Rush</th><th class="num sort" data-k="rushTd">RuTD</th><th class="num sort" data-k="rec">Rec</th><th class="num sort" data-k="recYd">RecYd</th><th class="num sort" data-k="recTd">ReTD</th><th class="num sort" data-k="fumL">FL</th></tr></thead><tbody></tbody></table></div></div>
    <p class="note">Scoring: 1 pt per 25 passing yds, 4 per passing TD, -2 INT, 1 per 10 rushing/receiving yds, 6 per TD, -2 fumble lost, 3 per FG, 1 per XP, plus ${sc.rec} per reception. Built from ESPN box scores for each game.</p>`;
  const table = document.getElementById('ft'); let q = '';
  const filt = () => rows.filter(r => (!posF || r.posx === posF) && (!q || (r.name + ' ' + r.team).toLowerCase().includes(q)));
  const draw = () => sortable(table, filt().slice(0, 400), { pts: r => r.pts, ppg: r => r.games ? r.pts / r.games : 0, games: r => r.games, passYd: r => r.passYd, passTd: r => r.passTd, int: r => r.int, rushYd: r => r.rushYd, rushTd: r => r.rushTd, rec: r => r.rec, recYd: r => r.recYd, recTd: r => r.recTd, fumL: r => r.fumL },
    (r, i) => `<tr class="clk ${isFav(r.tid) ? 'fav' : ''}" data-p="${esc(r.id)}"><td class="num muted">${i + 1}</td><td class="tm"><img src="${esc(r.hs)}" alt="" style="border-radius:50%" loading="lazy">${esc(r.name)} <span class="muted">${esc(r.team)}</span></td><td>${esc(r.posx)}</td><td class="num"><b>${r.pts.toFixed(1)}</b></td>${scope === 'season' ? `<td class="num">${(r.pts / Math.max(r.games, 1)).toFixed(1)}</td><td class="num">${r.games}</td>` : ''}<td class="num">${r.passYd}</td><td class="num">${r.passTd}</td><td class="num">${r.int}</td><td class="num">${r.rushYd}</td><td class="num">${r.rushTd}</td><td class="num">${r.rec}</td><td class="num">${r.recYd}</td><td class="num">${r.recTd}</td><td class="num">${r.fumL}</td></tr>`, 'pts');
  table.addEventListener('drawn', wire); draw();
  document.getElementById('fq').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  view.querySelectorAll('[data-fpos]').forEach(b => b.onclick = () => { posF = b.dataset.fpos; store.set('fpos', posF); view.querySelectorAll('[data-fpos]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  document.getElementById('ff').onchange = e => { store.set('fformat', e.target.value); fantasy(scope, w); };
  const fw = document.getElementById('fw'); if (fw) fw.onchange = e => location.hash = `fantasy/week/${e.target.value}`;
}

/* ESPN leaves career QBR blank (it's play-by-play based). Estimate it as a games-weighted average of season QBRs. */
function fillQBR(cat) {
  if (!cat?.labels || !cat.totals) return cat;
  const qi = cat.labels.indexOf('QBR'), gi = cat.labels.indexOf('GP');
  if (qi < 0 || cat.totals[qi] !== '-' && cat.totals[qi] !== '' && cat.totals[qi] != null) return cat;
  let w = 0, sum = 0; cat.statistics.forEach(r => { const q = num(r.stats[qi]), g = gi >= 0 ? num(r.stats[gi]) : 1; if (r.stats[qi] !== '-' && q > 0 && g > 0) { sum += q * g; w += g; } });
  if (!w) return cat;
  const totals = [...cat.totals]; totals[qi] = (sum / w).toFixed(1);
  return { ...cat, totals, qbrEstimated: true, qbrSeasons: cat.statistics.filter(r => r.stats[qi] !== '-' && num(r.stats[qi]) > 0).length };
}
const qbrNote = parts => `<p class="note" style="padding:0 16px 12px;margin:0">≈ Career QBR is a games-weighted average of season QBRs${parts.length ? ' (' + parts.map(esc).join('; ') + ')' : ''}. ESPN doesn't publish a true career QBR because it is built from play-by-play data.</p>`;
/* ---------- player comparison (any player, any season) ---------- */
// ESPN's search finds retired and past-season players that current rosters don't have
async function searchAthletes(q, limit = 10) {
  const list = rosterIndex || (isCFB() ? [] : await allRosters().catch(() => []));
  const local = list.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6).map(p => ({ id: p.id, name: p.name, sub: `${p.pos} · ${p.team.abbreviation}`, hs: p.hs }));
  let remote = [];
  try { const d = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=12`, 600000);
    remote = (d.results || []).flatMap(r => r.contents || []).filter(c => new RegExp('^s:20~l:' + LEAGUE.uidLeague + '~a:\\d+').test(c.uid || '')).map(c => ({ id: c.uid.match(/a:(\d+)/)[1], name: c.displayName, sub: c.subtitle || c.description || LEAGUE.name, hs: c.image?.default || '' })); } catch {}
  const seen = new Set(); return [...local, ...remote].filter(x => !seen.has(x.id) && seen.add(x.id)).slice(0, limit);
}
function parseSide(v) { const [id, yr] = String(v || '').split('-'); return { id: id || '', yr: Number(yr) || SEASON }; }
async function pcompare(aV, bV, mode = 'season') {
  const A0 = parseSide(aV), B0 = parseSide(bV);
  const load = async ({ id, yr }) => { if (!id) return null;
    const [bio, gl, career] = await Promise.all([getJSON(`${WEB}/athletes/${id}`, 600000), getJSON(`${WEB}/athletes/${id}/gamelog?season=${yr}`, 600000).catch(() => null), getJSON(`${WEB}/athletes/${id}/stats`, 3600000).catch(() => null)]);
    const rows = gl?.events ? gl.seasonTypes.filter(st => /regular/i.test(st.displayName || '') || gl.seasonTypes.length === 1).flatMap(st => (st.categories || []).flatMap(c => (c.events || []).map(e => ({ ...gl.events[e.eventId], stats: e.stats })))).sort((x, y) => (x.week ?? 0) - (y.week ?? 0)) : [];
    const seasons = (gl?.filters || []).find(f => /season/i.test(f.displayName || f.name || ''))?.options?.map(o => Number(o.value)).filter(Boolean) || [yr];
    const reg = gl?.seasonTypes?.find(st => /regular/i.test(st.displayName || '')) || gl?.seasonTypes?.[0];
    return { id, yr, p: bio.athlete, gl, rows, totals: reg?.categories?.[0]?.totals || [], seasons: [...new Set(seasons)].sort((x, y) => y - x), career: (career?.categories || []).map(fillQBR) }; };
  const [A, B] = await Promise.all([load(A0), load(B0)]); const cur0 = { a: A ? { id: A.id, yr: A.yr } : A0, b: B ? { id: B.id, yr: B.yr } : B0 };
  const key = (x, y, m = mode) => `pcompare/${x.id ? x.id + '-' + x.yr : ''}/${y.id ? y.id + '-' + y.yr : ''}${m === 'career' ? '/career' : ''}`;
  const seasonSel = (X, which) => X && mode !== 'career' ? `<select class="ssel" data-side="${which}" aria-label="Season">${X.seasons.map(y => `<option value="${y}" ${y === X.yr ? 'selected' : ''}>${y}</option>`).join('')}</select>` : '';
  const card = (X, which) => X ? `<div class="pcard" style="--tc:${colorOf(X.p.team)}"><img src="${esc(hsOf(X.p))}" alt=""><div><b><a href="#player/${esc(X.id)}">${esc(X.p.displayName)}</a></b><small>${esc(X.p.position?.abbreviation || '')} · ${esc(X.p.team?.abbreviation || 'Retired')}${X.p.displayDraft ? ' · ' + esc(X.p.displayDraft.split(':')[0]) + ' draft' : ''}</small><div class="row" style="margin-top:6px">${seasonSel(X, which)}<span class="muted" style="font-size:12px">${mode === 'career' ? 'career' : X.rows.length + ' games'}</span></div></div></div>` : '<div class="pcard empty">Pick a player</div>';
  let body = '';
  if (A && B) {
    const same = A.gl?.labels?.join() === B.gl?.labels?.join();
    const labels = A.gl?.labels || [], names = A.gl?.names || [];
    const rowsCmp = labels.map((l, i) => { const va = num(A.totals[i]), vb = num(same ? B.totals[i] : NaN); const lower = /INT|SACK|FUM/i.test(l); const aw = lower ? va < vb : va > vb, bw = lower ? vb < va : vb > va; const mx = Math.max(Math.abs(va), Math.abs(vb || 0), 1e-9);
      return `<div class="r"><span class="l ${aw ? 'pos' : ''}">${esc(A.totals[i] ?? '–')}</span><div><div class="lbl">${esc(A.gl.displayNames?.[i] || l)}</div><div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${Math.abs(va) / mx * 100}%"></i></span><span class="b"><i class="${bw ? 'w' : ''}" style="width:${same ? Math.abs(vb) / mx * 100 : 0}%"></i></span></div></div><span class="rr ${bw ? 'pos' : ''}">${esc(same ? (B.totals[i] ?? '–') : '–')}</span></div>`; }).join('');
    const ki = Math.max(0, names.findIndex(n => /yards|tackles|sacks|interceptions|fieldGoalsMade/i.test(n) && !/perGame|avg|long/i.test(n)));
    const perG = (X, i) => X.rows.length ? (X.rows.reduce((n, r) => n + num(r.stats?.[i]), 0) / X.rows.length).toFixed(1) : '–';
    const n = Math.max(A.rows.length, B.rows.length);
    const ser = X => Array.from({ length: n }, (_, j) => X.rows[j] ? num(X.rows[j].stats?.[ki]) : null);
    const cum = X => { let t = 0; return Array.from({ length: n }, (_, j) => X.rows[j] ? (t += num(X.rows[j].stats?.[ki])) : null); };
    const lblA = `${esc(A.p.displayName.split(' ').pop())} ${A.yr}`, lblB = `${esc(B.p.displayName.split(' ').pop())} ${B.yr}`;
    body = `<div class="two"><div class="stack">
      <div class="panel"><h3>Season totals <span class="pill">${A.yr} vs ${B.yr}${same ? '' : ' · different positions, showing ' + esc(A.p.displayName) + "'s columns"}</span></h3><div class="cmp">${rowsCmp}</div></div>
      ${same ? `<div class="panel"><h3>Per game</h3><div class="tw"><table><thead><tr><th>Player</th><th class="num">G</th>${labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${[A, B].map(X => `<tr><td>${esc(X.p.displayName)} <span class="muted">${X.yr}</span></td><td class="num">${X.rows.length}</td>${labels.map((l, i) => `<td class="num">${perG(X, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
      </div><div class="stack">
      ${same && n > 1 ? `<div class="panel"><h3>${esc(A.gl.displayNames?.[ki] || labels[ki])} · cumulative by game</h3><div class="chart">${lineChart([{ v: cum(A), cls: 'lA', area: true }, { v: cum(B), cls: 'lB' }], Array.from({ length: n }, (_, j) => 'G' + (j + 1)))}</div><div class="legend"><span><i></i>${lblA}</span><span><i class="b"></i>${lblB}</span></div></div>
      <div class="panel"><h3>${esc(A.gl.displayNames?.[ki] || labels[ki])} · per game</h3><div class="chart">${lineChart([{ v: ser(A), cls: 'lA' }, { v: ser(B), cls: 'lB' }], Array.from({ length: n }, (_, j) => 'G' + (j + 1)))}</div><div class="legend"><span><i></i>${lblA}</span><span><i class="b"></i>${lblB}</span></div></div>` : ''}
      <div class="panel"><h3>Bio</h3><div class="tw"><table><thead><tr><th></th><th>${esc(A.p.displayName)}</th><th>${esc(B.p.displayName)}</th></tr></thead><tbody>${[['Age now','age'],['Height','displayHeight'],['Weight','displayWeight'],['College',x => x.college?.name],['Draft','displayDraft'],['Experience',x => x.experience?.years ?? x.displayExperience],['Status',x => x.status?.name]].map(([l, k]) => `<tr><td class="muted">${l}</td><td>${esc(typeof k === 'function' ? k(A.p) : A.p[k] ?? '–')}</td><td>${esc(typeof k === 'function' ? k(B.p) : B.p[k] ?? '–')}</td></tr>`).join('')}</tbody></table></div></div>
      </div></div>`;
  }
  if (A && B && mode === 'career') {
    // career: match categories by name; primary = the first player's main category
    const catA = A.career, catB = B.career; const names = [...new Set([...catA.map(c => c.name), ...catB.map(c => c.name)])];
    const lower = l => /INT|SACK|FUM|LOST/i.test(l);
    const gpIdx = c => (c?.labels || []).indexOf('GP');
    // per-game / per-season view: counting stats are divided, rate stats (%, averages, ratings, longs) are left alone
    const cview = store.get('careerView', 'total');
    const isRate = l => /%|AVG|RTG|QBR|LNG|PCT|Y\/|\/G|YPC|YPR|^GP$|^GS$/i.test(l);
    const seasonsOf = X => new Set(X.career.flatMap(c => c.statistics.map(r => r.season.year))).size;
    const gamesOf = (X, c) => { const i = gpIdx(c); return i >= 0 ? num(c.totals?.[i]) : (X.career[0] && gpIdx(X.career[0]) >= 0 ? num(X.career[0].totals[gpIdx(X.career[0])]) : 0); };
    const adj = (X, c, l, raw) => { if (cview === 'total' || isRate(l) || raw == null || raw === '-') return { v: num(raw), d: raw ?? '–' }; const den = cview === 'game' ? gamesOf(X, c) : seasonsOf(X); if (!den) return { v: num(raw), d: raw }; const v = num(raw) / den; return { v, d: v >= 100 ? v.toFixed(0) : v.toFixed(1) }; };
    const yearsA = new Set(catA.flatMap(c => c.statistics.map(r => r.season.year))), yearsB = new Set(catB.flatMap(c => c.statistics.map(r => r.season.year)));
    const summary = X => { const yrs = X === A ? yearsA : yearsB; const main = X.career[0]; const gp = main ? num(main.totals?.[gpIdx(main)]) : 0; return `<div class="kpi"><small>Seasons</small><b>${yrs.size}</b></div><div class="kpi"><small>Years</small><b style="font-size:18px">${yrs.size ? Math.min(...yrs) + '–' + Math.max(...yrs) : '–'}</b></div><div class="kpi"><small>Games</small><b>${gp || '–'}</b></div>`; };
    const totalsCmp = names.map(n => { const ca = catA.find(c => c.name === n), cb = catB.find(c => c.name === n); const ref = ca || cb; if (!ref?.totals) return '';
      const title = cview === 'game' ? 'per game' : cview === 'season' ? 'per season' : 'career totals';
      return `<div class="panel"><h3>${esc(ref.displayName)} · ${title}<span class="pill">${ca && cb ? 'both' : ca ? 'only ' + esc(A.p.displayName.split(' ').pop()) : 'only ' + esc(B.p.displayName.split(' ').pop())}</span></h3><div class="cmp">${ref.labels.map((l, i) => { const xa = ca ? adj(A, ca, l, ca.totals[i]) : null, xb = cb ? adj(B, cb, l, cb.totals[i]) : null; const va = xa ? xa.v : NaN, vb = xb ? xb.v : NaN; const lo = lower(l); const aw = ca && cb && (lo ? va < vb : va > vb), bw = ca && cb && (lo ? vb < va : vb > va); const mx = Math.max(Math.abs(va || 0), Math.abs(vb || 0), 1e-9);
        const est = l === 'QBR' && ((ca?.qbrEstimated) || (cb?.qbrEstimated));
        return `<div class="r"><span class="l ${aw ? 'pos' : ''}">${ca?.qbrEstimated && l === 'QBR' ? '≈' : ''}${esc(xa ? xa.d : '–')}</span><div><div class="lbl">${esc(ref.displayNames?.[i] || l)}${est ? ' <span style="opacity:.6" title="Games-weighted average of season QBRs; ESPN does not publish a true career QBR">est.</span>' : ''}${cview !== 'total' && !isRate(l) ? ' <span style="opacity:.6">/' + (cview === 'game' ? 'G' : 'yr') + '</span>' : ''}</div><div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${ca ? Math.abs(va) / mx * 100 : 0}%"></i></span><span class="b"><i class="${bw ? 'w' : ''}" style="width:${cb ? Math.abs(vb) / mx * 100 : 0}%"></i></span></div></div><span class="rr ${bw ? 'pos' : ''}">${cb?.qbrEstimated && l === 'QBR' ? '≈' : ''}${esc(xb ? xb.d : '–')}</span></div>`; }).join('')}</div>${(ca?.qbrEstimated || cb?.qbrEstimated) ? qbrNote([ca, cb].filter(c => c?.qbrEstimated && c.qbrSeasons < c.statistics.length).map(c => (c === ca ? A : B).p.displayName.split(' ').pop() + ': ' + c.qbrSeasons + ' of ' + c.statistics.length + ' seasons have QBR; it begins in 2006')) : ''}</div>`; }).join('');
    // season-by-season table for the main category + cumulative chart on the key stat (season N of career)
    const main = catA[0]; const mb = catB.find(c => c.name === main?.name);
    let bySeason = '', chart = '';
    if (main && mb) { const ki = Math.max(0, main.names.findIndex(n => /yards|tackles|sacks|interceptions|fieldGoalsMade|receptions/i.test(n) && !/perGame|avg|long/i.test(n)));
      const sa = [...main.statistics].sort((x, y) => x.season.year - y.season.year), sb = [...mb.statistics].sort((x, y) => x.season.year - y.season.year); const n = Math.max(sa.length, sb.length);
      const cum = arr => { let t = 0; return Array.from({ length: n }, (_, j) => arr[j] ? (t += num(arr[j].stats[ki])) : null); };
      const per = arr => Array.from({ length: n }, (_, j) => arr[j] ? num(arr[j].stats[ki]) : null);
      const lab = main.displayNames?.[ki] || main.labels[ki];
      chart = `<div class="panel"><h3>${esc(lab)} · cumulative by career season</h3><div class="chart">${lineChart([{ v: cum(sa), cls: 'lA', area: true }, { v: cum(sb), cls: 'lB' }], Array.from({ length: n }, (_, j) => 'Yr ' + (j + 1)))}</div><div class="legend"><span><i></i>${esc(A.p.displayName)}</span><span><i class="b"></i>${esc(B.p.displayName)}</span></div></div>
        <div class="panel"><h3>${esc(lab)} · per season</h3><div class="chart">${lineChart([{ v: per(sa), cls: 'lA' }, { v: per(sb), cls: 'lB' }], Array.from({ length: n }, (_, j) => 'Yr ' + (j + 1)))}</div><div class="legend"><span><i></i>${esc(A.p.displayName)}</span><span><i class="b"></i>${esc(B.p.displayName)}</span></div></div>`;
      // best seasons side by side
      const best = (arr, X) => [...arr].sort((x, y) => num(y.stats[ki]) - num(x.stats[ki])).slice(0, 3).map(r => `<a class="leader" style="grid-template-columns:1fr auto;padding:6px 16px" href="#pcompare/${esc(X.id)}-${r.season.year}/${esc(X === A ? (B.id + '-' + B.yr) : (A.id + '-' + A.yr))}"><div><div class="nm">${r.season.year} <span class="muted" style="font-weight:400">${esc(r.teamSlug?.replace(/-/g, ' ') || '')}</span></div></div><span class="val" style="font-size:18px">${esc(r.stats[ki])}</span></a>`).join('');
      bySeason = `<div class="half"><div class="panel"><h3>${esc(A.p.displayName)} · best seasons (${esc(main.labels[ki])})</h3>${best(sa, A)}</div><div class="panel"><h3>${esc(B.p.displayName)} · best seasons (${esc(main.labels[ki])})</h3>${best(sb, B)}</div></div>
        <div class="panel"><h3>${esc(main.displayName)} · season by season</h3><div class="tw"><table><thead><tr><th>Player</th><th>Season</th><th>Team</th>${main.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${[[A, sa], [B, sb]].map(([X, arr]) => arr.map((r, j) => `<tr ${j === 0 ? 'class="hl"' : ''}><td>${j === 0 ? esc(X.p.displayName) : ''}</td><td class="num">${r.season.year}</td><td class="muted">${esc(r.teamSlug?.split('-').pop() || '')}</td>${r.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div></div>`; }
    body = `<div class="panel" style="margin-bottom:var(--s4)"><div class="kpis">${summary(A)}${summary(B)}</div></div>
      <div class="row" style="margin-bottom:var(--s4)"><span class="muted" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">Show</span><div class="chips">${[['total','Career totals'],['game','Per game'],['season','Per season']].map(([k, l]) => `<button class="chip ${cview === k ? 'on' : ''}" data-cview="${k}">${l}</button>`).join('')}</div><span class="muted" style="font-size:12px">Rate stats (percentages, averages, ratings, longs) are never divided.</span></div>
      <div class="two"><div class="stack">${totalsCmp || '<div class="panel"><div class="empty">Career stats unavailable for one of these players.</div></div>'}${bySeason}</div><div class="stack">${chart}</div></div>`;
  }
  if (!(A && B)) body = '<div class="panel"><div class="empty">Choose two players above. Search finds anyone in ESPN\'s database, including retired players; then pick each player\'s season.</div></div>';
  const pick = which => `<div class="search ppick" style="margin:0;flex:1 1 240px"><input id="pp${which}" placeholder="${which === 'a' ? 'First' : 'Second'} player (e.g. Tom Brady)" aria-label="Player ${which}" autocomplete="off"><div class="dd" id="pp${which}dd" hidden></div></div>`;
  view.innerHTML = `<div class="bar"><div><h1>Player comparison</h1><h2>${mode === 'career' ? 'Full careers · regular season' : 'Any two players, any seasons · regular-season game logs'}</h2></div>${A && B ? `<div class="chips"><a class="chip ${mode !== 'career' ? 'on' : ''}" href="#${key(cur0.a, cur0.b, 'season')}">Single season</a><a class="chip ${mode === 'career' ? 'on' : ''}" href="#${key(cur0.a, cur0.b, 'career')}">Career</a></div>` : ''}</div>
    <div class="panel" style="margin-bottom:var(--s4);overflow:visible"><div class="vs" style="grid-template-columns:1fr auto 1fr">${card(A, 'a')}<span class="mid">VS</span>${card(B, 'b')}</div><div class="row" style="padding:0 16px 16px;align-items:flex-start">${pick('a')}${pick('b')}</div></div>${body}`;
  const cur = { a: A ? { id: A.id, yr: A.yr } : A0, b: B ? { id: B.id, yr: B.yr } : B0 };
  view.querySelectorAll('[data-cview]').forEach(b => b.onclick = () => { store.set('careerView', b.dataset.cview); pcompare(aV, bV, mode); });
  view.querySelectorAll('.ssel').forEach(sel => sel.onchange = () => { cur[sel.dataset.side].yr = Number(sel.value); location.hash = key(cur.a, cur.b); });
  const wirePick = which => { const inp = document.getElementById('pp' + which), dd = document.getElementById('pp' + which + 'dd'); let t;
    inp.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const q = inp.value.trim().toLowerCase(); if (q.length < 2) { dd.hidden = true; return; } dd.innerHTML = `<div class="hd">${rosterIndex ? 'Searching…' : 'Loading rosters, one moment…'}</div>`; dd.hidden = false; const hits = await searchAthletes(q); if (inp.value.trim().toLowerCase() !== q) return;
      dd.innerHTML = hits.map(p => `<a href="#" data-pick="${esc(p.id)}"><img class="hs" src="${esc(p.hs)}" alt="">${esc(p.name)}<small>${esc(p.sub)}</small></a>`).join('') || '<div class="hd">No matches</div>';
      dd.querySelectorAll('[data-pick]').forEach(a => a.onclick = e => { e.preventDefault(); cur[which] = { id: a.dataset.pick, yr: cur[which].yr || SEASON }; location.hash = key(cur.a, cur.b); }); }, 250); }; };
  wirePick('a'); wirePick('b');
  if (!A) document.getElementById('ppa').focus(); else if (!B) document.getElementById('ppb').focus();
}

/* ---------- settings ---------- */
async function settings() {
  const seasons = Array.from({ length: CUR_SEASON - 2009 }, (_, i) => CUR_SEASON - i);
  const nperm = 'Notification' in window ? Notification.permission : 'unsupported';
  const installable = !!window.deferredInstall;
  view.innerHTML = `<div class="bar"><div><h1>Settings</h1><h2>Season, alerts and app install</h2></div></div>
    <div class="grid">
      <div class="panel"><h3>League</h3><div class="box"><p class="muted" style="margin:0 0 10px">Favorites, caches and filters are kept separately for each league.</p><div class="chips">${Object.values(LEAGUES).map(l => `<button class="chip ${l === LEAGUE ? 'on' : ''}" data-league="${l.key}">${l.name}</button>`).join('')}</div></div></div>
      <div class="panel"><h3>Season</h3><div class="box"><p class="muted" style="margin:0 0 10px">Standings, leaders, team and player pages follow the selected season. Live scores and odds always use the current season.</p><select id="season">${seasons.map(y => `<option value="${y}" ${y === SEASON ? 'selected' : ''}>${y}${y === CUR_SEASON ? ' (current)' : ''}</option>`).join('')}</select></div></div>
      <div class="panel"><h3>Score alerts</h3><div class="box"><p class="muted" style="margin:0 0 10px">Get a browser notification when one of your teams scores or a game goes final. Works while this page is open.</p>
        <label class="row"><input type="checkbox" id="ntog" ${store.get('notify', false) ? 'checked' : ''} ${nperm === 'unsupported' ? 'disabled' : ''}> Browser notifications</label>
        <label class="row" style="margin-top:6px"><input type="checkbox" id="stog" ${store.get('sound', false) ? 'checked' : ''}> Sound on scores, turnovers and red-zone entries (while this tab is open)</label><p class="muted" style="font-size:12px;margin:8px 0 0">${nperm === 'unsupported' ? 'Not supported in this browser.' : nperm === 'denied' ? 'Blocked in browser settings.' : nperm === 'granted' ? 'Permission granted.' : 'You will be asked for permission.'}</p>
        <p class="muted" style="font-size:12px;margin:8px 0 0">My teams: ${favs.length ? favs.map(f => esc((teamIndex || {})[f]?.abbreviation || f)).join(', ') : 'none yet. Open a team page and tap ☆.'}</p></div></div>
      <div class="panel"><h3>Live refresh</h3><div class="box"><p class="muted" style="margin:0 0 10px">How often live pages re-check ESPN. Game pages and the ticker use this rate; heavier pages (Home, Leaders, player logs) use double it. ESPN's own feeds update every 10–20 s, so faster than 10 s gains nothing. Polling pauses while the tab is hidden.</p>
        <select id="lint">${[[10,'Every 10 s (fastest useful)'],[15,'Every 15 s (default)'],[30,'Every 30 s'],[60,'Every 60 s (light)']].map(([v, l]) => `<option value="${v}" ${Number(store.get('liveInterval', 15)) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="panel"><h3>Install</h3><div class="box"><p class="muted" style="margin:0 0 10px">Add Gridiron Desk to your home screen for a full-screen app with the last scoreboard cached offline.</p>
        ${installable ? '<button class="chip on" id="inst">Install app</button>' : '<p class="muted" style="font-size:13px;margin:0">On iPhone: Share → <b>Add to Home Screen</b>. On Android/desktop Chrome: use the install icon in the address bar. (Requires the site to be served over https, e.g. GitHub Pages.)</p>'}</div></div>
      <div class="panel"><h3>Cache &amp; updates</h3><div class="box"><p class="muted" style="margin:0 0 10px">Running version <b class="num">${APP_VERSION}</b>. Rosters are cached for a day so Players and Leaders open instantly. If a new upload doesn't appear, force an update.</p><div class="row"><button class="chip" id="clr">Clear cached data</button><button class="chip on" id="upd">Force update</button></div></div></div>
    </div>`;
  document.getElementById('season').onchange = e => setSeason(Number(e.target.value));
  view.querySelectorAll('[data-league]').forEach(b => b.onclick = () => setLeague(b.dataset.league));
  document.getElementById('lint').onchange = e => { store.set('liveInterval', Number(e.target.value)); toast('Live refresh: every ' + e.target.value + ' s'); };
  document.getElementById('stog').onchange = e => { store.set('sound', e.target.checked); if (e.target.checked) beep('score'); };
  document.getElementById('ntog').onchange = async e => { if (e.target.checked) { const p = await Notification.requestPermission(); if (p !== 'granted') { e.target.checked = false; toast('Notifications blocked'); return; } } store.set('notify', e.target.checked); toast(e.target.checked ? 'Alerts on' : 'Alerts off'); settings(); };
  const inst = document.getElementById('inst'); if (inst) inst.onclick = async () => { window.deferredInstall.prompt(); await window.deferredInstall.userChoice; window.deferredInstall = null; settings(); };
  document.getElementById('upd').onclick = forceUpdate;
  document.getElementById('clr').onclick = () => { try { Object.keys(localStorage).filter(k => k.startsWith('rosters:')).forEach(k => localStorage.removeItem(k)); } catch {} cache.clear(); rosterIndex = null; rosterLoading = null; leadersFull = null; leadersLoading = null; toast('Cache cleared'); };
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.deferredInstall = e; });
const APP_VERSION = '9.0';
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => { reg.update().catch(() => {}); reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('New version ready · reloading'); }); }); }).catch(() => {});
  let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; setTimeout(() => location.reload(), 600); });
}
async function forceUpdate() { try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; await Promise.all(regs.map(r => r.unregister())); const ks = await caches?.keys?.() || []; await Promise.all(ks.map(k => caches.delete(k))); } catch {} location.reload(true); }

/* ---------- home (5) ---------- */
async function home() {
  if (!isCur()) { location.replace('#scores'); return scores(); }
  const [sb, news_, stnd] = await Promise.all([getJSON(SB_URL(), 30000), getJSON(`${API}/news?limit=12`, 300000).catch(() => ({ articles: [] })), standingsL3().catch(() => null)]);
  await teamsIndex().catch(() => {}); watchScores(sb.events); noteColors(sb.events);
  const live = sb.events.filter(e => e.status.type.state === 'in');
  const featured = sb.events.find(favGame) || live[0] || sb.events.find(e => e.status.type.state === 'pre') || sb.events[0];
  const today = new Date().toDateString(); const todays = sb.events.filter(e => new Date(e.date).toDateString() === today);
  const next = sb.events.filter(e => e.status.type.state === 'pre').sort((x, y) => new Date(x.date) - new Date(y.date)).slice(0, 4);
  // week leaders from game cards
  // only played games carry per-game leaders; upcoming games list season leaders, so skip those
  let perfEvents = sb.events.filter(e => e.status.type.state !== 'pre'), perfLabel = "This week's top performers";
  if (!perfEvents.length && (sb.week?.number || 1) > 1) { try { const prev = await getJSON(`${API}/scoreboard?seasontype=2&week=${sb.week.number - 1}&dates=${SEASON}`, 600000); perfEvents = (prev.events || []).filter(e => e.status.type.completed); perfLabel = `Week ${sb.week.number - 1} top performers`; } catch {} }
  const agg = {}; perfEvents.forEach(ev => (ev.competitions[0].leaders || []).forEach(cat => (cat.leaders || []).forEach(l => { const v = num(l.displayValue.match(/(\d+)\s*YDS/)?.[1] || l.value); const k = cat.name; (agg[k] ||= []).push({ ...l, v, ev, team: ev.competitions[0].competitors.find(c => c.team.id === l.team?.id)?.team }); })));
  const wl = Object.entries(agg).map(([k, arr]) => [k, arr.sort((a, b) => b.v - a.v).slice(0, 3)]);
  let rk = null; if (isCFB()) { try { const rd = await getJSON(`${API}/rankings`, 300000); rk = (rd.rankings || []).find(p => /cfp|playoff/i.test(p.name)) || (rd.rankings || [])[0]; } catch {} }
  const seeds = isCFB() ? (rk ? `<div class="panel"><h3>${esc(rk.shortName || rk.name)} top 10<a class="lnk" style="font-size:12px;letter-spacing:0;text-transform:none" href="#playoffs">Full rankings →</a></h3>${rk.ranks.slice(0, 10).map(r => `<a class="leader" style="grid-template-columns:24px 26px 1fr auto;padding:6px 12px" href="#team/${esc(r.team?.id)}"><span class="rank num">${esc(r.current)}</span><img src="${esc(r.team?.logo || '')}" alt="" style="width:26px;height:26px;border-radius:0;object-fit:contain"><div class="nm">${esc(r.team?.nickname ? (r.team.location ? r.team.location + ' ' + r.team.nickname : r.team.nickname) : r.team?.name)}</div><span class="num muted">${esc(r.recordSummary || '')}</span></a>`).join('')}</div>` : '') : (stnd?.children || []).map(c => { const top = [...(c.standings?.entries || c.children.flatMap(d => d.standings?.entries || []))].sort((x, y) => Number(x.stats.find(s => s.name === 'playoffSeed')?.value ?? 99) - Number(y.stats.find(s => s.name === 'playoffSeed')?.value ?? 99)).slice(0, 7); return `<div class="panel"><h3>${esc(c.abbreviation)} top 7</h3>${top.map((e, i) => `<a class="leader" style="grid-template-columns:24px 26px 1fr auto;padding:6px 12px" href="#team/${esc(e.team.id)}"><span class="rank num">${i + 1}</span><img src="${esc(logo(e.team))}" alt="" style="width:26px;height:26px;border-radius:0;object-fit:contain"><div class="nm">${esc(e.team.displayName)}</div><span class="num muted">${esc(e.stats.find(s => s.name === 'overall')?.displayValue || '')}</span></a>`).join('')}</div>`; }).join('');
  view.innerHTML = `<div class="bar"><div><h1>${isCFB() ? 'College Football' : 'NFL'}</h1><h2>${SEASON} season · Week ${esc(sb.week?.number || '')} · ${live.length ? live.length + ' live now' : new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div><div class="row"><a class="chip" href="#scores">Scoreboard</a><a class="chip" href="${LEAGUE.odds ? '#odds' : '#playoffs'}">${LEAGUE.odds ? 'Playoff odds' : 'Rankings & CFP'}</a></div></div>
    ${myTeamsStrip(sb.events)}
    ${featured ? featuredCard(featured) : ''}
    <div class="two"><div class="stack">
      <div class="panel"><h3>${todays.length ? 'Today' : 'Next up'}<a class="lnk" style="font-size:12px;letter-spacing:0;text-transform:none" href="#scores">Full scoreboard →</a></h3>${(todays.length ? todays : next).map(gameCard).join('') || '<div class="empty">No games scheduled.</div>'}</div>
      <div class="panel"><h3>Headlines<a class="lnk" style="font-size:12px;letter-spacing:0;text-transform:none" href="#news">All news →</a></h3>${(news_.articles || []).filter(a => a.links?.web?.href).slice(0, 6).map(a => `<a class="leader" style="grid-template-columns:64px 1fr" href="${esc(a.links.web.href)}" target="_blank" rel="noopener"><img src="${esc(a.images?.[0]?.url || '')}" alt="" style="width:64px;height:44px;border-radius:4px;object-fit:cover"><div><div class="nm">${esc(a.headline)}</div><div class="sub">${esc(a.published ? ago(a.published) : '')}${a.byline ? ' · ' + esc(a.byline) : ''}</div></div></a>`).join('')}</div>
    </div><div class="stack">
      ${wl.length ? `<div class="panel"><h3>${perfLabel}</h3>${wl.map(([k, arr]) => `<div class="lhead" style="grid-template-columns:1fr"><span>${esc(arr[0]?.athlete ? ({passingYards:'Passing',rushingYards:'Rushing',receivingYards:'Receiving'})[k] || k : k)}</span></div>${arr.map(l => `<a class="leader" style="padding:6px 12px" href="#player/${esc(l.athlete.id)}"><span></span><img src="${esc(hsOf(l.athlete))}" alt=""><div><div class="nm">${esc(l.athlete.displayName)}</div><div class="sub">${esc(l.athlete.position?.abbreviation || '')} · ${esc(l.team?.abbreviation || '')} · ${esc(l.ev.shortName)}${l.ev.status.type.state === 'in' ? ' <span class="pos">live</span>' : ''}</div></div><span class="val" style="font-size:14px">${esc(l.displayValue)}</span></a>`).join('')}`).join('')}</div>` : ''}
      ${seeds}
    </div></div>`;
  if (live.length) poll(home, false);
}

/* ---------- team stats table (7) ---------- */
const TSTATS = [['Points/G','scoring.totalPointsPerGame'],['Yds/G','passing.yardsPerGame'],['Pass Y/G','passing.passingYardsPerGame'],['Rush Y/G','rushing.rushingYardsPerGame'],['QBR','passing.QBR'],['3rd %','miscellaneous.thirdDownConvPct'],['4th %','miscellaneous.fourthDownConvPct'],['RZ TD %','miscellaneous.redzoneTouchdownPct'],['Give','miscellaneous.totalGiveaways'],['Take','miscellaneous.totalTakeaways'],['TO +/-','miscellaneous.turnOverDifferential'],['Sacks','defensive.sacks'],['Sacked','passing.sacks'],['INT','defensiveInterceptions.interceptions'],['Pen Yds','general.totalPenaltyYards']];
async function teamstats(sortKey) {
  view.innerHTML = `<div class="bar"><div><h1>Team stats</h1><h2>Loading all 32 teams…</h2></div></div><div class="prog" id="tsp"><i style="width:0"></i></div>`;
  const idx = await teamsIndex(); const ids = Object.keys(idx); let done = 0;
  const rows = (await Promise.all(ids.map(async id => { const st = await teamStats(id); done++; const b = document.querySelector('#tsp i'); if (b) b.style.width = done / ids.length * 100 + '%'; return st ? { id, team: idx[id], st } : null; }))).filter(Boolean);
  if (!rows.length) { view.innerHTML = '<div class="panel"><div class="empty">ESPN\'s team statistics feed is unavailable right now.</div></div>'; return; }
  const cols = TSTATS.filter(([, k]) => rows.some(r => r.st[k]));
  // exact ranks from the full table (handles ties better than ESPN's flipped rank)
  cols.forEach(([, k]) => { const lower = LOWER_BETTER.has(k); const sorted = rows.filter(r => r.st[k]).sort((a, b) => lower ? num(a.st[k].value) - num(b.st[k].value) : num(b.st[k].value) - num(a.st[k].value)); let rank = 0, prev = null; sorted.forEach((r, i) => { const v = num(r.st[k].value); if (v !== prev) { rank = i + 1; prev = v; } r.st[k] = { ...r.st[k], rank }; }); });
  view.innerHTML = `<div class="bar"><div><h1>Team stats</h1><h2>${SEASON} regular season · click a column to sort · rank in small type</h2></div></div>
    <div class="panel"><div class="tw"><table id="tst"><thead><tr><th class="sort" data-k="team">Team</th>${cols.map(([l, k]) => `<th class="num sort" data-k="${k}">${l}</th>`).join('')}</tr></thead><tbody></tbody></table></div></div>`;
  const colFns = { team: r => r.team.displayName }; cols.forEach(([, k]) => colFns[k] = r => num(r.st[k]?.value));
  const t = document.getElementById('tst');
  sortable(t, rows, colFns, r => `<tr class="clk ${isFav(r.id) ? 'fav' : ''}" data-t="${esc(r.id)}"><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.abbreviation)}</td>${cols.map(([, k]) => { const s = r.st[k]; return `<td class="num">${s ? esc(s.displayValue) : '–'} ${s?.rank ? `<span class="rk ${s.rank <= 8 ? 'top' : s.rank >= 25 ? 'bot' : ''}">${s.rank}</span>` : ''}</td>`; }).join('')}</tr>`, cols.find(([, k]) => k === sortKey)?.[1] || cols[0][1]);
  t.addEventListener('drawn', wire); wire();
}

/* ---------- share + keyboard shortcuts (9, 11) ---------- */
document.getElementById('share')?.addEventListener('click', async () => { const url = location.href; try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { try { if (navigator.share) { await navigator.share({ title: document.title, url }); return; } } catch {} prompt('Copy this link', url); } });
let gPending = false;
document.addEventListener('keydown', e => {
  if (/input|select|textarea/i.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const b = document.getElementById(e.key === 'ArrowLeft' ? 'prevw' : 'nextw'); if (b && !b.disabled) { b.click(); e.preventDefault(); } return; }
  if (e.key === 'g') { gPending = true; setTimeout(() => gPending = false, 1200); return; }
  if (gPending) { const map = { h: 'home', s: 'scores', t: 'standings', p: 'playoffs', o: 'odds', l: 'leaders', r: 'players', m: 'teams', f: 'fantasy', n: 'news', i: 'injuries', c: 'compare', ',': 'settings' }; if (map[e.key]) { location.hash = map[e.key]; gPending = false; e.preventDefault(); } return; }
  if (e.key === 't') document.getElementById('theme')?.click();
  if (e.key === '?') toast('Shortcuts: / search · ←/→ week · t theme · g then h/s/t/p/o/l/r/m/f/n/i/c');
});

document.addEventListener('error', e => { const el = e.target; if (el?.tagName === 'IMG' && /headshots/.test(el.src) && !el.dataset.fb) { el.dataset.fb = 1; el.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#2a3648"/><circle cx="32" cy="24" r="11" fill="#8793a6"/><path d="M10 58c3-13 12-19 22-19s19 6 22 19z" fill="#8793a6"/></svg>'); } }, true);
ticker(); route();
setInterval(() => { if (document.hidden) return; const live = [...document.querySelectorAll('#ticker .st.live')].length > 0; if (live || Date.now() % 60000 < LIVE_MS()) { cache.delete(SB_URL()); ticker(); } }, LIVE_MS());
})();
