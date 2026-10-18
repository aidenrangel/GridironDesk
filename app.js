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
    post: [['1','Bowls & CFP','BOWL']], fantasy: false, odds: true, injuries: false }
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
      if (url === SB_URL()) { STALE.at = null; try { store.set('stale:sb:' + LEAGUE.key, { t: Date.now(), v }); } catch {} }
      return v;
    } catch (e) { lastErr = e; console.warn(`fetch failed (try ${attempt + 1})`, url, e); await new Promise(res => setTimeout(res, 400 * (attempt + 1))); }
  }
  if (url === SB_URL()) { const st = store.get('stale:sb:' + LEAGUE.key, null); if (st?.v) { STALE.at = st.t; toast('ESPN is not responding · showing the last scoreboard'); return st.v; } }
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
    async () => { const d = await standingsL3(); d.children.forEach(c => c.children.forEach(div => (div.standings?.entries || []).forEach(e => idx[e.team.id] = { ...e.team, color: LEAGUE.key === 'nfl' ? COLORS[e.team.id] : learnedColors[e.team.id], conf: c.abbreviation, confName: c.name, div: div.name, stats: e.stats }))); },
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
/* Records computed from the scoreboard the moment a game goes final (ESPN's standings feed lags by minutes). */
let recCache = null;
async function computedRecords() {
  if (!isCur()) return {}; const key = LEAGUE.key + ':' + SEASON; if (recCache?.key === key && Date.now() - recCache.t < 20000) return recCache.v;
  const out = {}; try { const games = (await seasonGames(false)).filter(ev => ev.competitions[0].status?.type?.completed).sort((a, b) => new Date(a.date) - new Date(b.date));
    games.forEach(ev => { const c = ev.competitions[0], [a, h] = byHome(c); const as = scoreOf(a), hs = scoreOf(h);
      [[a, as, hs], [h, hs, as]].forEach(([t, ms, os]) => { const r = (out[t.team.id] ||= { w: 0, l: 0, t: 0, g: 0, pf: 0, pa: 0, home: [0, 0, 0], away: [0, 0, 0], last: [] }); const res = ms > os ? 0 : ms < os ? 1 : 2; r.g++; r.pf += ms; r.pa += os; if (res === 0) r.w++; else if (res === 1) r.l++; else r.t++; r[t.homeAway === 'home' ? 'home' : 'away'][res]++; r.last.push('WLT'[res]); }); });
    Object.values(out).forEach(r => { const z = r.last[r.last.length - 1]; let n = 0; for (let i = r.last.length - 1; i >= 0 && r.last[i] === z; i--) n++; r.streak = z ? z + n : ''; r.overall = `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`; });
  } catch {} recCache = { key, t: Date.now(), v: out }; return out;
}
function overlayRecords(d, rec) {
  const setStat = (e, name, value, displayValue) => { let st = e.stats.find(s => s.name === name); if (!st) { st = { name }; e.stats.push(st); } st.value = value; st.displayValue = displayValue ?? String(value); };
  (d.children || []).forEach(c => (c.children || []).forEach(div => (div.standings?.entries || []).forEach(e => { const r = rec[e.team.id]; if (!r) return; const fg = recOf(e); if (r.g <= fg.w + fg.l + fg.t) return;
    setStat(e, 'wins', r.w); setStat(e, 'losses', r.l); setStat(e, 'ties', r.t); setStat(e, 'overall', 0, r.overall); setStat(e, 'winPercent', r.g ? (r.w + r.t / 2) / r.g : 0, (r.g ? (r.w + r.t / 2) / r.g : 0).toFixed(3));
    setStat(e, 'pointsFor', r.pf); setStat(e, 'pointsAgainst', r.pa); setStat(e, isCFB() ? 'pointDifferential' : 'differential', r.pf - r.pa, sgn(r.pf - r.pa)); setStat(e, 'streak', 0, r.streak);
    const hv = r.home, av = r.away; setStat(e, 'Home', 0, `${hv[0]}-${hv[1]}${hv[2] ? '-' + hv[2] : ''}`); setStat(e, isCFB() ? 'Away' : 'Road', 0, `${av[0]}-${av[1]}${av[2] ? '-' + av[2] : ''}`); e._live = true; })));
  return d;
}
async function standingsL3() { const [d, rec] = await Promise.all([getJSON(`${API2}/standings?season=${SEASON}${LEAGUE.stQ}`, 120000), computedRecords()]); return overlayRecords(normStandings(d), rec); }
const P4 = [['SEC', /southeastern|^sec$/i], ['Big Ten', /big ten|^b1g$|^big10$/i], ['Big 12', /big 12|^big12$/i], ['ACC', /atlantic coast|^acc$/i]];
const p4Index = c => P4.findIndex(([, re]) => re.test(c?.name || '') || re.test(c?.abbreviation || ''));
const confOrder = (a, b) => { const ia = p4Index(a), ib = p4Index(b); if (ia >= 0 || ib >= 0) return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib); if (/independ/i.test(a.name) !== /independ/i.test(b.name)) return /independ/i.test(a.name) ? 1 : -1; return (a.name || '').localeCompare(b.name || ''); };
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
/* Overall W-L-T from a standings entry. ESPN's college feed puts the conference record in wins/losses, so prefer the 'overall' summary. */
function recOf(e) { const v = n => Number(e.stats?.find(s => s.name === n)?.value ?? NaN); const ov = String(e.stats?.find(s => s.name === 'overall')?.displayValue || ''); const m = ov.match(/^(\d+)-(\d+)(?:-(\d+))?/);
  if (m && (isCFB() || isNaN(v('wins')))) return { w: num(m[1]), l: num(m[2]), t: num(m[3] || 0) }; return { w: v('wins') || 0, l: v('losses') || 0, t: v('ties') || 0 }; }
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
    const cached = store.get(LK('rosters2:' + SEASON), null);
    if (cached && Date.now() - cached.t < 86400000 && cached.list?.length > 1000) { rosterIndex = cached.list.map(p => ({ ...p, team: idx[p.tid] || { id: p.tid, abbreviation: '', displayName: '' } })); onProgress?.(1); return rosterIndex; }
    const ids = Object.keys(idx); const out = []; let done = 0;
    await Promise.all(ids.map(async id => {
      try { const groups = await teamRoster(id);
        groups.forEach(g => (g.items || []).forEach(p => out.push({ id: p.id, name: p.displayName, pos: p.position?.abbreviation || '', jersey: p.jersey || '', hs: hsOf(p), team: idx[id], inj: p.injuries?.[0]?.status || '', dy: p.draft?.year || null, dr: p.draft?.round || null, pk: p.draft?.selection || null, exp: p.experience?.years ?? null })));
      } catch {} done++; onProgress?.(done / ids.length);
    }));
    rosterIndex = out;
    store.set(LK('rosters2:' + SEASON), { t: Date.now(), list: out.map(p => ({ id: p.id, name: p.name, pos: p.pos, jersey: p.jersey, hs: p.hs, tid: p.team.id, inj: p.inj, dy: p.dy, dr: p.dr, pk: p.pk, exp: p.exp })) });
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
    if (isCFB()) { const [siteD, idx] = await Promise.all([site, teamsIndex().catch(() => ({}))]); leadersFull = (siteD?.leaders?.categories || []).map(c => ({ ...c, expandable: true, leaders: (c.leaders || []).filter(l => l.team?.id && idx[l.team.id]) })); return leadersFull; }
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
  const paths = series.map(s => { const pts = s.v.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean); return `<path class="${s.cls}" d="M${pts.join('L')}"/>` + (s.area ? `<path class="aA" d="M${pts[0]}L${pts.join('L')}L${x(s.v.length - 1)},${y(0)}L${x(0)},${y(0)}Z"/>` : '') + s.v.map((v, i) => v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="currentColor" style="color:var(--${s.cls === 'lA' ? 'accent' : s.cls === 'lC' ? 'gold' : 'loss'})"/>`).join(''); }).join('');
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
function wpChart(wp, a, h, { hh = 150, w = 520, marks = [] } = {}) {
  const pad = { l: 34, r: 10, t: 10, b: 20 }; const n = wp.length; if (n < 2) return '';
  const x = i => pad.l + i * (w - pad.l - pad.r) / (n - 1), y = p => pad.t + (hh - pad.t - pad.b) * (1 - p);
  const pts = wp.map((p, i) => `${x(i)},${y(p.homeWinPercentage)}`);
  return `<svg viewBox="0 0 ${w} ${hh}"><g class="grid">${[0, .25, .5, .75, 1].map(p => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(p)}" y2="${y(p)}" class="${p === .5 ? 'mid' : ''}"/><text x="${pad.l - 4}" y="${y(p) + 3}" text-anchor="end">${Math.round(p * 100)}%</text>`).join('')}</g>
    <path class="wpf" d="M${pts[0]}L${pts.join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="wp" d="M${pts.join('L')}"/>
    ${marks.map((i, k) => wp[i] ? `<g class="km"><circle cx="${x(i)}" cy="${y(wp[i].homeWinPercentage)}" r="8"/><text x="${x(i)}" y="${y(wp[i].homeWinPercentage) + 3.5}" text-anchor="middle">${k + 1}</text></g>` : '').join('')}
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
  document.querySelectorAll('a[data-r="fantasy"], a[data-r="odds"], a[data-r="injuries"], a[data-r="race"], a[data-r="transactions"]').forEach(a => a.classList.toggle('league-hide', (a.dataset.r === 'fantasy' && !LEAGUE.fantasy) || (a.dataset.r === 'odds' && !LEAGUE.odds) || (a.dataset.r === 'injuries' && !LEAGUE.injuries) || (a.dataset.r === 'race' && !LEAGUE.hasDivisions) || (a.dataset.r === 'transactions' && LEAGUE.key !== 'nfl')));
  document.querySelectorAll('a[data-r="bowls"]').forEach(a => a.classList.toggle('league-hide', !isCFB()));
  document.querySelectorAll('a[data-r="odds"]').forEach(a => { if (!a.querySelector('svg')) a.textContent = isCFB() ? 'CFP odds' : 'Playoff odds'; });
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
  const alias = { team: 'teams', player: 'players', pcompare: 'players', game: 'scores', odds: 'playoffs', teamstats: 'power', redzone: 'scores', multi: 'scores', sos: 'power', race: 'standings', records: 'leaders', awards: 'leaders', transactions: 'news', accuracy: 'power', recap: 'scores', bowls: 'playoffs', stats: 'leaders', coaches: 'teams' };
  document.querySelectorAll('#nav a, #bnav a, .moremenu a').forEach(x => x.classList.toggle('on', x.dataset.r === (alias[r] || r)));
  clearInterval(refreshTimer); refreshTimer = null; pollFn = null; document.querySelector('.more')?.remove(); if (!((r === 'game' && c === 'theater') || (r === 'multi' && (b === 'theater' || c === 'theater')))) document.body.classList.remove('theater'); stopClocks(); closeAthCard(); document.getElementById('sbanner')?.classList.remove('show'); document.querySelector('.moremenu')?.removeAttribute('open'); document.getElementById('gearMenu')?.removeAttribute('open');
  view.innerHTML = '<div class="panel"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  window.scrollTo(0, 0);
  const pages = { home, scores, standings, playoffs, odds, power, leaders, players, player, pcompare, teams, team, compare, injuries, news, game: gamecast, fantasy, settings, teamstats, redzone, multi, transactions, sos, race, awards, records, accuracy, recap, bowls, stats, coaches };
  document.querySelectorAll('#nav a').forEach(x => x.toggleAttribute('aria-current', x.classList.contains('on')));
  (pages[r] || home)(a, b, c).catch(e => view.innerHTML = fail(e));
  renderPin();
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
  if (isCur()) { watchScores(sb.events); await computedRecords().catch(() => {}); } noteColors(sb.events);
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
        ${anyLive ? '<a class="chip on" href="#redzone"><span class="dot"></span>RedZone view</a>' : ''}<span class="upd">${staleBadge()} ${anyLive ? 'Live · auto-refreshing' : isCur() ? 'Updated ' + new Date().toLocaleTimeString() : 'Final results'}</span>
        <button class="chip" id="prevw" ${wi <= 0 ? 'disabled' : ''}>‹</button>
        <select id="wk" aria-label="Week"><optgroup label="Regular season">${cal.reg.map(x => `<option value="${x.key}" ${x.key === key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>${cal.post.length ? `<optgroup label="Postseason">${cal.post.map(x => `<option value="${x.key}" ${x.key === key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>` : ''}</select>
        <button class="chip" id="nextw" ${wi >= allW.length - 1 ? 'disabled' : ''}>›</button>
      </div></div>
    ${myTeamsStrip(sb.events)}
    ${featured ? featuredCard(featured) : ''}
    <div id="ifhold"></div>
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s4)"><button class="chip ${sbFilter === 'top25' ? 'on' : ''}" data-sbf="top25">Top 25</button><button class="chip ${sbFilter === 'all' ? 'on' : ''}" data-sbf="all">All FBS (${sb.events.length})</button>${favs.length ? `<button class="chip ${sbFilter === 'mine' ? 'on' : ''}" data-sbf="mine">My teams</button>` : ''}<select id="sbconf" aria-label="Conference" style="padding:6px 10px"><option value="">Conference…</option>${confsIn.map(cid => `<option value="${esc(cid)}" ${sbFilter === cid ? 'selected' : ''}>${esc(confName(cid))}</option>`).join('')}</select><span class="muted" style="font-size:12px">${events.length} shown</span></div>` : ''}
    ${events.length ? '' : '<div class="panel"><div class="empty">No games match this filter.</div></div>'}
    <div class="stack">${Object.entries(byDay).map(([d, evs]) => `<div class="panel"><h3>${esc(d)}<span class="muted" style="font-size:12px;letter-spacing:0;text-transform:none">${evs.length} game${evs.length > 1 ? 's' : ''}</span></h3>${evs.map(gameCard).join('')}</div>`).join('')}</div>`;
  view.querySelectorAll('[data-sbf]').forEach(b => b.onclick = () => { store.set(LK('sbFilter'), b.dataset.sbf); scores(key); });
  const sbc = document.getElementById('sbconf'); if (sbc) sbc.onchange = e => { if (e.target.value) { store.set(LK('sbFilter'), e.target.value); scores(key); } };
  document.getElementById('wk').onchange = e => location.hash = `scores/${e.target.value}`;
  document.getElementById('prevw').onclick = () => location.hash = `scores/${allW[wi - 1].key}`;
  document.getElementById('nextw').onclick = () => location.hash = `scores/${allW[wi + 1].key}`;
  ratingModel().then(M => { view.querySelectorAll('a.game').forEach(a => { const ev = sb.events.find(e => '#game/' + e.id === a.getAttribute('href')); if (!ev || ev.status.type.state !== 'pre') return; const c = ev.competitions[0], [x, y] = byHome(c); if (!M.T[x.team.id] || !M.T[y.team.id]) return; const p = M.pWin(y.team.id, x.team.id, !!c.neutralSite); const fav = p >= .5 ? y : x; const meta = a.querySelector('.meta'); if (meta && !meta.querySelector('.pick')) meta.insertAdjacentHTML('beforeend', `<span class="pick">Model: ${esc(fav.team.abbreviation)} ${Math.round(Math.max(p, 1 - p) * 100)}%</span>`); }); }).catch(() => {});
  if (anyLive && key === liveKey) ifHoldHTML(sb.events).then(h => { const el = document.getElementById('ifhold'); if (el) el.innerHTML = h; }).catch(() => {});
  if (anyLive) poll(() => scores(key), true);
}
function featuredCard(ev) {
  const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const live = st.state === 'in', pre = st.state === 'pre';
  const odds = c.odds?.[0]; const bc = c.broadcasts?.[0]?.names?.join('/') || '';
  const side = (t, r) => `<div class="side ${r ? 'r' : ''}"><img src="${esc(t.team.logo)}" alt=""><div><b>${rankBadge(t)}${esc(t.team.displayName)}</b><small>${esc(t.records?.[0]?.summary || '')}${live && c.situation?.possession === t.id ? ' · ball' : ''}</small></div></div>`;
  return `<a class="feat" href="#game/${ev.id}" style="--ca:${colorOf(a.team)};--cb:${colorOf(h.team)}">${side(a)}<div class="mid">${pre ? '<span style="font-size:22px">' + esc(fmtShort(ev.date)) + '</span>' : esc(a.score) + ' – ' + esc(h.score)}<small class="${live ? 'live' : ''}">${live ? '<span class="dot"></span>' : ''}${esc(pre ? (odds?.details || 'Upcoming') : st.shortDetail)}${live && c.situation?.downDistanceText ? ' · ' + esc(c.situation.downDistanceText) : ''}</small></div>${side(h, true)}
    <div class="sub"><span>${pre ? 'Next up' : live ? 'Live now' : 'Final'}${c.venue?.fullName ? ' · ' + esc(c.venue.fullName) : ''}</span><span>${esc(bc)}${pre && odds?.overUnder ? ' · O/U ' + esc(odds.overUnder) : ''}</span></div></a>`;
}
function gameCard(ev) {
  const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const cr = recCache?.v || {};
  const recStr = t => { const r = cr[t.team.id]; const m = String(t.records?.[0]?.summary || '').match(/^(\d+)-(\d+)(?:-(\d+))?/); return r && m && r.g > num(m[1]) + num(m[2]) + num(m[3] || 0) ? r.overall : (t.records?.[0]?.summary || ''); };
  const done = st.completed, live = st.state === 'in', pre = st.state === 'pre';
  const possId = c.situation?.possession;
  const row = t => `<div class="team ${done ? (t.winner ? 'w' : 'l') : ''}"><img src="${esc(t.team.logo)}" alt="">${rankBadge(t)}<b>${esc(t.team.displayName)}</b><small>${esc(recStr(t))}</small>${live && possId === t.id ? '<span class="poss" title="Possession"></span>' : ''}</div>
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
const GC = { id: null, lastScore: null, seenPlays: new Set(), lastTiles: {}, lastWP: null, tab: 'box', first: true, S: null, openAth: null, nameRe: null };
const bigPlay = p => p.scoringPlay || /interception|fumble|safety|blocked|touchdown/i.test(p.type?.text || '') || (num(p.statYardage) >= 20 && !/kickoff|punt/i.test(p.type?.text || '')) || (p.start?.down === 4 && num(p.statYardage) >= num(p.start?.distance) && !/punt|field goal/i.test(p.type?.text || ''));
const playKind = p => p.scoringPlay ? 'score' : /interception|fumble/i.test(p.type?.text || '') && !/no fumble/i.test(p.text || '') ? 'turnover' : bigPlay(p) ? 'big' : '';
const fmtClock = (st, c) => st.state === 'in' ? `${c.status?.period ? (c.status.period > 4 ? 'OT' : 'Q' + c.status.period) : ''} ${c.status?.displayClock || ''}`.trim() : st.shortDetail;


/* ---------- v10: live clock that ticks between polls ---------- */
const CLK = {}; let clkTimer = null;
const STOP_RE = /timeout|incomplet|penalty|touchdown|field goal|kickoff|punt|two.?minute|end of|safety|extra point|interception|fumble|\bob\b|out of bounds|spike|sack/i;
function syncClock(id, S) {
  const st = S.c?.status; if (!S.live || !st || st.clock == null) { delete CLK[id]; return; }
  const sec = Math.round(num(st.clock)), period = st.period || 0, prev = CLK[id];
  const stopped = STOP_RE.test((S.sit.lastPlay?.type?.text || '') + ' ' + (S.sit.lastPlay?.text || ''));
  const running = !!prev && prev.period === period && sec < prev.sec && sec > 0 && !stopped;
  CLK[id] = { sec, period, at: Date.now(), running };
  if (!clkTimer) clkTimer = setInterval(tickClocks, 1000); tickClocks();
}
const clockText = (period, sec) => `${period > 4 ? 'OT' : 'Q' + period} ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
function tickClocks() {
  let any = false;
  Object.entries(CLK).forEach(([id, k]) => { const els = document.querySelectorAll(`[data-clock="${id}"]`); if (!els.length) { delete CLK[id]; return; } any = true; const left = k.running ? Math.max(0, k.sec - Math.floor((Date.now() - k.at) / 1000)) : k.sec; const t = clockText(k.period, left); els.forEach(el => { if (el.textContent !== t) el.textContent = t; el.classList.toggle('ticking', k.running && left > 0); }); });
  if (!any) { clearInterval(clkTimer); clkTimer = null; }
}
function stopClocks() { Object.keys(CLK).forEach(k => delete CLK[k]); clearInterval(clkTimer); clkTimer = null; }

/* ---------- v10: scoring summary strip ---------- */
const scoreKind = p => { const t = (p.type?.text || '').toLowerCase(); return /safety/.test(t) ? 'SAF' : /field goal/.test(t) ? 'FG' : /two.?point|2.?pt/.test(t) ? '2PT' : /touchdown|rushing|passing|return|fumble|interception/.test(t) ? 'TD' : p.scoringType?.abbreviation || 'TD'; };
function scoreStripHTML(S) {
  const sc = S.plays.filter(p => p.scoringPlay); if (!sc.length) return '';
  return sc.map(p => { const t = p.drive?.team || (p.team?.id === S.h.team.id ? S.h.team : S.a.team); const k = scoreKind(p); return `<button class="ss k-${k.toLowerCase()}" data-pid="${esc(p.id)}" style="--tc:${colorOf(t)}" title="${esc(p.text)}"><img src="${esc(logo(t))}" alt=""><span class="ss-k">${k}</span><span class="ss-sc num">${esc(p.awayScore)}–${esc(p.homeScore)}</span><small>Q${esc(p.period?.number)} ${esc(p.clock?.displayValue || '')}</small></button>`; }).join('');
}
function jumpToPlay(pid) { const el = document.querySelector(`.pl[data-pid="${pid}"]`); if (!el) { toast('That play is further down the feed'); return; } el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); }

/* ---------- v10: drive chart ---------- */
const clamp100 = v => Math.max(0, Math.min(100, v));
function drivePos(d) {
  const own = d.team?.abbreviation; const parse = txt => { const t = String(txt || '').trim(); if (t === '50') return 50; const m = t.match(/^([A-Z&]+)\s+(\d+)/); return m ? (m[1] === own ? num(m[2]) : 100 - num(m[2])) : null; };
  let s = parse(d.start?.text); if (s == null && d.start?.yardLine != null) s = num(d.start.yardLine); if (s == null) return {};
  let e = parse(d.end?.text); if (e == null) e = s + num(d.yards); const r = (d.result || '').toUpperCase(); if (/^TD|TOUCHDOWN/.test(r) && !/INT|FUMBLE/.test(r)) e = 100;
  return { s: clamp100(s), e: clamp100(e) };
}
function driveChartHTML(S) {
  if (!S.drives.length) return '<div class="empty">No drives yet.</div>';
  const rows = [...S.drives].reverse().map(d => { const isHome = d.team?.id === S.h.team.id; const { s, e } = drivePos(d); if (s == null) return '';
    const x1 = isHome ? 100 - s : s, x2 = isHome ? 100 - e : e; const r = (d.result || d.displayResult || '').toUpperCase();
    const k = /TD|TOUCHDOWN/.test(r) ? 'td' : /FG|FIELD GOAL/.test(r) ? 'fg' : /INT|FUMBLE|DOWNS|SAFETY/.test(r) ? 'to' : /PUNT/.test(r) ? 'punt' : (!d.result && S.live) ? 'cur' : 'other';
    return `<div class="dc-row ${k}" style="--tc:${colorOf(d.team)}"><div class="dc-meta"><img src="${esc(logo(d.team))}" alt=""><div><b>${esc(d.team?.abbreviation || '')}</b><small>Q${esc(d.start?.period?.number || '')} ${esc(d.start?.clock?.displayValue || '')}</small></div></div>
      <div class="dc-track"><i class="dc-bar" style="left:${Math.min(x1, x2)}%;width:${Math.max(1, Math.abs(x2 - x1))}%"></i><span class="dc-start" style="left:${x1}%"></span><span class="dc-end ${isHome ? 'l' : 'r'}" style="left:${x2}%"></span></div>
      <div class="dc-res"><b>${esc(k === 'cur' ? 'In progress' : (d.displayResult || d.result || '—'))}</b><small>${esc(d.offensivePlays ?? 0)} plays · ${esc(d.yards ?? 0)} yds · ${esc(d.timeElapsed?.displayValue || '')}</small></div></div>`; }).join('');
  const axis = [10,20,30,40,50,60,70,80,90].map(n => `<span style="left:${n}%">${n > 50 ? 100 - n : n}</span>`).join('');
  return `<div class="dchart"><div class="dc-row head"><div class="dc-meta muted">Drive</div><div class="dc-track axis"><em class="ez" style="--tc:${colorOf(S.a.team)}">${esc(S.a.team.abbreviation)}</em>${axis}<em class="ez r" style="--tc:${colorOf(S.h.team)}">${esc(S.h.team.abbreviation)}</em></div><div class="dc-res muted">Result</div></div>${rows}</div>
    <div class="dc-legend"><span class="td">Touchdown</span><span class="fg">Field goal</span><span class="punt">Punt</span><span class="to">Turnover</span><span class="other">Other</span></div>`;
}

/* ---------- v10: live player stat cards ---------- */
function athIndex(S) {
  const m = {}; (S.s.boxscore?.players || []).forEach(side => side.statistics.forEach(c => c.athletes.forEach(p => { const r = (m[p.athlete.id] ||= { a: p.athlete, team: side.team, lines: [] }); if (p.stats.some(v => v && !/^(0|0\/0|--|-|0\.0)$/.test(String(v)))) r.lines.push({ cat: c.text || c.name, labels: c.labels, stats: p.stats }); }))); return m;
}
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
function buildNameRe(ath) {
  const keys = []; Object.values(ath).forEach(r => { const n = r.a.displayName || ''; if (!n) return; keys.push([n, r.a.id]); const parts = n.split(/\s+/).filter(p => !SUFFIX.test(p)); if (parts.length >= 2) keys.push([parts[0][0] + '.' + parts.slice(1).join(' '), r.a.id]); });
  if (!keys.length) return null; keys.sort((x, y) => y[0].length - x[0].length); const map = Object.fromEntries(keys);
  return { re: new RegExp('(^|[^A-Za-z.])(' + keys.map(k => k[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z])', 'g'), map };
}
const linkNames = (text, S) => { const t = esc(text); const nr = S.nameRe; return nr ? t.replace(nr.re, (m, pre, name) => `${pre}<span class="pn" data-ath="${esc(nr.map[name])}" data-gid="${esc(S.id)}">${name}</span>`) : t; };
function athCardHTML(S, id) {
  const r = S.ath?.[id]; if (!r) return '';
  const f = fantasyFromBox(S.s)[id]; const fp = f ? ['std','half','ppr'].map(k => `<span><small>${k.toUpperCase()}</small><b>${fpts(f, FSCORE[k]).toFixed(1)}</b></span>`).join('') : '';
  const lines = r.lines.map(l => `<div class="ac-line"><small>${esc(l.cat)}</small><div>${l.labels.map((lb, i) => `<span><b>${esc(l.stats[i])}</b> ${esc(lb)}</span>`).join('')}</div></div>`).join('');
  return `<div class="ac-head" style="--tc:${colorOf(r.team)}"><img src="${esc(hsOf(r.a))}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(r.a.displayName)}</b><small>${esc(r.a.position?.abbreviation || '')} · ${esc(r.team.abbreviation)}${S.live ? ' · <em class="livetag" style="display:inline">live</em>' : ''}</small></div><button class="ac-x" data-close aria-label="Close">×</button></div>
    ${lines || '<div class="ac-line muted">No stats yet.</div>'}${fp ? `<div class="ac-fp">${fp}</div>` : ''}
    <div class="ac-foot"><a class="chip" href="#player/${esc(id)}">Full profile →</a>${LEAGUE.key === 'nfl' ? `<a class="chip" href="#pcompare/${esc(id)}-${SEASON}">Compare</a>` : ''}</div>`;
}
function openAthCard(id, anchor, S) {
  if (!S?.ath?.[id]) { location.hash = `player/${id}`; return; }
  let card = document.getElementById('athcard'); if (!card) { card = document.createElement('div'); card.id = 'athcard'; card.className = 'athcard'; document.body.appendChild(card); }
  GC.openAth = { id, gid: S.id }; card.innerHTML = athCardHTML(S, id); card.classList.add('show');
  const r = anchor?.getBoundingClientRect?.(); const w = 340; if (r && window.innerWidth > 640) { card.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px'; const below = r.bottom + 8; card.style.top = (below + 320 > window.innerHeight ? Math.max(8, r.top - 8 - card.offsetHeight) : below) + 'px'; } else { card.style.left = ''; card.style.top = ''; }
}
function closeAthCard() { GC.openAth = null; document.getElementById('athcard')?.classList.remove('show'); }
function refreshAthCard(S) { if (GC.openAth && GC.openAth.gid === S.id) { const c = document.getElementById('athcard'); if (c?.classList.contains('show')) c.innerHTML = athCardHTML(S, GC.openAth.id); } }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ath]'); if (t) { const S = t.dataset.gid && MULTI.S[t.dataset.gid] ? MULTI.S[t.dataset.gid] : GC.S; if (S?.ath?.[t.dataset.ath]) { e.preventDefault(); openAthCard(t.dataset.ath, t, S); } return; }
  const ss = e.target.closest('.ss[data-pid]'); if (ss) { jumpToPlay(ss.dataset.pid); return; }
  const km = e.target.closest('[data-jump]'); if (km) { jumpToPlay(km.dataset.jump); return; }
  if (e.target.closest('[data-close]') || !e.target.closest('#athcard')) closeAthCard();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAthCard(); });

/* ---------- v10: score celebrations ---------- */
let bannerT;
function scoreBanner(S, who, delta, newScoringPlay) {
  const t = newScoringPlay?.type?.text || ''; const kind = /safety/i.test(t) ? 'SAFETY' : /field goal/i.test(t) ? 'FIELD GOAL' : /two.?point/i.test(t) ? 'TWO-POINT CONVERSION' : /touchdown|td/i.test(t) ? 'TOUCHDOWN' : delta >= 6 ? 'TOUCHDOWN' : delta === 3 ? 'FIELD GOAL' : delta === 2 ? 'SAFETY' : delta === 1 ? 'EXTRA POINT' : 'SCORE';
  let b = document.getElementById('sbanner'); if (!b) { b = document.createElement('div'); b.id = 'sbanner'; document.body.appendChild(b); }
  b.style.setProperty('--tc', colorOf(who.team)); b.innerHTML = `<img src="${esc(logo(who.team))}" alt=""><div><b>${kind}</b><span>${esc(who.team.displayName)}</span><small>${esc(S.a.team.abbreviation)} ${S.score.a} – ${esc(S.h.team.abbreviation)} ${S.score.h}${newScoringPlay ? ' · ' + esc(newScoringPlay.text).slice(0, 90) : ''}</small></div>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 3200);
}
function celebrate(root, side, who) {
  const sc = root?.querySelector(`.sb-score[data-side="${side}"]`); if (sc) { sc.classList.remove('roll'); void sc.offsetWidth; sc.classList.add('roll'); }
  const bug = root?.querySelector('.scorebug'); if (bug) { bug.style.setProperty('--hit', colorOf(who.team)); bug.classList.remove('hit'); void bug.offsetWidth; bug.classList.add('hit'); }
}

/* ---------- v10: split-screen multi-game view ---------- */
const MULTI = { S: {}, last: {}, seen: {} };
async function multi(idsStr, mode) {
  const theater = mode === 'theater'; document.body.classList.toggle('theater', theater);
  const sb = await getJSON(SB_URL(), 15000); watchScores(sb.events); watchLive(sb.events);
  const evs = [...sb.events].sort((x, y) => ({ in: 0, pre: 1, post: 2 }[x.status.type.state] ?? 2) - ({ in: 0, pre: 1, post: 2 }[y.status.type.state] ?? 2) || new Date(x.date) - new Date(y.date));
  let ids = String(idsStr || '').split(',').filter(Boolean).filter(id => sb.events.some(e => e.id === id)).slice(0, 4);
  if (!ids.length) ids = evs.filter(e => e.status.type.state === 'in').slice(0, 2).map(e => e.id);
  const hashFor = (list, th = theater) => `#multi/${list.join(',')}${th ? '/theater' : ''}`;
  const chip = ev => { const c = ev.competitions[0], [a, h] = byHome(c), on = ids.includes(ev.id), st = ev.status.type; return `<label class="mchip ${on ? 'on' : ''} ${st.state}"><input type="checkbox" value="${esc(ev.id)}" ${on ? 'checked' : ''} ${!on && ids.length >= 4 ? 'disabled' : ''}><span>${esc(a.team.abbreviation)} @ ${esc(h.team.abbreviation)}</span><small>${st.state === 'in' ? '<i class="dot"></i>' + esc(fmtClock(st, c)) : st.state === 'pre' ? esc(fmtShort(ev.date)) : esc(st.shortDetail)}</small></label>`; };
  view.innerHTML = `<div class="bar"><div><h1>Split screen</h1><h2>Watch up to four games at once · ${ids.length ? ids.length + ' selected' : 'pick games below'}</h2></div><div class="row"><a class="chip" href="#redzone">RedZone</a><a class="chip ${theater ? 'on' : ''}" href="${hashFor(ids, !theater)}">${theater ? 'Exit theater' : 'Theater mode'}</a></div></div>
    <div class="mpick" id="mpick">${evs.map(chip).join('')}</div>
    <div class="mgrid n${ids.length}" id="mgrid">${ids.map(id => `<div class="mpane panel" id="mp-${esc(id)}"><div class="skel"></div></div>`).join('') || '<div class="panel"><div class="empty">No live games right now — pick any games above to watch them side by side.</div></div>'}</div>`;
  view.querySelectorAll('#mpick input').forEach(i => i.onchange = () => { const next = [...view.querySelectorAll('#mpick input:checked')].map(x => x.value).slice(0, 4); history.replaceState(null, '', hashFor(next)); multi(next.join(','), mode); });
  if (!ids.length) return;
  await multiTick(ids);
  if (ids.some(id => MULTI.S[id]?.live || MULTI.S[id]?.pre)) poll(() => multiTick(ids), true);
}
async function multiTick(ids) {
  await Promise.all(ids.map(async id => { const pane = document.getElementById(`mp-${id}`); if (!pane) return;
    let S; try { S = await gcState(id); } catch (e) { pane.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    S.id = String(id); S.ath = athIndex(S); S.nameRe = buildNameRe(S.ath); MULTI.S[id] = S;
    const seen = (MULTI.seen[id] ||= new Set()); const fresh = !pane.querySelector('.scorebug'); const newIds = new Set(S.plays.filter(p => !seen.has(p.id)).map(p => p.id)); S.plays.forEach(p => seen.add(p.id));
    const prev = MULTI.last[id]; const scoredSide = prev && (prev.a !== S.score.a || prev.h !== S.score.h) ? (S.score.h !== prev.h ? 'h' : 'a') : null; MULTI.last[id] = { ...S.score };
    const recent = [...S.plays].reverse().slice(0, 6);
    const parts = { sb: `<a class="scorebug mini" href="#game/${esc(id)}">${scorebugHTML(S)}</a>`, strip: `<div class="scorestrip">${scoreStripHTML(S)}</div>`, field: S.live ? fieldHTML(S) : '', wp: S.wp.length > 1 ? (() => { const hp = Math.round(S.wp[S.wp.length - 1].homeWinPercentage * 100); return `<div class="wpbar-wrap"><b>${esc(S.a.team.abbreviation)} ${100 - hp}%</b><div class="wpbar"><i style="width:${100 - hp}%;background:${colorOf(S.a.team)}"></i><i style="width:${hp}%;background:${colorOf(S.h.team)}"></i></div><b>${esc(S.h.team.abbreviation)} ${hp}%</b></div>`; })() : '', feed: recent.length ? recent.map(p => playCard(p, S, !fresh && newIds.has(p.id))).join('') : `<div class="empty">${S.pre ? 'Kickoff ' + esc(fmtShort(S.ev?.date)) : 'No plays yet.'}</div>` };
    if (fresh) pane.innerHTML = `<div data-part="sb">${parts.sb}</div><div data-part="strip">${parts.strip}</div><div data-part="field">${parts.field}</div><div data-part="wp">${parts.wp}</div><div data-part="feed" class="feed mini">${parts.feed}</div><div class="mp-foot"><a class="chip" href="#game/${esc(id)}">Open Gamecast →</a><span class="muted">${S.live ? 'updates live' : S.post ? 'Final' : ''}</span></div>`;
    else Object.entries(parts).forEach(([k, html]) => { const el = pane.querySelector(`[data-part="${k}"]`); if (el && (k !== 'feed' || newIds.size) && el.innerHTML !== html) el.innerHTML = html; });
    pane.classList.toggle('live', S.live);
    if (scoredSide) { const who = scoredSide === 'h' ? S.h : S.a; celebrate(pane, scoredSide, who); const sp = S.plays.filter(p => p.scoringPlay && newIds.has(p.id)).pop(); scoreBanner(S, who, Math.abs(scoredSide === 'h' ? S.score.h - prev.h : S.score.a - prev.a), sp); liveAlert(`${who.team.abbreviation} scores`, `${S.a.team.abbreviation} ${S.score.a} – ${S.h.team.abbreviation} ${S.score.h}`, 'score'); }
    newIds.forEach(pid => { if (fresh) return; const p = S.plays.find(x => x.id === pid); if (p && playKind(p) === 'turnover') liveAlert('Turnover', p.text, 'turnover'); });
    syncClock(id, S); refreshAthCard(S);
  }));
}

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
  return { id: String(id), s, ev, c, st, a, h, score, sit, drives, plays, wp: s.winprobability || [], live: st.state === 'in', pre: st.state === 'pre', post: st.completed, sbEvents: sb?.events || [] };
}

function scorebugHTML(S) {
  const { a, h, score, st, sit, c, live } = S;
  const poss = sit.possession; const to = (n) => `<span class="tos">${[0,1,2].map(i => `<i class="${i < num(n) ? 'on' : ''}"></i>`).join('')}</span>`;
  const side = (t, sc, isHome) => `<div class="sb-team ${isHome ? 'home' : 'away'} ${poss === t.team.id ? 'poss' : ''}" style="--tc:${colorOf(t.team)}"><img src="${esc(logo(t.team))}" alt=""><div class="sb-name"><b>${rankBadge(isHome ? (S.c?.competitors?.find(x => x.homeAway === 'home')) : (S.c?.competitors?.find(x => x.homeAway === 'away')))}${esc(t.team.abbreviation)}</b><small>${esc(t.record?.[0]?.displayValue || '')}</small>${live ? to(isHome ? sit.homeTimeouts : sit.awayTimeouts) : ''}</div><div class="sb-score" data-side="${isHome ? 'h' : 'a'}">${S.pre ? '' : sc}</div></div>`;
  const mid = live ? `<div class="sb-mid"><b class="sb-clock" data-clock="${esc(S.id)}">${esc(fmtClock(st, c))}</b><small>${esc(sit.downDistanceText || sit.shortDownDistanceText || '')}</small>${sit.isRedZone ? '<em class="rz">Red zone</em>' : ''}</div>` : `<div class="sb-mid"><b class="sb-clock">${S.pre ? esc(fmtShort(S.ev?.date || S.s.header?.competitions?.[0]?.date)) : 'Final'}</b><small>${S.pre ? esc(S.c?.odds?.[0]?.details || '') : esc(st.detail || '')}</small></div>`;
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
    <div class="pl-body">${kind ? `<span class="pl-tag ${kind}">${kind === 'score' ? (p.type?.text || 'Score') : kind === 'turnover' ? 'Turnover' : 'Big play'}</span>` : ''}<span class="pl-dd">${esc(p.start?.downDistanceText || p.type?.text || '')}</span><div class="pl-text">${linkNames(p.text, S)}</div></div>
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
  const pick = (side, cat, lbl) => { const c = side.statistics.find(x => x.name === cat); if (!c?.athletes?.length) return ''; const i = c.labels.indexOf(lbl); const best = [...c.athletes].sort((x, y) => num(y.stats[i]) - num(x.stats[i]))[0]; if (!best || !num(best.stats[i])) return ''; return `<a class="perf" href="#player/${esc(best.athlete.id)}" data-ath="${esc(best.athlete.id)}" data-gid="${esc(S.id)}"><img src="${esc(hsOf(best.athlete))}" alt=""><div><b>${esc(best.athlete.displayName)}</b><small>${esc(cat)} · ${esc(c.labels.map((l, j) => l + ' ' + best.stats[j]).slice(0, 4).join(' · '))}</small></div></a>`; };
  return sides.map(side => `<div class="perf-side" style="--tc:${colorOf(side.team)}"><div class="perf-h"><img src="${esc(logo(side.team))}" alt="">${esc(side.team.abbreviation)}</div>${pick(side, 'passing', 'YDS')}${pick(side, 'rushing', 'YDS')}${pick(side, 'receiving', 'YDS')}</div>`).join('');
}
function wpPanel(S) {
  const wp = S.wp; if (wp.length < 2) return '';
  const last = wp[wp.length - 1], prev = wp[wp.length - 2]; const hp = Math.round(last.homeWinPercentage * 100); const swing = Math.round((last.homeWinPercentage - prev.homeWinPercentage) * 100);
  const playText = {}; S.plays.forEach(p => playText[p.id] = p);
  const swings = wp.map((p, i) => ({ id: p.playId, i, d: i ? p.homeWinPercentage - wp[i - 1].homeWinPercentage : 0 })).filter(x => Math.abs(x.d) >= 0.08).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5);
  return `<div class="wpbar-wrap"><b>${esc(S.a.team.abbreviation)} ${100 - hp}%</b><div class="wpbar"><i style="width:${100 - hp}%;background:${colorOf(S.a.team)}"></i><i style="width:${hp}%;background:${colorOf(S.h.team)}"></i></div><b>${esc(S.h.team.abbreviation)} ${hp}%</b></div>
    ${S.live && Math.abs(swing) >= 3 ? `<div class="swing ${swing > 0 ? 'pos' : 'neg'}">${sgn(Math.abs(swing))}% ${esc(swing > 0 ? S.h.team.abbreviation : S.a.team.abbreviation)} on the last play</div>` : ''}
    <div class="chart">${wpChart(wp, S.a.team.abbreviation, S.h.team.abbreviation, { marks: swings.map(x => x.i) })}</div>
    ${swings.length ? `<div class="lhead" style="grid-template-columns:1fr"><span>Key moments<small class="muted" style="margin-left:6px;text-transform:none;letter-spacing:0">click to jump to the play</small></span></div>${swings.map((x, k) => { const p = playText[x.id]; return `<div class="play km" data-jump="${esc(x.id)}"><span class="q"><em class="kmn">${k + 1}</em>${p ? 'Q' + esc(p.period?.number) + '<br><small>' + esc(p.clock?.displayValue || '') + '</small>' : ''}</span><span>${p ? esc(p.text) : ''}</span><span class="sw ${x.d > 0 ? 'pos' : 'neg'}">${sgn(Math.round(Math.abs(x.d) * 100))}% ${esc(x.d > 0 ? S.h.team.abbreviation : S.a.team.abbreviation)}</span></div>`; }).join('')}` : ''}`;
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
  const preview = M ? previewText(M, aId, hId, odds, !!S.c?.neutralSite) : '';
  const teamCol = (t, id) => `<div class="pre-team" style="--tc:${colorOf(t.team)}"><img src="${esc(logo(t.team))}" alt=""><b>${esc(t.team.displayName)}</b><small>${esc(t.record?.[0]?.displayValue || '')}${M?.T[id] ? ' · rating ' + sgn(M.T[id].rating.toFixed(1)) : ''}</small><div class="form">${last5(id)}</div></div>`;
  return `<div class="panel pre"><div class="countdown" id="countdown" data-t="${kickoff.getTime()}">Kickoff ${esc(fmtDate(kickoff))}</div>
    ${preview ? `<div class="box" style="padding-bottom:0">${preview}</div>` : ''}
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
  const S = await gcState(id); S.ath = athIndex(S); S.nameRe = buildNameRe(S.ath); GC.S = S; if (S.pre) logEspnPrediction(String(id), S.s); if (S.live) hotCheck(S.sbEvents, String(id));
  const info = S.s.gameInfo || {}; const bc = S.s.header?.competitions?.[0]?.broadcasts?.[0]?.media?.shortName || S.c?.broadcasts?.[0]?.names?.join('/') || '';
  const newIds = new Set(S.plays.filter(p => !GC.seenPlays.has(p.id)).map(p => p.id)); const firstRender = GC.first; S.plays.forEach(p => GC.seenPlays.add(p.id));
  // alerts on score change / turnovers for my teams and for this open game
  let scored = null;
  if (GC.lastScore && (GC.lastScore.a !== S.score.a || GC.lastScore.h !== S.score.h)) { const who = S.score.h !== GC.lastScore.h ? S.h : S.a; const side = who === S.h ? 'h' : 'a'; scored = { who, side, delta: Math.abs(side === 'h' ? S.score.h - GC.lastScore.h : S.score.a - GC.lastScore.a) }; liveAlert(`${who.team.abbreviation} scores`, `${S.a.team.abbreviation} ${S.score.a} – ${S.h.team.abbreviation} ${S.score.h} · ${fmtClock(S.st, S.c || {})}`, 'score'); }
  GC.lastScore = { ...S.score };
  const headerBits = [S.st.detail, info.venue?.fullName, info.weather?.temperature != null ? info.weather.temperature + '°F' : '', bc].filter(Boolean).map(esc).join(' · ');
  const existing = !fresh && document.getElementById('gc') && !firstRender;
  if (!existing) {
    view.innerHTML = `<div class="row" style="justify-content:space-between"><a class="back" href="#scores/${S.s.header?.season?.type === 3 ? 'p' : ''}${esc(S.s.header?.week || '')}">← Scoreboard</a><div class="row"><a class="chip" href="#redzone">RedZone</a><a class="chip" href="#multi/${esc(id)}">Split screen</a><button class="chip ${store.get(LK('pin'), null) === String(id) ? 'on' : ''}" id="pinbtn">${store.get(LK('pin'), null) === String(id) ? 'Pinned' : 'Pin'}</button><button class="chip" id="sharebtn">Share card</button><button class="chip" id="mutebtn" title="Sound alerts">${store.get('sound', false) ? 'Sound on' : 'Sound off'}</button><a class="chip ${theater ? 'on' : ''}" href="#game/${esc(id)}/${theater ? 'box' : 'theater'}">${theater ? 'Exit theater' : 'Theater mode'}</a></div></div>
      <div id="gc" class="gc ${S.live ? 'live' : ''}">
        <div class="scorebug" id="scorebug">${scorebugHTML(S)}</div>
        <div class="muted gc-sub" id="gcsub">${headerBits}</div>
        <div class="scorestrip" id="scorestrip">${scoreStripHTML(S)}</div>
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
            <div class="panel" id="h2hpanel"><h3>All-time series</h3><div class="empty" style="padding:12px"><button class="chip" id="h2hbtn">Every meeting since 2000 →</button></div></div>
          </div>
        </div>
        <div class="tabs" id="gctabs">${[['box','Box score'],['chart','Drive chart'],['drives','Drive summary'],['stats','Team stats']].map(([k, l]) => `<button class="${k === GC.tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div id="gtab"></div>
      </div>`;
    if (S.pre) pregameHTML(S).then(html => { const el = document.getElementById('pregame'); if (el) { el.innerHTML = html; tickCountdown(); } }).catch(() => {});
    const hb = document.getElementById('h2hbtn'); if (hb) hb.onclick = () => mountH2H(document.getElementById('h2hpanel'), S.a.team, S.h.team);
    document.getElementById('pinbtn').onclick = () => { const on = store.get(LK('pin'), null) === String(id); pinGame(on ? null : String(id)); document.getElementById('pinbtn').textContent = on ? 'Pin' : 'Pinned'; document.getElementById('pinbtn').classList.toggle('on', !on); };
    document.getElementById('mutebtn').onclick = () => { const on = !store.get('sound', false); store.set('sound', on); document.getElementById('mutebtn').textContent = on ? 'Sound on' : 'Sound off'; toast(on ? 'Sound alerts on' : 'Sound alerts off'); if (on) beep('score'); };
    document.getElementById('sharebtn').onclick = () => { const X = GC.S || S; const sc = X.plays.filter(p => p.scoringPlay).slice(-6); shareCard({ title: `${X.a.team.abbreviation} ${X.score.a} – ${X.h.team.abbreviation} ${X.score.h}`, sub: `${X.live ? fmtClock(X.st, X.c || {}) : X.pre ? fmtDate(X.ev?.date || Date.now()) : 'Final'} · ${X.s.gameInfo?.venue?.fullName || ''}`, logos: [logo(X.a.team), logo(X.h.team)], rows: sc.length ? sc.map(p => ({ left: `${p.drive?.team?.abbreviation || ''} ${scoreKind(p)}`, mid: `Q${p.period?.number} ${p.clock?.displayValue || ''} · ${(p.text || '').slice(0, 48)}`, right: `${p.awayScore}–${p.homeScore}` })) : [{ left: 'Kickoff', mid: X.c?.odds?.[0]?.details || '', right: '' }] }); };
    view.querySelectorAll('#gctabs [data-tab]').forEach(b => b.onclick = () => { GC.tab = b.dataset.tab; history.replaceState(null, '', `#game/${id}/${b.dataset.tab}`); view.querySelectorAll('#gctabs button').forEach(x => x.classList.toggle('on', x === b)); renderGameTab(GC.S || S); });
    GC.first = false;
  } else {
    // incremental update: patch what changed instead of rebuilding
    const sbEl = document.getElementById('scorebug'); if (sbEl) sbEl.innerHTML = scorebugHTML(S);
    const sub = document.getElementById('gcsub'); if (sub) sub.innerHTML = headerBits;
    const strip = document.getElementById('scorestrip'); if (strip) { const h = scoreStripHTML(S); if (strip.innerHTML !== h) strip.innerHTML = h; }
    if (scored) { celebrate(document.getElementById('gc'), scored.side, scored.who); scoreBanner(S, scored.who, scored.delta, S.plays.filter(p => p.scoringPlay && newIds.has(p.id)).pop()); }
    refreshAthCard(S);
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
  renderGameTab(S); syncClock(S.id, S);
  const curTab = () => (location.hash.split('/')[2]) || GC.tab || 'box';
  if (S.live) poll(() => gamecast(id, curTab()), true); else if (S.pre) { const ms = new Date(S.ev?.date || 0) - Date.now(); if (ms > 0 && ms < 3 * 3600000) poll(() => gamecast(id, curTab()), false); }
}
function renderGameTab(S) {
  const el = document.getElementById('gtab'); if (!el) return; const s = S.s;
  const ts = s.boxscore?.teams || []; const tsA = ts.find(x => x.team.id === S.a.team.id), tsH = ts.find(x => x.team.id === S.h.team.id);
  const stat = (side, n) => side?.statistics?.find(x => x.name === n)?.displayValue ?? '';
  const want = [['totalYards','Total yards'],['netPassingYards','Passing yards'],['rushingYards','Rushing yards'],['yardsPerPlay','Yards / play'],['firstDowns','First downs'],['thirdDownEff','3rd down'],['fourthDownEff','4th down'],['redZoneAttempts','Red zone'],['turnovers','Turnovers'],['sacksYardsLost','Sacks'],['totalPenaltiesYards','Penalties'],['possessionTime','Possession']];
  const cmp = (tsA && tsH) ? `<div class="panel"><h3>Team stats</h3><div class="cmp">${want.map(([n, l]) => { const va = stat(tsA, n), vh = stat(tsH, n); if (va === '' && vh === '') return ''; const toS = v => n === 'possessionTime' ? num(v) * 60 + num(v.split(':')[1] || 0) : num(v); const na = toS(va), nh = toS(vh), lower = n === 'turnovers' || n === 'totalPenaltiesYards'; const aw = lower ? na < nh : na > nh, hw = lower ? nh < na : nh > na, mx = Math.max(na, nh, 1);
    return `<div class="r"><span class="l">${esc(va)}</span><div><div class="lbl">${l}</div><div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${na / mx * 100}%"></i></span><span class="b"><i class="${hw ? 'w' : ''}" style="width:${nh / mx * 100}%"></i></span></div></div><span class="rr">${esc(vh)}</span></div>`; }).join('')}</div></div>` : '<div class="panel"><div class="empty">Team stats appear once the game kicks off.</div></div>';
  const cats = ['passing','rushing','receiving','defensive','kicking'];
  const box = (s.boxscore?.players || []).map(side => `<div class="panel"><h3>${esc(side.team.displayName)}</h3>${side.statistics.filter(c => cats.includes(c.name)).map(c => `<div class="tw"><table><thead><tr><th>${esc(c.text || c.name)}</th>${c.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${c.athletes.slice(0, c.name === 'defensive' ? 8 : 20).map(p => `<tr><td><a class="lnk" href="#player/${esc(p.athlete.id)}" data-ath="${esc(p.athlete.id)}" data-gid="${esc(S.id)}">${esc(p.athlete.displayName)}</a></td>${p.stats.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>`).join('');
  const drv = S.drives.length ? (() => { const byTeam = {}; S.drives.forEach(d => { const k = d.team?.abbreviation || '?'; const o = (byTeam[k] ||= { n: 0, plays: 0, yds: 0, td: 0, fg: 0, to: 0, punt: 0, secs: 0, team: d.team }); o.n++; o.plays += num(d.offensivePlays); o.yds += num(d.yards); const r = (d.result || '').toUpperCase(); if (/TD/.test(r)) o.td++; else if (/FG/.test(r)) o.fg++; else if (/INT|FUMBLE|DOWNS/.test(r)) o.to++; else if (/PUNT/.test(r)) o.punt++; const [m, sct] = (d.timeElapsed?.displayValue || '0:00').split(':'); o.secs += num(m) * 60 + num(sct); });
    return `<div class="panel"><h3>Drive summary</h3><div class="tw"><table><thead><tr><th>Team</th><th class="num">Drives</th><th class="num">Plays/drive</th><th class="num">Yds/drive</th><th class="num">TD</th><th class="num">FG</th><th class="num">TO</th><th class="num">Punts</th><th class="num">Scoring %</th><th class="num">Avg time</th></tr></thead><tbody>${Object.values(byTeam).map(o => `<tr><td class="tm"><img src="${esc(logo(o.team))}" alt="">${esc(o.team?.abbreviation)}</td><td class="num">${o.n}</td><td class="num">${(o.plays / o.n).toFixed(1)}</td><td class="num">${(o.yds / o.n).toFixed(1)}</td><td class="num">${o.td}</td><td class="num">${o.fg}</td><td class="num ${o.to ? 'neg' : ''}">${o.to}</td><td class="num">${o.punt}</td><td class="num">${Math.round((o.td + o.fg) / o.n * 100)}%</td><td class="num">${Math.floor(o.secs / o.n / 60)}:${String(Math.round(o.secs / o.n % 60)).padStart(2, '0')}</td></tr>`).join('')}</tbody></table></div></div>`; })() : '<div class="panel"><div class="empty">No drives yet.</div></div>';
  const content = { box: `<div class="two"><div class="stack">${box || '<div class="panel"><div class="empty">Box score appears once the game kicks off.</div></div>'}</div><div class="stack">${cmp}</div></div>`, chart: `<div class="panel"><h3>Drive chart<span class="pill">${S.live ? 'newest first · updates live' : 'newest first'}</span></h3>${driveChartHTML(S)}</div>${S.drives.length ? drv : ''}`, drives: drv, stats: cmp };
  el.innerHTML = content[GC.tab] || content.box;
}
function flashScore(side) { const el = document.querySelector(`.sb-score[data-side="${side}"]`); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
let cdTimer; function tickCountdown() { clearInterval(cdTimer); const el = document.getElementById('countdown'); if (!el) return; const t = Number(el.dataset.t); const f = () => { const d = t - Date.now(); if (d <= 0) { el.textContent = 'Kickoff!'; clearInterval(cdTimer); return; } const days = Math.floor(d / 86400000), h = Math.floor(d % 86400000 / 3600000), m = Math.floor(d % 3600000 / 60000), s = Math.floor(d % 60000 / 1000); const parts = days ? `${days}d ${h}h ${String(m).padStart(2, '0')}m` : h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`; el.innerHTML = `Kickoff in <b class="num">${parts}</b> · ${esc(fmtDate(t))}`; }; f(); cdTimer = setInterval(f, 1000); }

/* ---------- alerts (toast + optional notification + optional sound) ---------- */
let audioCtx; function beep(kind) { if (!store.get('sound', false)) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = kind === 'score' ? 880 : kind === 'turnover' ? 440 : 660; g.gain.value = .08; o.connect(g); g.connect(audioCtx.destination); o.start(); o.frequency.exponentialRampToValueAtTime(kind === 'score' ? 1320 : 330, audioCtx.currentTime + .18); o.stop(audioCtx.currentTime + .22); } catch {} }
function liveAlert(title, body, kind) { toast(`${title}: ${body}`); beep(kind); buzz(kind); if (store.get('notify', false) && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, icon: 'icon-192.png', tag: title + body.slice(0, 20) }); } catch {} } }
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
  const sb = await getJSON(SB_URL(), 15000); watchScores(sb.events); watchLive(sb.events); hotCheck(sb.events, null);
  const live = sb.events.filter(e => e.status.type.state === 'in'), up = sb.events.filter(e => e.status.type.state === 'pre').sort((x, y) => new Date(x.date) - new Date(y.date)), done = sb.events.filter(e => e.status.type.completed);
  const excite = ev => { const c = ev.competitions[0], [a, h] = byHome(c); const margin = Math.abs(num(a.score) - num(h.score)); const q = c.status?.period || 1; const [m] = (c.status?.displayClock || '15:00').split(':'); const late = q >= 4 ? 1 - num(m) / 15 : (q - 1) / 4 * .5; return (c.situation?.isRedZone ? 3 : 0) + late * 4 + Math.max(0, 3 - margin / 4) + (favGame(ev) ? 2 : 0); };
  live.sort((x, y) => excite(y) - excite(x));
  const tile = ev => { const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const sit = c.situation || {}; const key = ev.id; const prev = rzLast[key]; const changed = prev && (prev.a !== a.score || prev.h !== h.score); rzLast[key] = { a: a.score, h: h.score };
    const row = t => `<div class="rz-team ${sit.possession === t.id ? 'poss' : ''} ${st.completed && !t.winner ? 'lost' : ''}" style="--tc:${colorOf(t.team)}"><img src="${esc(t.team.logo)}" alt=""><b>${esc(t.team.abbreviation)}</b><small>${esc(t.records?.[0]?.summary || '')}</small><span class="num sc ${changed && prev && prev[t.homeAway === 'home' ? 'h' : 'a'] !== t.score ? 'flash' : ''}">${st.state === 'pre' ? '' : esc(t.score)}</span></div>`;
    return `<a class="rz-tile ${st.state} ${sit.isRedZone ? 'inrz' : ''} ${favGame(ev) ? 'fav' : ''}" href="#game/${ev.id}"><div class="rz-top"><span class="${st.state === 'in' ? 'live' : ''}">${st.state === 'in' ? '<span class="dot"></span>' : ''}${esc(st.state === 'in' ? fmtClock(st, c) : st.state === 'pre' ? fmtShort(ev.date) : st.shortDetail)}</span>${sit.isRedZone ? '<em class="rz">RED ZONE</em>' : ''}</div>${row(a)}${row(h)}<div class="rz-sit">${st.state === 'in' ? esc(sit.downDistanceText || '') + (sit.possessionText ? ' · ' + esc(sit.possessionText) : '') : esc(c.broadcasts?.[0]?.names?.join('/') || '')}</div>${sit.lastPlay?.text && st.state === 'in' ? `<div class="rz-last">${esc(sit.lastPlay.text)}</div>` : ''}</a>`; };
  view.innerHTML = `<div class="bar"><div><h1>RedZone</h1><h2>${live.length ? live.length + ' live · sorted by excitement' : 'No live games right now'} · Week ${esc(sb.week?.number || '')}</h2></div><div class="row"><button class="chip ${store.get('autoSwitch', false) ? 'on' : ''}" id="aswitch" title="Jump to whichever game is in the red zone or close late">Auto-switch ${store.get('autoSwitch', false) ? 'on' : 'off'}</button><a class="chip" href="#multi/${esc(live.slice(0, 4).map(e => e.id).join(','))}">Split screen${live.length ? ' · top ' + Math.min(4, live.length) : ''}</a><span class="upd">${live.length ? 'Live · auto-refreshing' : ''}</span></div></div>
    ${live.length ? `<div class="rz-grid">${live.map(tile).join('')}</div>` : ''}
    ${up.length ? `<h3 class="cap" style="margin:var(--s5) 0 var(--s3);color:var(--muted)">Up next</h3><div class="rz-grid">${up.slice(0, 8).map(tile).join('')}</div>` : ''}
    ${done.length ? `<h3 class="cap" style="margin:var(--s5) 0 var(--s3);color:var(--muted)">Final</h3><div class="rz-grid">${done.map(tile).join('')}</div>` : ''}`;
  document.getElementById('aswitch').onclick = () => { const on = !store.get('autoSwitch', false); store.set('autoSwitch', on); toast(on ? 'Auto-switch on: jumps to the hottest game with a 10-second warning' : 'Auto-switch off'); redzone(); };
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
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s4)">${confs.filter(x => p4Index(x) >= 0).sort((x, y) => p4Index(x) - p4Index(y)).map(x => `<a class="chip ${x === c ? 'on' : ''}" href="#standings/${esc(x.id || x.abbreviation)}">${esc(P4[p4Index(x)][0])}</a>`).join('')}</div>` : ''}
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

// ESPN's poll entries carry location + nickname; for FBS the nickname is the mascot, for FCS/D2/D3 it is a short school name
function teamName(t) { if (!t) return ''; const known = teamIndex?.[t.id]; if (known?.displayName) return known.displayName; if (t.displayName) return t.displayName;
  // not an FBS team we know: ESPN's "nickname" here is usually a short school name, so show the full school name only
  return t.location || t.nickname || t.name || ''; }
/* ---------- college rankings + projected CFP bracket ---------- */
async function rankings(pollName) {
  const [d, idx, cr] = await Promise.all([getJSON(`${API}/rankings`, 300000), teamsIndex().catch(() => ({})), computedRecords().catch(() => ({}))]);
  const polls = (d.rankings || []).filter(r => r.ranks?.length);
  // the poll carries the record as of its release; prefer the live count from completed games, then the standings feed
  const liveRec = (id, fallback) => { const r = cr[id]; const m = String(fallback || '').match(/^(\d+)-(\d+)(?:-(\d+))?/); const fg = m ? num(m[1]) + num(m[2]) + num(m[3] || 0) : -1; if (r && r.g >= fg && r.g > 0) return r.overall; const st = idx[id]?.stats; const ov = st?.find(x => x.name === 'overall')?.displayValue; const m2 = String(ov || '').match(/^(\d+)-(\d+)/); return m2 && num(m2[1]) + num(m2[2]) > fg ? ov : (fallback || ''); };
  if (!polls.length) { view.innerHTML = '<div class="panel"><div class="empty">Rankings are published once the season starts.</div></div>'; return; }
  const sel = polls[Number(pollName)] || polls.find(p => p.type === pollName || p.shortName === pollName) || polls.find(p => /cfp|playoff/i.test(p.name)) || polls[0];
  const cfp = polls.find(p => /cfp|playoff/i.test(p.name)) || polls.find(p => /ap/i.test(p.type)) || polls[0];
  const top12 = cfp.ranks.slice(0, 12);
  const tm = r => ({ id: r.team?.id, name: teamName(r.team), abbr: r.team?.abbreviation, logo: r.team?.logo || r.team?.logos?.[0]?.href, rec: liveRec(r.team?.id, r.recordSummary) });
  const seedCard = (r, i) => { if (!r) return ''; const t = tm(r); return `<a class="seed-card" href="#team/${esc(t.id)}" style="--tc:${colorOf(idx[t.id] || r.team)}"><span class="sd">${i + 1}</span><img src="${esc(t.logo)}" alt=""><div><b>${esc(t.abbr || t.name)}</b><small>${esc(t.rec || '')}</small></div></a>`; };
  const matchup = (hi, lo) => `<div class="mu">${seedCard(top12[hi], hi)}<span class="muted">vs</span>${seedCard(top12[lo], lo)}</div>`;
  view.innerHTML = `<div class="bar"><div><h1>Rankings</h1><h2>${esc(sel.headline || sel.name)}${sel.occurrence?.displayValue ? ' · ' + esc(sel.occurrence.displayValue) : ''}</h2></div><div class="chips">${polls.map((p, i) => `<a class="chip ${p === sel ? 'on' : ''}" href="#playoffs/${i}">${esc(p.shortName || p.name)}</a>`).join('')}<a class="chip gold" href="#odds">Simulated CFP odds →</a></div></div>
    <div class="two"><div class="panel"><h3>${esc(sel.name)}<span class="pill">${sel.ranks.length} teams</span></h3><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th class="num">Record</th><th class="num">Pts</th><th class="num">1st</th><th class="num">Prev</th><th class="num">Trend</th></tr></thead><tbody>
      ${sel.ranks.map(r => { const t = tm(r); const tr = String(r.trend || '-'); return `<tr class="clk ${isFav(t.id) ? 'fav' : ''}" data-t="${esc(t.id)}"><td class="num">${esc(r.current)}</td><td class="tm"><img src="${esc(t.logo)}" alt="">${esc(t.name)}</td><td class="num">${esc(t.rec || '')}</td><td class="num">${esc(r.points ?? '')}</td><td class="num">${r.firstPlaceVotes ? esc(r.firstPlaceVotes) : ''}</td><td class="num muted">${esc(r.previous || '–')}</td><td class="num ${tr.startsWith('+') ? 'pos' : tr.startsWith('-') && tr !== '-' ? 'neg' : ''}">${esc(tr)}</td></tr>`; }).join('')}
      ${(sel.others || []).length ? `<tr><td colspan="7" class="muted" style="white-space:normal;font-size:13px"><b>Others receiving votes:</b> ${sel.others.map(o => esc(teamName(o.team) + ' ' + (o.points || ''))).join(', ')}</td></tr>` : ''}
    </tbody></table></div></div>
    <div class="stack"><div class="panel"><h3>Projected 12-team playoff<span class="pill">from ${esc(cfp.shortName || cfp.name)}</span></h3>
      <div class="lhead" style="grid-template-columns:1fr"><span>First-round byes</span></div><div class="byes">${top12.slice(0, 4).map(seedCard).join('')}</div>
      <div class="lhead" style="grid-template-columns:1fr"><span>First round · on campus</span></div><div class="mus">${matchup(4, 11)}${matchup(5, 10)}${matchup(6, 9)}${matchup(7, 8)}</div>
      <p class="note" style="padding:0 16px 12px;margin:0">Straight seeding from the poll's top 12. The real bracket gives automatic bids to the five highest-ranked conference champions, so the field can differ late in the season.</p></div></div></div>`;
  wire();
}

/* ---------- power index: opponent-adjusted rating (SRS-style), shared by the power page and every simulation ---------- */
const HFA = () => isCFB() ? 3 : 2.2;                 // home-field advantage in points
const PWIN_SCALE = () => isCFB() ? 9.5 : 7.5;        // how fast win probability rises with the rating gap
let ratingCache = null;
async function ratingModel() {
  const key = LEAGUE.key + ':' + SEASON; if (ratingCache?.key === key && Date.now() - ratingCache.t < 60000) return ratingCache.v;
  const [stnd, all, rkPoll] = await Promise.all([standingsL3(), seasonGames(), isCFB() ? getJSON(`${API}/rankings`, 300000).catch(() => null) : null]);
  const T = {}; (stnd.children || []).forEach(conf => (conf.children || []).forEach(div => (div.standings?.entries || []).forEach(e => { const v = n => Number(e.stats.find(s => s.name === n)?.value ?? 0); const r = recOf(e); T[e.team.id] = { id: e.team.id, team: e.team, conf: conf.abbreviation, div: div.name, w: r.w, l: r.l, t: r.t, pf: v('pointsFor'), pa: v('pointsAgainst'), streak: e.stats.find(s => s.name === 'streak')?.displayValue || '' }; })));
  const ids = Object.keys(T); if (!ids.length) throw new Error('Standings unavailable.');
  const CAP = 28, UNRATED = isCFB() ? -30 : 0, K = 0.15, hfa = HFA();
  const played = [], remaining = [], per = {}; ids.forEach(id => per[id] = []);
  all.filter(ev => !ev._post).forEach(ev => { const c = ev.competitions[0], [a, h] = byHome(c); if (!T[a.team.id] && !T[h.team.id]) return; const neutral = !!c.neutralSite;
    if (c.status?.type?.completed) { const as = scoreOf(a), hs = scoreOf(h); const m = hs - as - (neutral ? 0 : hfa), cm = Math.max(-CAP, Math.min(CAP, m));
      if (T[h.team.id]) per[h.team.id].push({ opp: a.team.id, m: cm, raw: hs - as, wk: ev.week?.number || 0 }); if (T[a.team.id]) per[a.team.id].push({ opp: h.team.id, m: -cm, raw: as - hs, wk: ev.week?.number || 0 });
      if (T[a.team.id] && T[h.team.id]) played.push({ a: a.team.id, h: h.team.id, as, hs, neutral, ev }); }
    else remaining.push({ a: a.team.id, h: h.team.id, wk: ev.week?.number, neutral, ev, pre: c.status?.type?.state === 'pre', teams: { [a.team.id]: a.team, [h.team.id]: h.team }, unrated: !(T[a.team.id] && T[h.team.id]) }); });
  // preseason prior (college): the AP/CFP poll stands in for team strength until each team has ~4 results
  const prior = {}; if (rkPoll) { const poll = (rkPoll.rankings || []).find(p => /ap/i.test(p.type)) || (rkPoll.rankings || [])[0]; (poll?.ranks || []).forEach(r => { if (T[r.team?.id]) prior[r.team.id] = (26 - r.current) * 0.9; }); }
  const wP = id => rkPoll ? Math.max(0, 4 - per[id].length) : 0;
  // iterate: rating = average (adjusted margin + opponent rating); K is a tiny anchor so the system stays stable
  const R = {}; ids.forEach(id => R[id] = 0);
  for (let it = 0; it < 600; it++) { const next = {}; ids.forEach(id => { const gs = per[id]; const w = wP(id); next[id] = (gs.reduce((n, g) => n + g.m + (R[g.opp] ?? UNRATED), 0) + w * (prior[id] || 0)) / (gs.length + K + w); });
    const mean = ids.reduce((n, id) => n + next[id], 0) / ids.length; let delta = 0; ids.forEach(id => { next[id] -= mean; delta += Math.abs(next[id] - R[id]); R[id] = next[id]; }); if (delta < 1e-5) break; }
  ids.forEach(id => { const r = T[id], gs = per[id].sort((x, y) => x.wk - y.wk), n = gs.length; const l3 = gs.slice(-3);
    r.srs = R[id]; r.sos = n ? gs.reduce((s, g) => s + (R[g.opp] ?? UNRATED), 0) / n : 0; r.adjMov = n ? gs.reduce((s, g) => s + g.m, 0) / n : 0; r.mov = n ? gs.reduce((s, g) => s + g.raw, 0) / n : 0;
    r.last3 = l3.length ? l3.reduce((s, g) => s + g.m + (R[g.opp] ?? UNRATED), 0) / l3.length : R[id]; r.played = n;
    const shrink = wP(id) ? 1 : n / (n + 1); // early-season regression toward average: 1 game → 50%, 6 games → 86% (college uses the poll prior instead)
    r.rating = (R[id] + 0.12 * (r.last3 - R[id])) * shrink; });
  // offense / defense split: points scored by i against j ≈ league average + off[i] + def[j] (def > 0 = allows more)
  const pts = {}; ids.forEach(id => pts[id] = []); let tot = 0, cnt = 0;
  all.filter(ev => !ev._post && ev.competitions[0].status?.type?.completed).forEach(ev => { const c = ev.competitions[0], [a, h] = byHome(c); const as = Math.min(60, scoreOf(a)), hs = Math.min(60, scoreOf(h)); const adj = c.neutralSite ? 0 : hfa / 2;
    if (T[h.team.id]) { pts[h.team.id].push({ opp: a.team.id, f: hs - adj, ag: as + adj }); tot += hs + as; cnt += 2; } if (T[a.team.id]) { pts[a.team.id].push({ opp: h.team.id, f: as + adj, ag: hs - adj }); if (!T[h.team.id]) { tot += hs + as; cnt += 2; } } });
  const AVG = cnt ? tot / cnt : 22; const OFF = {}, DEF = {}; ids.forEach(id => { OFF[id] = 0; DEF[id] = 0; }); const UO = isCFB() ? -14 : 0, UD = isCFB() ? 16 : 0;
  for (let it = 0; it < 300; it++) { let d = 0; ids.forEach(id => { const gs = pts[id]; if (!gs.length) return; const o = gs.reduce((n, g) => n + (g.f - AVG - (DEF[g.opp] ?? UD)), 0) / (gs.length + K), df = gs.reduce((n, g) => n + (g.ag - AVG - (OFF[g.opp] ?? UO)), 0) / (gs.length + K); d += Math.abs(o - OFF[id]) + Math.abs(df - DEF[id]); OFF[id] = o; DEF[id] = df; }); if (d < 1e-4) break; }
  ids.forEach(id => { const n = pts[id].length, sh = n / (n + 1); T[id].off = OFF[id] * sh; T[id].def = DEF[id] * sh; T[id].avgPts = AVG; });
  const rt = id => T[id]?.rating ?? UNRATED;
  const pWin = (home, away, neutral = false) => 1 / (1 + Math.exp(-((rt(home) - rt(away)) + (neutral ? 0 : hfa)) / PWIN_SCALE()));
  const teamOf = (id, g) => T[id]?.team || g?.teams?.[id] || { id, abbreviation: 'FCS', displayName: 'FCS opponent' };
  const v = { T, ids, played, remaining, pWin, rt, teamOf, games: all, stnd }; ratingCache = { key, t: Date.now(), v }; logPredictions(v); snapshotRatings(v); return v;
}
async function power() {
  const M = await ratingModel();
  const rows = M.ids.map(id => { const r = M.T[id]; const g = r.w + r.l + r.t; const pyth = (r.pf || r.pa) ? Math.pow(r.pf, 2.37) / (Math.pow(r.pf, 2.37) + Math.pow(r.pa, 2.37)) : .5; const pct = g ? (r.w + r.t / 2) / g : 0;
    return { ...r, g, pyth, pct, luck: pct - pyth, pythW: pyth * g, delta: ratingDelta(id) }; });
  rows.sort((a, b) => b.rating - a.rating).forEach((r, i) => r.rank = i + 1);
  const oRank = {}, dRank = {}; [...rows].sort((a, b) => b.off - a.off).forEach((r, i) => oRank[r.id] = i + 1); [...rows].sort((a, b) => a.def - b.def).forEach((r, i) => dRank[r.id] = i + 1);
  view.innerHTML = `<div class="bar"><div><h1>Power index</h1><h2>Opponent-adjusted ratings computed here from every result · in points vs. an average ${isCFB() ? 'FBS' : 'NFL'} team · not an ESPN ranking</h2></div></div>
    <div class="panel"><h3>All ${rows.length} teams<span class="pill">click a column to sort</span></h3><div class="tw"><table id="pw"><thead><tr><th class="sort" data-k="rank">#</th><th class="sort" data-k="team">Team</th><th class="num sort" data-k="rec">Record</th><th class="num sort" data-k="rating">Rating</th><th class="num sort" data-k="delta">Δ wk</th><th class="num sort" data-k="off">Offense</th><th class="num sort" data-k="def">Defense</th><th class="num sort" data-k="sos">SOS<br><small>opp rating</small></th><th class="num sort" data-k="adjMov">Adj. MOV</th><th class="num sort" data-k="mov">Raw MOV</th><th class="num sort" data-k="pf">PF/G</th><th class="num sort" data-k="pa">PA/G</th><th class="num sort" data-k="pyth">Pyth W-L</th><th class="num sort" data-k="luck">Luck</th><th class="num sort" data-k="last3">Last 3<br><small>adj. form</small></th><th class="num">STRK</th></tr></thead><tbody></tbody></table></div></div>
    <p class="note"><b>Rating</b> is a simple-rating-system number: each team's average margin (home field removed, blowouts capped at 28) plus the average rating of the opponents it played, solved so every result is judged against who it came against. Beating a +20 team by 10 counts more than beating a −15 team by 30. <b>SOS</b> is the average rating of opponents played so far, in points. <b>Adj. MOV</b> is margin after the home-field and cap adjustments; ratings are regressed toward average early in the season. ${isCFB() ? 'FCS opponents count as −30. ' : ''}<b>Offense</b> and <b>Defense</b> are the same idea solved on points scored and allowed separately: points per game above an average opponent's defense, and points per game held below an average offense (both positive = good). <b>Δ wk</b> is movement since last week's snapshot. <b>Luck</b> is actual win% minus Pythagorean expectation. The rating gap plus ${HFA()} points of home field feeds every win probability on the site. See <a class="lnk" href="#accuracy">how accurate it has been →</a></p>`;
  const table = document.getElementById('pw');
  sortable(table, rows, { rank: r => -r.rank, team: r => r.team.displayName, rec: r => r.pct, rating: r => r.rating, delta: r => r.delta ?? -99, off: r => r.off, def: r => -r.def, sos: r => r.sos, adjMov: r => r.adjMov, mov: r => r.mov, pf: r => r.g ? r.pf / r.g : 0, pa: r => r.g ? -r.pa / r.g : 0, pyth: r => r.pyth, luck: r => r.luck, last3: r => r.last3 },
    r => `<tr class="clk ${isFav(r.team.id) ? 'fav' : ''}" data-t="${esc(r.team.id)}"><td class="num">${r.rank}</td><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.displayName)} <span class="tag">${esc(r.conf)}</span></td><td class="num">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td><td class="num ${r.rating >= 0 ? 'pos' : 'neg'}"><b>${sgn(r.rating.toFixed(1))}</b></td><td class="num ${r.delta > .3 ? 'pos' : r.delta < -.3 ? 'neg' : 'muted'}">${r.delta == null ? '–' : r.delta > .3 ? '▲' + r.delta.toFixed(1) : r.delta < -.3 ? '▼' + Math.abs(r.delta).toFixed(1) : '·'}</td><td class="num">${sgn(r.off.toFixed(1))} <small class="muted">${ord(oRank[r.id])}</small></td><td class="num">${sgn((-r.def).toFixed(1))} <small class="muted">${ord(dRank[r.id])}</small></td><td class="num ${r.sos > 2 ? 'pos' : r.sos < -2 ? 'neg' : ''}">${sgn(r.sos.toFixed(1))}</td><td class="num">${sgn(r.adjMov.toFixed(1))}</td><td class="num muted">${sgn(r.mov.toFixed(1))}</td><td class="num">${r.g ? (r.pf / r.g).toFixed(1) : '–'}</td><td class="num">${r.g ? (r.pa / r.g).toFixed(1) : '–'}</td><td class="num">${r.pythW.toFixed(1)}-${(r.g - r.pythW).toFixed(1)}</td><td class="num ${r.luck > .05 ? 'pos' : r.luck < -.05 ? 'neg' : ''}">${sgn(Math.round(r.luck * 100))}%</td><td class="num">${sgn(r.last3.toFixed(1))}</td><td class="num">${esc(r.streak)}</td></tr>`, 'rating');
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
  const core = await getJSON(`${CORE}/seasons/${SEASON}/types/2/leaders?limit=${isCFB() ? 120 : 50}`, 300000).catch(() => null);
  const cc = (core?.categories || []).find(c => c.name === cat.name); if (!cc) return cat;
  const idx = await teamsIndex().catch(() => ({}));
  const known = {}; cat.leaders.forEach(l => known[l.athlete.id] = l);
  const idOf = ref => (ref?.$ref || '').match(/\/(athletes|teams)\/(\d+)/)?.[2];
  // college: ESPN mixes FCS players into the national list; keep FBS teams only (the ones the site tracks)
  const rows = cc.leaders.filter(l => l.value > 0 && (!isCFB() || idx[idOf(l.team)])).slice(0, 60);
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
/* leaders page replaced by the Player stats page (v13); #leaders redirects there */
async function leaders(cat) { const m = { passingYards: 'passing', rushingYards: 'rushing', receivingYards: 'receiving', totalTackles: 'defense', sacks: 'defense', interceptions: 'defense', fieldGoalsMade: 'kicking' }; location.replace('#stats/' + (m[cat] || LGROUPS.find(g => g[1].includes(cat))?.[0]?.toLowerCase() || 'passing')); }

/* =====================================================================
   v13 · PLAYER STATS: full season tables built from every box score (NFL),
   or merged ESPN leaderboards (college)
   ===================================================================== */
function boxLines(summary) {
  const out = {}; const g = (c, p, l) => { const i = c.labels.indexOf(l); return i < 0 ? 0 : num(p.stats[i]); }; const sp = (c, p, l) => String(p.stats[c.labels.indexOf(l)] || '0/0').split(/[\/-]/).map(num);
  (summary.boxscore?.players || []).forEach(side => side.statistics.forEach(c => c.athletes.forEach(p => { const r = (out[p.athlete.id] ||= { n: p.athlete.displayName, pos: p.athlete.position?.abbreviation || '', tid: side.team.id });
    if (c.name === 'passing') { const ca = sp(c, p, 'C/ATT'), sk = sp(c, p, 'SACKS'); r.pa = [ca[0], ca[1], g(c, p, 'YDS'), g(c, p, 'TD'), g(c, p, 'INT'), sk[0], sk[1]]; }
    if (c.name === 'rushing') r.ru = [g(c, p, 'CAR'), g(c, p, 'YDS'), g(c, p, 'TD'), g(c, p, 'LONG')];
    if (c.name === 'receiving') r.re = [g(c, p, 'TGTS'), g(c, p, 'REC'), g(c, p, 'YDS'), g(c, p, 'TD'), g(c, p, 'LONG')];
    if (c.name === 'defensive') r.de = [g(c, p, 'TOT'), g(c, p, 'SOLO'), g(c, p, 'SACKS'), g(c, p, 'TFL'), g(c, p, 'PD'), g(c, p, 'QB HTS'), g(c, p, 'TD')];
    if (c.name === 'interceptions') r.in = [g(c, p, 'INT'), g(c, p, 'YDS'), g(c, p, 'TD')];
    if (c.name === 'fumbles') r.fu = [g(c, p, 'FUM'), g(c, p, 'LOST'), g(c, p, 'REC')];
    if (c.name === 'kicking') { const fg = sp(c, p, 'FG'), xp = sp(c, p, 'XP'); r.ki = [fg[0], fg[1], g(c, p, 'LONG'), xp[0], xp[1], g(c, p, 'PTS')]; }
    if (c.name === 'punting') r.pu = [g(c, p, 'NO'), g(c, p, 'YDS'), g(c, p, 'TB'), g(c, p, 'In 20'), g(c, p, 'LONG')];
    if (c.name === 'kickReturns') r.kr = [g(c, p, 'NO'), g(c, p, 'YDS'), g(c, p, 'TD'), g(c, p, 'LONG')];
    if (c.name === 'puntReturns') r.pr = [g(c, p, 'NO'), g(c, p, 'YDS'), g(c, p, 'TD'), g(c, p, 'LONG')];
  }))); return out;
}
let statsCache = null, statsLoading = null;
const STAT_SCOPES = () => [['top25', 'Top 25'], ['p4', 'Power 4'], ...CONF_KEYS.map((k, i) => [k, P4[i][0]]), ['all', 'All FBS']];
function scopeFilter(scope, idx) {
  if (!isCFB() || !scope || scope === 'all') return () => true;
  const confKey = tid => { const t = idx[tid]; const i = t ? p4Index({ name: t.confName || t.conf, abbreviation: t.conf }) : -1; return i >= 0 ? CONF_KEYS[i] : ''; };
  return ev => ev.competitions[0].competitors.some(c => scope === 'top25' ? num(c.curatedRank?.current) > 0 && num(c.curatedRank.current) <= 25 : scope === 'p4' ? !!confKey(c.team.id) : confKey(c.team.id) === scope);
}
async function seasonStats(onProgress, scope = '') {
  const key = LEAGUE.key + ':' + SEASON + ':' + scope; if (statsCache?.key === key && Date.now() - statsCache.t < 45000) return statsCache.v; if (statsLoading?.key === key) return statsLoading.p;
  const p = (async () => {
    const idx = await teamsIndex().catch(() => ({})); const all = (await seasonGames()).filter(e => !e._post && e.status?.type?.state !== 'pre').filter(scopeFilter(scope, idx)); let done = 0; const agg = {}; let live = 0;
    const add = (dst, src, k) => { if (!src[k]) return; dst[k] = dst[k] || src[k].map(() => 0); src[k].forEach((v, i) => { if (k === 'ru' && i === 3 || k === 're' && i === 4 || k === 'ki' && i === 2 || k === 'pu' && i === 4 || k === 'kr' && i === 3 || k === 'pr' && i === 3) dst[k][i] = Math.max(dst[k][i], v); else dst[k][i] += v; }); };
    const work = async ev => { try { const L = (await gameLines(ev)).s || {}; if (ev.status.type.state === 'in') live++;
        Object.entries(L).forEach(([pid, r]) => { const a = (agg[pid] ||= { id: pid, name: r.n, pos: r.pos, tid: r.tid, gp: 0, live: false }); a.gp++; a.tid = r.tid; if (r.pos) a.pos = r.pos; if (ev.status.type.state === 'in') a.live = true; ['pa', 'ru', 're', 'de', 'in', 'fu', 'ki', 'pu', 'kr', 'pr'].forEach(k => add(a, r, k)); }); } catch {} done++; onProgress?.(done / all.length); };
    for (let i = 0; i < all.length; i += 12) await Promise.all(all.slice(i, i + 12).map(work));
    const v = { rows: Object.values(agg), games: all.length, live }; statsCache = { key, t: Date.now(), v }; statsLoading = null; return v;
  })(); statsLoading = { key, p }; return p;
}
const passerRating = (cmp, att, yds, td, int) => { if (!att) return 0; const cl = v => Math.max(0, Math.min(2.375, v)); return (cl((cmp / att - .3) * 5) + cl((yds / att - 3) * .25) + cl(td / att * 20) + cl(2.375 - int / att * 25)) / 6 * 100; };
const STAT_CATS = {
  passing: { name: 'Passing', key: 'pa', main: 'yds', qual: (r, w) => r.att >= 10 * w, derive: r => { const [cmp, att, yds, td, int, sk, skY] = r.pa; return { cmp, att, yds, td, int, sk, skY, cmpPct: att ? cmp / att * 100 : 0, ya: att ? yds / att : 0, rtg: passerRating(cmp, att, yds, td, int), ypg: yds / r.gp, rushYds: r.ru?.[1] || 0, rushTd: r.ru?.[2] || 0 }; },
    cols: [['GP', 'gp'], ['CMP', 'cmp'], ['ATT', 'att'], ['CMP%', 'cmpPct', 1], ['YDS', 'yds'], ['Y/A', 'ya', 1], ['TD', 'td'], ['INT', 'int', 0, 'low'], ['SACK', 'sk', 0, 'low'], ['RTG', 'rtg', 1], ['YDS/G', 'ypg', 1], ['RUSH YDS', 'rushYds'], ['RUSH TD', 'rushTd']], perGame: ['cmp', 'att', 'yds', 'td', 'int', 'sk', 'rushYds', 'rushTd'] },
  rushing: { name: 'Rushing', key: 'ru', main: 'yds', qual: (r, w) => r.car >= (r.pos === 'RB' ? 6 : 3) * w, derive: r => { const [car, yds, td, lng] = r.ru; return { car, yds, td, lng, avg: car ? yds / car : 0, ypg: yds / r.gp, rec: r.re?.[1] || 0, recYds: r.re?.[2] || 0, scrim: yds + (r.re?.[2] || 0), tdAll: td + (r.re?.[3] || 0), fum: r.fu?.[1] || 0 }; },
    cols: [['GP', 'gp'], ['CAR', 'car'], ['YDS', 'yds'], ['AVG', 'avg', 1], ['TD', 'td'], ['LONG', 'lng'], ['YDS/G', 'ypg', 1], ['REC', 'rec'], ['REC YDS', 'recYds'], ['SCRIM', 'scrim'], ['TOTAL TD', 'tdAll'], ['FUM L', 'fum', 0, 'low']], perGame: ['car', 'yds', 'td', 'rec', 'recYds', 'scrim', 'tdAll'] },
  receiving: { name: 'Receiving', key: 're', main: 'yds', qual: (r, w) => r.tgt >= (/^(WR|TE)$/.test(r.pos) ? 3 : 1.5) * w, derive: r => { const [tgt, rec, yds, td, lng] = r.re; return { tgt, rec, yds, td, lng, avg: rec ? yds / rec : 0, catchPct: tgt ? rec / tgt * 100 : 0, ypg: yds / r.gp, ypt: tgt ? yds / tgt : 0, rushYds: r.ru?.[1] || 0, scrim: yds + (r.ru?.[1] || 0) }; },
    cols: [['GP', 'gp'], ['TGT', 'tgt'], ['REC', 'rec'], ['YDS', 'yds'], ['AVG', 'avg', 1], ['TD', 'td'], ['LONG', 'lng'], ['CATCH%', 'catchPct', 1], ['Y/TGT', 'ypt', 1], ['YDS/G', 'ypg', 1], ['RUSH YDS', 'rushYds'], ['SCRIM', 'scrim']], perGame: ['tgt', 'rec', 'yds', 'td', 'rushYds', 'scrim'] },
  defense: { name: 'Defense', key: 'de', main: 'tot', qual: (r, w) => r.tot >= 2 * w, derive: r => { const [tot, solo, sk, tfl, pd, qbh, td] = r.de; return { tot, solo, ast: tot - solo, sk, tfl, pd, qbh, int: r.in?.[0] || 0, intYds: r.in?.[1] || 0, fr: r.fu?.[2] || 0, dtd: td + (r.in?.[2] || 0), tpg: tot / r.gp }; },
    cols: [['GP', 'gp'], ['TOT', 'tot'], ['SOLO', 'solo'], ['AST', 'ast'], ['TKL/G', 'tpg', 1], ['SACKS', 'sk', 1], ['TFL', 'tfl'], ['PD', 'pd'], ['QB HITS', 'qbh'], ['INT', 'int'], ['INT YDS', 'intYds'], ['FR', 'fr'], ['TD', 'dtd']], perGame: ['tot', 'solo', 'ast', 'sk', 'tfl', 'pd', 'qbh'] },
  kicking: { name: 'Kicking', key: 'ki', main: 'pts', qual: (r, w) => r.fga + r.xpa >= 2 * w, derive: r => { const [fgm, fga, lng, xpm, xpa, pts] = r.ki; return { fgm, fga, lng, xpm, xpa, pts, fgPct: fga ? fgm / fga * 100 : 0, xpPct: xpa ? xpm / xpa * 100 : 0, ppg: pts / r.gp }; },
    cols: [['GP', 'gp'], ['FGM', 'fgm'], ['FGA', 'fga'], ['FG%', 'fgPct', 1], ['LONG', 'lng'], ['XPM', 'xpm'], ['XPA', 'xpa'], ['XP%', 'xpPct', 1], ['PTS', 'pts'], ['PTS/G', 'ppg', 1]], perGame: ['fgm', 'fga', 'xpm', 'xpa', 'pts'] },
  punting: { name: 'Punting', key: 'pu', main: 'avg', qual: (r, w) => r.no >= 2 * w, derive: r => { const [no, yds, tb, in20, lng] = r.pu; return { no, yds, tb, in20, lng, avg: no ? yds / no : 0, in20Pct: no ? in20 / no * 100 : 0 }; },
    cols: [['GP', 'gp'], ['PUNTS', 'no'], ['YDS', 'yds'], ['AVG', 'avg', 1], ['LONG', 'lng'], ['IN 20', 'in20'], ['IN 20%', 'in20Pct', 1], ['TB', 'tb', 0, 'low']], perGame: ['no', 'yds', 'in20', 'tb'] },
  returns: { name: 'Returns', key: 'kr', alt: 'pr', main: 'totYds', qual: (r, w) => r.krNo + r.prNo >= w, derive: r => { const kr = r.kr || [0, 0, 0, 0], pr = r.pr || [0, 0, 0, 0]; return { krNo: kr[0], krYds: kr[1], krAvg: kr[0] ? kr[1] / kr[0] : 0, krTd: kr[2], krLng: kr[3], prNo: pr[0], prYds: pr[1], prAvg: pr[0] ? pr[1] / pr[0] : 0, prTd: pr[2], prLng: pr[3], totYds: kr[1] + pr[1], td: kr[2] + pr[2] }; },
    cols: [['GP', 'gp'], ['KR', 'krNo'], ['KR YDS', 'krYds'], ['KR AVG', 'krAvg', 1], ['KR LONG', 'krLng'], ['PR', 'prNo'], ['PR YDS', 'prYds'], ['PR AVG', 'prAvg', 1], ['PR LONG', 'prLng'], ['RET YDS', 'totYds'], ['TD', 'td']], perGame: ['krNo', 'krYds', 'prNo', 'prYds', 'totYds'] },
};
const guessPos = r => r.pa && r.pa[1] >= 5 ? 'QB' : r.ki ? 'K' : r.pu ? 'P' : r.de && (!r.re || r.de[0] > (r.re[1] || 0)) ? 'DEF' : r.ru && r.ru[0] > (r.re?.[1] || 0) ? 'RB' : r.re ? 'WR' : '';
async function stats(cat, sub) {
  const C = STAT_CATS[cat] || STAT_CATS.passing; cat = C === STAT_CATS[cat] ? cat : 'passing';
  const scope = isCFB() ? (STAT_SCOPES().some(x => x[0] === sub) ? sub : store.get(LK('statsScope'), 'top25')) : ''; if (isCFB()) store.set(LK('statsScope'), scope);
  view.innerHTML = `<div class="bar"><div><h1>Player stats</h1><h2>Building season totals from every box score…${scope === 'all' ? ' (all of FBS: this first load takes a minute)' : ''}</h2></div></div><div class="prog" id="sp"><i style="width:0"></i></div><div class="panel"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
  const [data, idx, calF] = await Promise.all([seasonStats(p => { const b = document.querySelector('#sp i'); if (b) b.style.width = p * 100 + '%'; }, scope), teamsIndex(), seasonCalendar().catch(() => null)]);
  const roster = await allRosters().catch(() => []); const byId = {}; roster.forEach(p => byId[p.id] = p);
  const wk = Math.max(1, (calF?.cur || 1) - (data.live ? 0 : 1));
  const build = data => data.rows.filter(r => r[C.key] || (C.alt && r[C.alt])).map(r => { const base = { ...r, [C.key]: r[C.key] || null }; if (C.alt && !base[C.key]) base[C.key] = [0, 0, 0, 0]; const d = C.derive(base); const rp = byId[r.id]; const pos = rp?.pos || r.pos || guessPos(r); const team = idx[rp?.team?.id || r.tid] || idx[r.tid] || { id: r.tid, abbreviation: '' }; return { ...r, ...d, pos, team, hs: rp?.hs || hsOf({ id: r.id }), rookie: isRookie(rp) }; });
  let rows = build(data);
  const positions = [...new Set(rows.map(r => r.pos).filter(Boolean))].sort(); const teams = [...new Set(rows.map(r => r.team?.id).filter(Boolean))].map(id => idx[id]).filter(Boolean).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  const S = { sort: C.main, dir: -1, pos: '', team: '', q: '', qual: true, pg: false, shown: 100, rookies: false };
  view.innerHTML = `<div class="bar"><div><h1>Player stats</h1><h2>${SEASON} season · ${isCFB() ? (STAT_SCOPES().find(x => x[0] === scope)?.[1] || '') + ' games · every player in them' : 'every player, every game'}<span id="slive">${data.live ? ` · <span class="pos"><span class="dot"></span>${data.live} live game${data.live > 1 ? 's' : ''} · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>` : ''}</span></h2></div><div class="row"><a class="chip" href="#records">Records watch</a><a class="chip" href="#fantasy/season">Fantasy</a><button class="chip" id="sharetop">Share top 10</button><button class="chip" id="srefresh" title="Re-read the box scores">↻ Refresh</button></div></div>
    <div class="lgroups">${Object.entries(STAT_CATS).map(([k, c]) => `<a class="${k === cat ? 'on' : ''}" href="#stats/${k}${scope ? '/' + scope : ''}">${c.name}</a>`).join('')}</div>
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s3)"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;align-self:center">Games from</span>${STAT_SCOPES().map(([k, l]) => `<a class="chip ${k === scope ? 'on' : ''}" href="#stats/${cat}/${k}">${l}</a>`).join('')}</div>` : ''}
    <div class="panel"><div class="lfilters"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em">Pos</span><button class="chip on" data-pos="">All</button>${positions.map(p => `<button class="chip" data-pos="${esc(p)}">${esc(p)}</button>`).join('')}${roster.length ? '<button class="chip" id="rook">Rookies</button>' : ''}
        <select id="steam" aria-label="Team" style="margin-left:auto"><option value="">All teams</option>${teams.map(t => `<option value="${esc(t.id)}">${esc(t.abbreviation)}</option>`).join('')}</select><input id="sq" placeholder="Find a player" aria-label="Find a player" style="padding:5px 8px;font-size:13px;width:150px"></div>
      <div class="lfilters" style="border-top:1px solid var(--line)"><label class="row" style="font-size:13px"><input type="checkbox" id="squal" checked> Qualified only</label><label class="row" style="font-size:13px"><input type="checkbox" id="spg"> Per game</label><span class="muted" style="font-size:12px;margin-left:auto" id="scount"></span></div>
      <div class="tw"><table id="st" class="stats"><thead><tr><th>#</th><th>Player</th>${C.cols.map(([l, k, dec, low]) => `<th class="num sort ${k === S.sort ? 'sorted' : ''}" data-k="${k}" title="${low ? 'lower is better' : ''}">${l}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
      <div class="empty" id="smore" style="padding:12px"><button class="chip" id="smorebtn">Show all</button></div></div>
    <p class="note">Season totals are summed from ESPN's box score for every game${isCFB() ? ' in the selected scope (a player\'s games outside it are not counted, so pick the team\'s own conference or All FBS for true season totals)' : ''}, so they include games in progress and update in place while games are on (sorting and filters stay as you set them). Qualified = roughly ${C.name === 'Passing' ? '10 attempts' : C.name === 'Rushing' ? '6 carries (3 for non-RBs)' : C.name === 'Receiving' ? '3 targets for WR/TE, 1.5 for backs and others' : C.name === 'Defense' ? '2 tackles' : 'regular use'} per team game; untick it to see everyone. RTG is the NFL passer rating formula. Click a column to sort; click again to flip.</p>`;
  const fmt = (r, [l, k, dec]) => { let v = r[k]; if (S.pg && C.perGame.includes(k)) { v = v / r.gp; dec = 1; } return dec ? v.toFixed(dec) : String(Math.round(v)); };
  const filt = () => rows.filter(r => (!S.pos || r.pos === S.pos) && (!S.team || r.team?.id === S.team) && (!S.rookies || r.rookie) && (!S.qual || C.qual(r, wk)) && (!S.q || (r.name + ' ' + (r.team?.abbreviation || '')).toLowerCase().includes(S.q)));
  const val = (r, k) => S.pg && C.perGame.includes(k) ? r[k] / r.gp : r[k];
  const draw = () => { const list = filt().sort((a, b) => (val(b, S.sort) - val(a, S.sort)) * -S.dir || b[C.main] - a[C.main]); const lim = S.q ? 300 : S.shown;
    document.getElementById('st').querySelector('tbody').innerHTML = list.slice(0, lim).map((r, i) => `<tr class="clk ${isFav(r.team?.id) ? 'fav' : ''}" data-p="${esc(r.id)}"><td class="num muted">${i + 1}</td><td class="tm"><img src="${esc(r.hs)}" alt="" style="border-radius:50%" loading="lazy" onerror="this.style.visibility='hidden'"><div class="sp"><b>${esc(r.name)}${r.live ? ' <span class="dot" title="playing now"></span>' : ''}</b><small>${esc(r.pos)} · <img src="${esc(logo(r.team))}" alt="">${esc(r.team?.abbreviation || '')}${r.rookie ? ' · <em class="rk">R</em>' : ''}</small></div></td>${C.cols.map(c => `<td class="num ${c[1] === S.sort ? 'sorted' : ''}">${fmt(r, c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${C.cols.length + 2}" class="empty">No players match.</td></tr>`;
    document.getElementById('scount').textContent = `${list.length} players · ${data.games} games`; document.getElementById('smore').hidden = list.length <= lim; document.querySelectorAll('#st th[data-k]').forEach(th => th.classList.toggle('sorted', th.dataset.k === S.sort)); wire(); };
  draw();
  view.querySelectorAll('#st th[data-k]').forEach(th => th.onclick = () => { const low = C.cols.find(c => c[1] === th.dataset.k)?.[3] === 'low'; if (S.sort === th.dataset.k) S.dir = -S.dir; else { S.sort = th.dataset.k; S.dir = low ? 1 : -1; } draw(); });
  view.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { S.pos = b.dataset.pos; view.querySelectorAll('[data-pos]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const rk = document.getElementById('rook'); if (rk) rk.onclick = () => { S.rookies = !S.rookies; rk.classList.toggle('on', S.rookies); draw(); };
  document.getElementById('steam').onchange = e => { S.team = e.target.value; draw(); }; document.getElementById('sq').oninput = e => { S.q = e.target.value.toLowerCase(); draw(); };
  document.getElementById('squal').onchange = e => { S.qual = e.target.checked; draw(); }; document.getElementById('spg').onchange = e => { S.pg = e.target.checked; draw(); };
  document.getElementById('smorebtn').onclick = () => { S.shown = 5000; draw(); };
  document.getElementById('sharetop').onclick = () => { const list = filt().sort((a, b) => val(b, S.sort) - val(a, S.sort)).slice(0, 10); const col = C.cols.find(c => c[1] === S.sort); shareCard({ title: `${C.name} · ${col?.[0] || S.sort} leaders`, sub: `${SEASON} ${LEAGUE.name}${S.pos ? ' · ' + S.pos : ''}${S.pg ? ' · per game' : ''}`, rows: list.map((r, i) => ({ left: `${i + 1}. ${r.name}`, mid: `${r.pos} · ${r.team?.abbreviation || ''} · ${r.gp} GP`, right: fmt(r, col || C.cols[0]), hl: i === 0 })) }); };
  // refresh in place: re-read the box scores in the background, then redraw the rows without touching sort, filters or scroll
  let refreshing = false;
  const rebuild = async () => { if (refreshing) return; refreshing = true; const btn = document.getElementById('srefresh'); if (btn) btn.textContent = '↻ Updating…';
    try { statsCache = null; const d = await seasonStats(null, scope); data.rows = d.rows; data.games = d.games; data.live = d.live; rows = build(d); draw(); const sl = document.getElementById('slive'); if (sl) sl.innerHTML = d.live ? ` · <span class="pos"><span class="dot"></span>${d.live} live game${d.live > 1 ? 's' : ''} · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>` : ''; if (!d.live) { clearInterval(refreshTimer); refreshTimer = null; pollFn = null; } } catch {}
    refreshing = false; const b2 = document.getElementById('srefresh'); if (b2) b2.textContent = '↻ Refresh'; };
  document.getElementById('srefresh').onclick = rebuild;
  if (data.live) poll(rebuild, false);
}

/* ---------- players (search) ---------- */
async function players(q0) {
  view.innerHTML = `<div class="bar"><div><h1>Players</h1><h2>Current rosters plus every player in ESPN's database (game logs from 2000)</h2></div><div class="row"><input id="ps" placeholder="Name, team or position (e.g. Mahomes, KC, WR)" aria-label="Search players" style="min-width:min(100%,300px)">${isCFB() ? '' : '<select id="dclass" aria-label="Draft class"><option value="">Draft class…</option></select>'}</div></div>
    <div class="prog" id="rp"><i style="width:0"></i></div>
    <div class="panel" style="margin-top:14px"><h3 id="pcount">Loading rosters…</h3><div class="plist" id="plist"></div></div>`;
  const input = document.getElementById('ps'); input.value = decodeURIComponent(q0 || ''); input.focus();
  const list = isCFB() ? [] : await allRosters(p => { const b = document.querySelector('#rp i'); if (b) b.style.width = p * 100 + '%'; });
  document.getElementById('rp')?.remove();
  const dsel = document.getElementById('dclass'); if (dsel) { const yrs = [...new Set(list.map(p => p.dy).filter(Boolean))].sort((a, b) => b - a); dsel.innerHTML = '<option value="">Draft class…</option>' + yrs.map(y => `<option value="${y}">${y} class${y === SEASON ? ' (rookies)' : ''}</option>`).join(''); }
  let seq = 0, timer;
  const render = async () => {
    const q = input.value.trim().toLowerCase(); const el = document.getElementById('plist'); if (!el) return; const my = ++seq;
    const dy = Number(dsel?.value || 0);
    if (dy && !q) { document.getElementById('pcount').textContent = `${dy} draft class · ${list.filter(p => p.dy === dy).length} on current rosters`; el.innerHTML = draftClassHTML(list, dy); return; }
    const hits = (q ? list.filter(p => (p.name + ' ' + p.team.abbreviation + ' ' + p.team.displayName + ' ' + p.pos).toLowerCase().includes(q)) : list.filter(p => isFav(p.team.id))).filter(p => !dy || p.dy === dy);
    document.getElementById('pcount').textContent = isCFB() ? (q ? 'Results' : 'Type a player name') : q ? `${hits.length} on current rosters` : favs.length ? `${hits.length} on your teams` : `${list.length} players loaded · type a name (current or past players)`;
    const rowHTML = p => `<a href="#player/${esc(p.id)}"><img src="${esc(p.hs)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b> <span class="muted">#${esc(p.jersey)} ${esc(p.pos)} · ${esc(p.team.displayName)}</span>${p.inj ? ' ' + injTag(p.inj) : ''}</span><img src="${esc(logo(p.team))}" alt="" style="border-radius:0;object-fit:contain"></a>`;
    el.innerHTML = hits.slice(0, 80).map(rowHTML).join('') + (q.length >= 2 ? '<div class="hd" id="alltime" style="padding:10px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">Searching all players since 2000…</div>' : '');
    if (q.length < 2) return;
    const seenIds = new Set(hits.map(p => p.id));
    const remote = (await searchAthletes(q, 20).catch(() => [])).filter(p => !seenIds.has(p.id));
    if (my !== seq) return; const at = document.getElementById('alltime'); if (!at) return;
    at.outerHTML = remote.length ? `<div class="hd" style="padding:10px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">All-time players</div>` + remote.map(p => `<a href="#player/${esc(p.id)}"><img src="${esc(p.hs)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b> <span class="muted">${esc(p.sub)}</span></span><span class="tag">past / other</span></a>`).join('') : (hits.length ? '' : '<div class="empty">No players found. Try a last name.</div>');
  };
  render(); input.oninput = () => { clearTimeout(timer); timer = setTimeout(render, 220); }; if (dsel) dsel.onchange = render;
}

/* ---------- player page ---------- */
async function player(id, tab = 'season') {
  const [bio, gl, ov, inj, career] = await Promise.all([getJSON(`${WEB}/athletes/${id}`, 600000), getJSON(`${WEB}/athletes/${id}/gamelog?season=${SEASON}`, 120000).catch(() => null), getJSON(`${WEB}/athletes/${id}/overview`, 600000).catch(() => null), getJSON(`${API}/injuries`, 300000).catch(() => null), getJSON(`${WEB}/athletes/${id}/stats`, 3600000).catch(() => null)]);
  const p = bio.athlete; const t = p.team || {};
  const myInj = inj?.injuries?.flatMap(tm => tm.injuries || []).find(i => String(i.athlete?.id) === String(id) || i.athlete?.displayName === p.displayName);
  let glHTML = '', trendHTML = '', splitHTML = '', glRows = [];
  if (gl?.events && gl.seasonTypes?.length) {
    const labels = gl.labels || [], names = gl.names || [];
    const rows = gl.seasonTypes.flatMap(s => (s.categories || []).flatMap(c => (c.events || []).map(e => ({ ...gl.events[e.eventId], stats: e.stats }))));
    rows.sort((a, b) => (a.week ?? 0) - (b.week ?? 0)); glRows = rows;
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
    if (liveRow && !refreshTimer) poll(() => player(id, (location.hash.split('/')[2]) || 'season'), false);
    const ki = Math.max(0, names.findIndex(n => /yards|tackles|sacks|interceptions|fieldGoalsMade/i.test(n) && !/perGame|avg|long/i.test(n)));
    if (rows.length >= 2) {
      const numCols = labels.map((l, i) => [String(i), gl.displayNames?.[i] || l]).filter(([i]) => rows.some(r => /^-?\d/.test(String(r.stats?.[i] ?? '')) && !/\//.test(String(r.stats?.[i]))));
      const fp = rows.map(r => fantasyFromLog(names, r.stats || [])); const opts = [...(fp.some(v => v != null) ? [['fpts', 'Fantasy pts (half PPR)']] : []), ...numCols];
      const pick = opts.find(o => o[0] === store.get('ptrend', '')) || opts.find(o => o[0] === String(ki)) || opts[0];
      const vals = pick ? (pick[0] === 'fpts' ? fp.map(v => v ?? 0) : rows.map(r => num(r.stats?.[pick[0]]))) : [];
      trendHTML = pick ? `<div class="panel"><h3>Trend by week<select id="ptrend" aria-label="Stat" style="padding:3px 8px;font-size:12px">${opts.map(o => `<option value="${esc(o[0])}" ${o === pick ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></h3><div class="chart">${trendChart(vals, rows.map(r => 'W' + r.week))}</div><div class="legend"><span><i></i>Per game</span><span><i class="b"></i>3-game average</span><span><i style="background:var(--muted)"></i>Season average</span></div></div>` : '';
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
    <div class="stack">${trendHTML}${splitHTML}<div id="usage"></div>${newsHTML ? `<div class="panel"><h3>News</h3>${newsHTML}</div>` : ''}</div></div>`}`;
  const pt = document.getElementById('ptrend'); if (pt) pt.onchange = e => { store.set('ptrend', e.target.value); player(id, tab); };
  if (tab !== 'career' && glRows.length && t.id && /^(RB|WR|TE|FB|HB)$/.test(p.position?.abbreviation || '')) usageHTML(id, String(t.id), glRows).then(h => { const el = document.getElementById('usage'); if (el && h) { el.outerHTML = h; wire(); } }).catch(() => {});
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
  if ((!stnd || !inj) && !team.warmed) { team.warmed = true; Promise.all([standingsL3().catch(() => null), getJSON(`${API}/injuries`, 300000).catch(() => null)]).then(() => { if (location.hash.startsWith(`#team/${id}`)) team(id, (location.hash.split('/')[2]) || tab).catch(() => {}); }); }
  let rec = t.record?.items?.find(r => r.type === 'total') || t.record?.items?.[0];
  try { const cr = (await computedRecords())[String(id)]; if (cr && (!rec || cr.g > recOf({ stats: rec.stats || [] }).w + recOf({ stats: rec.stats || [] }).l + recOf({ stats: rec.stats || [] }).t)) rec = { ...(rec || {}), summary: cr.overall, stats: [...(rec?.stats || []).filter(s => s.name !== 'streak'), { name: 'streak', displayValue: cr.streak }] }; } catch {}
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
      <div style="margin-left:auto;text-align:right"><div class="rec">${esc(rec?.summary || '')}</div><div class="row" style="justify-content:flex-end"><button class="chip" id="sharebtn">Share card</button><button class="chip gold ${mine ? 'on' : ''}" id="favbtn">${mine ? '★ My team' : '☆ Add to my teams'}</button></div></div></div>
    <div class="panel" style="margin-bottom:14px"><div class="kpis">
      <div class="kpi"><small>Points for</small><b>${pf}</b></div><div class="kpi"><small>Points against</small><b>${pa}</b></div>
      <div class="kpi"><small>Diff</small><b class="${pf - pa >= 0 ? 'pos' : 'neg'}">${sgn(pf - pa)}</b></div><div class="kpi"><small>PPG / PAPG</small><b>${played.length ? (pf / played.length).toFixed(1) + ' / ' + (pa / played.length).toFixed(1) : '–'}</b></div>
      <div class="kpi"><small>Home / Away</small><b>${wl(home)} / ${wl(away)}</b></div><div class="kpi"><small>Streak</small><b>${esc(rs('streak'))}</b></div><div class="kpi"><small>Last 5</small><div class="form">${form || '<span class="muted">–</span>'}</div></div>
    </div></div>
    <div class="tabs">${[['schedule','Schedule'],['dash','Dashboard'],['stats','Team profile'],['roster','Roster'],['injuries',`Injuries (${tInj.length})`],...(LEAGUE.key === 'nfl' ? [['moves','Moves']] : [])].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="two"><div class="stack" id="ttab"></div><div class="stack">
      ${next ? `<div class="panel"><h3>${next.state === 'in' ? 'Live now' : 'Next game'}</h3><a class="next" href="#game/${esc(next.ev.id)}"><img src="${esc(logo(next.op.team))}" alt=""><div><b>${next.me.homeAway === 'home' ? 'vs' : '@'} ${esc(next.op.team.displayName)}</b><div class="muted">${next.state === 'in' ? esc(next.c.status?.type?.shortDetail || '') : esc(fmtDate(next.ev.date))}${next.c.broadcasts?.[0]?.names?.length ? ' · ' + esc(next.c.broadcasts[0].names.join('/')) : ''}</div></div></a></div>` : ''}
      ${played.length ? `<div class="panel"><h3>Margin by game</h3><div class="chart">${marginChart(played)}</div></div>` : ''}
      <div id="remsched"></div>
      <div id="coachbox"></div>
      ${next ? `<div class="panel" id="h2hpanel"><h3>Series vs ${esc(next.op.team.abbreviation)}</h3><div class="empty" style="padding:12px"><button class="chip" id="h2hbtn">Every meeting since 2000 →</button></div></div>` : ''}
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
  } else if (tab === 'dash') {
    // the schedule feed has no quarter scores; the week scoreboards do
    try { const byId = {}; (await seasonGames()).forEach(ev => byId[ev.id] = ev); played.forEach(g => { const sc = byId[g.ev.id]?.competitions?.[0]?.competitors || []; const me = sc.find(x => x.team.id === String(id)), op = sc.find(x => x.team.id !== String(id)); const ok = l => (l || []).length >= 2 && l.some(x => num(x.value ?? x.displayValue) > 0); if (ok(me?.linescores) && ok(op?.linescores)) { g.me.linescores = me.linescores; g.op.linescores = op.linescores; } }); } catch {}
    tt.innerHTML = teamDashHTML(String(id), games, played, stnd, await teamsIndex().catch(() => ({})));
  } else if (tab === 'moves') {
    tt.innerHTML = '<div class="panel"><div class="skel"></div></div>';
    const [list, idx] = await Promise.all([transactionsFeed().catch(() => []), teamsIndex()]); const mine = list.filter(x => x.team?.id === String(id));
    tt.innerHTML = `<div class="panel"><h3>Transactions<span class="pill">${mine.length} recent moves</span></h3><div class="plist">${transRows(mine, idx) || '<div class="empty">No recent moves on ESPN\'s wire.</div>'}</div></div>`;
  } else {
    tt.innerHTML = tInj.length ? `<div class="panel"><h3>Injury report</h3><div class="plist">${tInj.map(i => `<a href="#player/${esc(i.athlete?.id || (i.athlete?.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || '')}"><img src="${esc(hsOf(i.athlete))}" alt=""><span><b>${esc(i.athlete?.displayName)}</b> <span class="muted">${esc(i.athlete?.position?.abbreviation || '')}</span> ${injTag(i.status)}<br><span class="muted" style="font-size:12px">${esc(i.details?.type || i.type?.description || '')}${i.details?.returnDate ? ' · return ' + esc(fmtDay(i.details.returnDate)) : ''}${i.shortComment ? ' · ' + esc(i.shortComment) : ''}</span></span><span class="muted" style="font-size:12px">${esc(ago(i.date))}</span></a>`).join('')}</div></div>` : '<div class="panel"><div class="empty">No injuries reported.</div></div>';
  }
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', `#team/${id}/${b.dataset.tab}`); team(id, b.dataset.tab); });
  wire();
  if (isCur()) buildModel().then(M => { const el = document.getElementById('remsched'); if (!el) return; const rem = M.remaining.filter(g => g.a === String(id) || g.h === String(id)).sort((x, y) => (x.wk || 0) - (y.wk || 0));
    const rows = rem.map(g => { const home = g.h === String(id); const op = home ? g.a : g.h; const p = home ? M.pWin(g.h, g.a, g.neutral) : 1 - M.pWin(g.h, g.a, g.neutral); return { g, home, op, p }; });
    const xw = rows.reduce((n, r) => n + r.p, 0); const sos = rows.length ? rows.reduce((n, r) => n + M.rt(r.op), 0) / rows.length : 0;
    const hist = store.get(LK('oddsHist:' + SEASON), {}); const pts = Object.keys(hist).map(Number).sort((a, b) => a - b).filter(w => hist[w][id] != null);
    const me = M.T[String(id)]; const oR = me ? [...M.ids].sort((a, b) => M.T[b].off - M.T[a].off).indexOf(String(id)) + 1 : 0, dR = me ? [...M.ids].sort((a, b) => M.T[a].def - M.T[b].def).indexOf(String(id)) + 1 : 0;
    const ratingBox = me ? `<div class="panel"><h3>Power index<span class="pill">rank ${[...M.ids].sort((a, b) => M.T[b].rating - M.T[a].rating).indexOf(String(id)) + 1} of ${M.ids.length}</span></h3><div class="kpis"><div class="kpi"><small>Rating</small><b class="${me.rating >= 0 ? 'pos' : 'neg'}">${sgn(me.rating.toFixed(1))}</b></div><div class="kpi"><small>Offense</small><b>${sgn(me.off.toFixed(1))} <small class="muted">${ord(oR)}</small></b></div><div class="kpi"><small>Defense</small><b>${sgn((-me.def).toFixed(1))} <small class="muted">${ord(dR)}</small></b></div><div class="kpi"><small>SOS</small><b>${sgn(me.sos.toFixed(1))}</b></div></div></div>` : '';
    el.outerHTML = ratingBox + ratingHistoryHTML(String(id)) + '<div id="finish"></div><div id="changes"></div>' + (rows.length ? `<div class="panel"><h3>Remaining schedule<span class="pill">${xw.toFixed(1)} proj. wins · opp rating ${sgn(sos.toFixed(1))}</span></h3><div class="tw"><table><thead><tr><th>Wk</th><th>Opponent</th><th class="num">Opp rtg</th><th class="num">Win %</th></tr></thead><tbody>${rows.map(r => `<tr class="clk" data-g="${esc(r.g.ev.id)}"><td class="num">${esc(r.g.wk)}</td><td class="tm"><img src="${esc(logo(M.teamOf(r.op, r.g)))}" alt="">${r.home ? 'vs' : '@'} ${esc(M.teamOf(r.op, r.g).abbreviation)}${M.T[r.op] ? '' : ' <span class="tag" style="font-size:10px">FCS</span>'}</td><td class="num ${M.rt(r.op) > 0 ? 'neg' : 'pos'}">${sgn(M.rt(r.op).toFixed(1))}</td><td class="num ${r.p >= .6 ? 'pos' : r.p <= .4 ? 'neg' : ''}"><b>${Math.round(r.p * 100)}%</b></td></tr>`).join('')}</tbody></table></div></div>` : '')
      + (pts.length >= 2 ? `<div class="panel"><h3>Playoff odds over time</h3><div class="chart">${lineChart([{ v: pts.map(w => hist[w][id] * 100), cls: 'lA', area: true }], pts.map(w => 'W' + w))}</div><p class="note" style="padding:0 14px 10px;margin:0">From your visits to the Odds page each week.</p></div>` : '');
    wire();
    simSeason(M, 1500).then(out => { const f = document.getElementById('finish'); if (f) f.outerHTML = finishHTML(out, String(id), 1500, M.T); }).catch(() => {});
    teamChanges(String(id), t.abbreviation, t.displayName).then(ch => { const c = document.getElementById('changes'); if (!c) return; c.outerHTML = ch.length ? `<div class="panel"><h3>Lineup &amp; coaching news<span class="pill">QB and coach changes</span></h3>${ch.map(x => `<a class="leader" style="grid-template-columns:1fr auto" href="${esc(x.href || '#transactions/' + id)}" ${x.href ? 'target="_blank" rel="noopener"' : ''}><div><div class="nm" style="white-space:normal">${esc(x.text)}</div></div><span class="muted" style="font-size:12px">${esc(fmtDay(x.date))}</span></a>`).join('')}</div>` : ''; }).catch(() => {});
  }).catch(() => {});
  const sb2 = document.getElementById('sharebtn'); if (sb2) sb2.onclick = () => shareCard({ title: t.displayName, sub: `${rec?.summary || ''} · ${t.standingSummary || ''} · ${SEASON}`, logos: [logo(t)], rows: [{ left: 'Points for / against', right: `${pf} – ${pa}` }, { left: 'Point differential', right: sgn(pf - pa), hl: pf - pa > 0 }, { left: 'Home / Away', right: `${wl(home)} / ${wl(away)}` }, { left: 'Last 5', right: played.slice(-5).map(g => g.res).join(' ') }, ...played.slice(-3).map(g => ({ left: `${g.me.homeAway === 'home' ? 'vs' : '@'} ${g.op.team.abbreviation}`, mid: `Week ${g.wk}`, right: `${g.res} ${g.ms}–${g.os}`, hl: g.res === 'W' }))] });
  coachOf(String(id)).then(c => { const el = document.getElementById('coachbox'); if (el) el.outerHTML = coachPanelHTML(c, rec?.summary); }).catch(() => { document.getElementById('coachbox')?.remove(); });
  const hb = document.getElementById('h2hbtn'); if (hb) hb.onclick = () => mountH2H(document.getElementById('h2hpanel'), t, next.op.team);
  document.getElementById('favbtn').onclick = () => { favs = mine ? favs.filter(f => f !== String(id)) : [...favs, String(id)]; store.set(LK('favTeams'), favs); toast(mine ? 'Removed from my teams' : t.displayName + ' added to my teams'); team(id, tab); ticker(); };
}

/* ---------- compare ---------- */
async function compare(aId, bId) {
  const idx = await teamsIndex();
  const list = Object.values(idx).sort((a, b) => a.displayName.localeCompare(b.displayName));
  aId = aId || favs[0] || list[0].id; bId = bId || list.find(t => t.id !== aId).id;
  const sel = (id, which) => `<select id="${which}" aria-label="Team ${which}">${list.map(t => `<option value="${t.id}" ${t.id === id ? 'selected' : ''}>${esc(t.displayName)}</option>`).join('')}</select>`;
  const stnd = await standingsL3();
  const entry = id => (stnd.children || []).flatMap(c => (c.children || []).flatMap(d => d.standings?.entries || [])).find(e => e.team.id === String(id));
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
    ['Record', sv(ea,'overall'), sv(eb,'overall'), isCFB() ? (() => { const r = recOf(ea || { stats: [] }); return r.w + r.l ? r.w / (r.w + r.l) : 0; })() : nv(ea,'winPercent'), isCFB() ? (() => { const r = recOf(eb || { stats: [] }); return r.w + r.l ? r.w / (r.w + r.l) : 0; })() : nv(eb,'winPercent')],
    ['Points for / game', A.g.length ? (A.pf / A.g.length).toFixed(1) : '–', B.g.length ? (B.pf / B.g.length).toFixed(1) : '–', A.g.length ? A.pf / A.g.length : 0, B.g.length ? B.pf / B.g.length : 0],
    ['Points against / game', A.g.length ? (A.pa / A.g.length).toFixed(1) : '–', B.g.length ? (B.pa / B.g.length).toFixed(1) : '–', A.g.length ? -A.pa / A.g.length : 0, B.g.length ? -B.pa / B.g.length : 0],
    ['Point differential', sgn(A.pf - A.pa), sgn(B.pf - B.pa), A.pf - A.pa, B.pf - B.pa],
    ['Home', sv(ea,'Home'), sv(eb,'Home'), 0, 0], ['Road', sv(ea, isCFB() ? 'Away' : 'Road'), sv(eb, isCFB() ? 'Away' : 'Road'), 0, 0],
    ...(isCFB() ? [['vs. Conference', sv(ea,'vs. Conf.'), sv(eb,'vs. Conf.'), 0, 0], ['vs. AP Top 25', sv(ea,'vs AP Top 25'), sv(eb,'vs AP Top 25'), 0, 0]] : [['vs. Division', sv(ea,'vs. Div.'), sv(eb,'vs. Div.'), 0, 0], ['vs. Conference', sv(ea,'vs. Conf.'), sv(eb,'vs. Conf.'), 0, 0]]),
    ['Streak', sv(ea,'streak'), sv(eb,'streak'), 0, 0], ...(isCFB() ? [] : [['Playoff seed', sv(ea,'playoffSeed'), sv(eb,'playoffSeed'), -nv(ea,'playoffSeed'), -nv(eb,'playoffSeed')]]),
  ];
  if (sta && stb) [['Yards / game','passing.yardsPerGame'],['Pass yds / game','passing.passingYardsPerGame'],['Rush yds / game','rushing.rushingYardsPerGame'],['3rd down %','miscellaneous.thirdDownConvPct'],['Sacks (def)','defensive.sacks'],['Takeaways','miscellaneous.totalTakeaways'],['TO differential','miscellaneous.turnOverDifferential']].forEach(([l, k]) => { const x = sta[k], y = stb[k]; if (x && y) rowsDef.push([l, x.displayValue + (x.rank ? ` (${ord(x.rank)})` : ''), y.displayValue + (y.rank ? ` (${ord(y.rank)})` : ''), num(x.value), num(y.value)]); });
  const ta = idx[aId], tb = idx[bId];
  try { const M = await ratingModel(); const A = M.T[aId], B = M.T[bId]; if (A && B) { const rk = (k, asc) => { const s = [...M.ids].sort((x, y) => asc ? M.T[x][k] - M.T[y][k] : M.T[y][k] - M.T[x][k]); return id => ord(s.indexOf(id) + 1); }; const rr = rk('rating'), ro = rk('off'), rd = rk('def', true);
    rowsDef.splice(1, 0, ['Power rating', `${sgn(A.rating.toFixed(1))} (${rr(aId)})`, `${sgn(B.rating.toFixed(1))} (${rr(bId)})`, A.rating, B.rating], ['Offense rating', `${sgn(A.off.toFixed(1))} (${ro(aId)})`, `${sgn(B.off.toFixed(1))} (${ro(bId)})`, A.off, B.off], ['Defense rating', `${sgn((-A.def).toFixed(1))} (${rd(aId)})`, `${sgn((-B.def).toFixed(1))} (${rd(bId)})`, -A.def, -B.def], ['Model · neutral field', `${Math.round((1 - M.pWin(bId, aId, true)) * 100)}%`, `${Math.round(M.pWin(bId, aId, true) * 100)}%`, 1 - M.pWin(bId, aId, true), M.pWin(bId, aId, true)]); } } catch {}
  view.innerHTML = `<div class="bar"><div><h1>Head to head</h1><h2>${SEASON} season comparison</h2></div><div class="row">${sel(aId, 'ca')}<span class="muted">vs</span>${sel(bId, 'cb')}</div></div>
    <div class="panel"><div class="vs" style="background:linear-gradient(90deg,${colorOf(ta)}33,transparent 30%,transparent 70%,${colorOf(tb)}33)"><a class="side" href="#team/${esc(aId)}"><img src="${esc(logo(ta))}" alt=""><b>${esc(ta.displayName)}</b><span class="num">${esc(sv(ea,'overall'))}</span></a><span class="mid">VS</span><a class="side" href="#team/${esc(bId)}"><img src="${esc(logo(tb))}" alt=""><b>${esc(tb.displayName)}</b><span class="num">${esc(sv(eb,'overall'))}</span></a></div>
    <div class="cmp">${rowsDef.map(([l, va, vb, na, nb]) => { const mx = Math.max(Math.abs(na), Math.abs(nb), 1e-9); const aw = na > nb, bw = nb > na; return `<div class="r"><span class="l ${aw ? 'pos' : ''}">${esc(va)}</span><div><div class="lbl">${l}</div>${na || nb ? `<div class="bars"><span class="a"><i class="${aw ? 'w' : ''}" style="width:${Math.abs(na) / mx * 100}%"></i></span><span class="b"><i class="${bw ? 'w' : ''}" style="width:${Math.abs(nb) / mx * 100}%"></i></span></div>` : ''}</div><span class="rr ${bw ? 'pos' : ''}">${esc(vb)}</span></div>`; }).join('')}</div></div>
    <div class="half" style="margin-top:14px">
      <div class="panel"><h3>Meetings this season</h3>${h2h.length ? h2h.map(ev => { const c = ev.competitions[0], [x, y] = byHome(c); const done = c.status?.type?.completed; return `<a class="game" href="#game/${esc(ev.id)}" style="--ca:${colorOf(x.team)};--cb:${colorOf(y.team)}"><div class="team"><img src="${esc(logo(x.team))}" alt=""><b>${esc(x.team.displayName)}</b></div><div class="score">${done ? scoreOf(x) : ''}</div><div class="team"><img src="${esc(logo(y.team))}" alt=""><b>${esc(y.team.displayName)}</b></div><div class="score">${done ? scoreOf(y) : ''}</div><div class="meta"><span>Week ${esc(ev.week?.number)}</span><span>${done ? 'Final' : esc(fmtDate(ev.date))}</span></div></a>`; }).join('') : '<div class="empty">These teams don\'t meet in the regular season.</div>'}</div>
      <div class="panel" id="h2hpanel"><h3>All-time series</h3><div class="empty" style="padding:12px"><button class="chip" id="h2hbtn">Every meeting since 2000 →</button></div></div>
      <div class="panel"><h3>Common opponents</h3>${common.length ? `<div class="tw"><table><thead><tr><th>Opponent</th><th>${esc(ta.abbreviation)}</th><th>${esc(tb.abbreviation)}</th></tr></thead><tbody>${common.map(o => { const ga = A.g.filter(x => x.opId === o), gb = B.g.filter(x => x.opId === o); const f = arr => arr.map(x => `<span class="res ${x.res}">${x.res}</span> <span class="num muted">${x.ms}-${x.os}</span>`).join(', '); return `<tr><td class="tm"><img src="${esc(logo(idx[o]))}" alt="">${esc(idx[o]?.displayName || o)}</td><td>${f(ga)}</td><td>${f(gb)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No common opponents played yet.</div>'}</div>
    </div>`;
  document.getElementById('h2hbtn').onclick = () => mountH2H(document.getElementById('h2hpanel'), ta, tb);
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
async function buildModel() { return ratingModel(); }
async function odds() {
  if (isCFB()) return cfpOdds();
  if (!LEAGUE.odds) { view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">Playoff odds are simulated for the NFL only. For college football, see the <a class="lnk" href="#playoffs">rankings and projected CFP bracket</a>.</div></div>`; return; }
  view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>Simulating the rest of the season…</h2></div></div><div class="prog" id="op"><i style="width:0"></i></div>`;
  const idx = await teamsIndex();
  if (!isCur()) { view.innerHTML = `<div class="bar"><div><h1>Playoff odds</h1><h2>${SEASON} season</h2></div></div><div class="panel"><div class="empty">Odds are simulated for the current season only. The ${SEASON} playoffs are history: see the <a class="lnk" href="#playoffs">playoff picture</a> for results.</div></div>`; return; }
  const { T, ids, played, remaining, pWin } = await buildModel();
  const confs = {}; ids.forEach(id => (confs[T[id].conf] ||= []).push(id));
  const N = 5000; const out = await simSeason({ T, ids, played, remaining, pWin }, N, p => { const b = document.querySelector('#op i'); if (b) b.style.width = p * 100 + '%'; });
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
    <p class="note">Each simulation plays every remaining game using the opponent-adjusted Power Index rating gap plus home-field advantage, then seeds the conferences (division winners, then three wild cards; ties broken by head-to-head, then point differential). Ratings are regressed toward average early in the season. This is an estimate for fun, not ESPN's FPI.</p>`;
  wire();
}


/* =====================================================================
   v11 · season tools: team dashboard, head-to-head history, player trends & usage,
   draft classes, transactions, strength of schedule, division race, weekly awards,
   records watch, CFP simulator
   ===================================================================== */
const TOTAL_GAMES = () => LEAGUE.key === 'nfl' ? 17 : 12;

/* ---------- shared season simulation (used by playoff odds + division race) ---------- */
async function simSeason(M, N, onProgress) {
  const { T, ids, played, remaining, pWin } = M; const out = {}; ids.forEach(id => out[id] = { playoff: 0, div: 0, bye: 0, wins: 0, divW: {} });
  const h2hBase = {}; played.forEach(g => { const k = g.a + '|' + g.h; (h2hBase[k] ||= [0, 0]); if (g.as > g.hs) h2hBase[k][0]++; else if (g.hs > g.as) h2hBase[k][1]++; });
  const divs = {}; ids.forEach(id => (divs[T[id].conf + '/' + T[id].div] ||= []).push(id));
  const confs = {}; ids.forEach(id => (confs[T[id].conf] ||= []).push(id));
  const run = (from, to) => { for (let n = from; n < to; n++) {
    const W = {}, PD = {}, H = {}; ids.forEach(id => { W[id] = T[id].w + T[id].t / 2; PD[id] = T[id].pf - T[id].pa; });
    Object.entries(h2hBase).forEach(([k, v]) => H[k] = [...v]);
    remaining.forEach(g => { const ph = pWin(g.h, g.a, g.neutral); const k = g.a + '|' + g.h; (H[k] ||= [0, 0]); if (Math.random() < ph) { if (W[g.h] != null) { W[g.h]++; PD[g.h] += 7; } if (W[g.a] != null) PD[g.a] -= 7; H[k][1]++; } else { if (W[g.a] != null) { W[g.a]++; PD[g.a] += 7; } if (W[g.h] != null) PD[g.h] -= 7; H[k][0]++; } });
    const cmp = (x, y) => { if (W[y] !== W[x]) return W[y] - W[x]; const k1 = H[x + '|' + y] || [0, 0], k2 = H[y + '|' + x] || [0, 0]; const xw = k1[0] + k2[1], yw = k1[1] + k2[0]; if (xw !== yw) return yw - xw; return (PD[y] - PD[x]) || (Math.random() - .5); };
    Object.values(confs).forEach(cids => { const winners = Object.entries(divs).filter(([k]) => k.startsWith(T[cids[0]].conf + '/')).map(([, m]) => [...m].sort(cmp)[0]).sort(cmp);
      const wc = cids.filter(id => !winners.includes(id)).sort(cmp).slice(0, 3); const inP = [...winners, ...wc];
      inP.forEach(id => out[id].playoff++); winners.forEach(id => out[id].div++); if (winners[0]) out[winners[0]].bye++; });
    ids.forEach(id => { out[id].wins += W[id]; const w = Math.round(W[id]); out[id].divW[w] = (out[id].divW[w] || 0) + 1; });
  } };
  for (let i = 0; i < N; i += 500) { run(i, Math.min(N, i + 500)); onProgress?.(Math.min(1, (i + 500) / N)); await new Promise(r => setTimeout(r, 0)); }
  return out;
}

/* ---------- 9 · team season dashboard ---------- */
function teamDashHTML(id, games, played, stnd, idx) {
  if (!played.length) return '<div class="panel"><div class="empty">The dashboard fills in after the first game.</div></div>';
  const ls = g => ({ me: (g.me.linescores || []).map(x => num(x.value ?? x.displayValue)), op: (g.op.linescores || []).map(x => num(x.value ?? x.displayValue)) });
  const withLS = played.filter(g => (g.me.linescores || []).length >= 2 && (g.me.linescores.some(x => num(x.value ?? x.displayValue) > 0) || g.op.linescores?.some(x => num(x.value ?? x.displayValue) > 0)));
  // scoring by quarter
  const Q = [0, 0, 0, 0, 0], QO = [0, 0, 0, 0, 0];
  withLS.forEach(g => { const { me, op } = ls(g); me.forEach((v, i) => Q[Math.min(i, 4)] += v); op.forEach((v, i) => QO[Math.min(i, 4)] += v); });
  const qmax = Math.max(...Q, ...QO, 1);
  const qHTML = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((l, i) => (i < 4 || Q[i] || QO[i]) ? `<div class="qrow"><span class="ql">${l}</span><div class="qb"><i class="a" style="width:${Q[i] / qmax * 100}%"></i><b>${Q[i]}</b></div><div class="qb"><i class="b" style="width:${QO[i] / qmax * 100}%"></i><b>${QO[i]}</b></div></div>` : '').join('');
  // opponent context from current standings
  const info = {}; const my = idx?.[id] || {};
  if (stnd) stnd.children.forEach(c => c.children.forEach(d => (d.standings?.entries || []).forEach(e => { const { w: W, l: L } = recOf(e); info[e.team.id] = { conf: c.abbreviation || c.name, div: d.name, pct: W + L ? W / (W + L) : .5 }; })));
  const me = info[id] || {};
  const half = g => { const { me, op } = ls(g); return [me[0] + me[1], op[0] + op[1]]; };
  const prevRes = {}; played.forEach((g, i) => prevRes[g.ev.id] = i ? played[i - 1].res : '');
  const splits = [
    ['Home', g => g.me.homeAway === 'home'], ['Away', g => g.me.homeAway !== 'home'],
    ...(LEAGUE.hasDivisions ? [['vs. division', g => info[g.op.team.id]?.div && info[g.op.team.id].div === me.div]] : []),
    ['vs. conference', g => info[g.op.team.id]?.conf && info[g.op.team.id].conf === me.conf],
    ['vs. .500 or better', g => (info[g.op.team.id]?.pct ?? 0) >= .5], ['vs. below .500', g => (info[g.op.team.id]?.pct ?? 1) < .5],
    ...(isCFB() ? [['vs. ranked', g => num(g.op.curatedRank?.current) > 0 && num(g.op.curatedRank.current) <= 25]] : []),
    ['One-score games', g => Math.abs(g.ms - g.os) <= 8], ['Decided by 14+', g => Math.abs(g.ms - g.os) >= 14],
    ['Scoring 24+', g => g.ms >= 24], ['Allowing 24+', g => g.os >= 24],
    ['Leading at half', g => withLS.includes(g) && half(g)[0] > half(g)[1]], ['Trailing at half', g => withLS.includes(g) && half(g)[0] < half(g)[1]],
    ['After a win', g => prevRes[g.ev.id] === 'W'], ['After a loss', g => prevRes[g.ev.id] === 'L'],
  ];
  const card = ([name, f]) => { const gs = played.filter(f); const w = gs.filter(g => g.res === 'W').length, l = gs.filter(g => g.res === 'L').length, t = gs.length - w - l; const pct = gs.length ? (w + t / 2) / gs.length : null;
    return `<div class="split ${pct == null ? 'none' : pct >= .6 ? 'good' : pct <= .4 ? 'bad' : ''}"><small>${name}</small><b>${gs.length ? `${w}-${l}${t ? '-' + t : ''}` : '–'}</b><span>${gs.length ? `${(gs.reduce((n, g) => n + g.ms, 0) / gs.length).toFixed(1)} – ${(gs.reduce((n, g) => n + g.os, 0) / gs.length).toFixed(1)} ppg` : 'no games'}</span></div>`; };
  let cum = 0; const cumDiff = played.map(g => cum += g.ms - g.os);
  const best = played.reduce((b, g) => (g.ms - g.os) > (b.ms - b.os) ? g : b, played[0]), worst = played.reduce((b, g) => (g.ms - g.os) < (b.ms - b.os) ? g : b, played[0]);
  return `<div class="panel"><h3>Record splits<span class="pill">${played.length} games</span></h3><div class="splits">${splits.map(card).join('')}</div></div>
    <div class="two"><div class="panel"><h3>Scoring by quarter<span class="pill">for · against</span></h3><div class="qbars">${qHTML || '<div class="empty">Quarter scores not available.</div>'}</div><div class="legend"><span><i></i>Scored</span><span><i class="b"></i>Allowed</span></div></div>
    <div class="panel"><h3>Point differential</h3><div class="chart">${marginChart(played)}</div><div class="kpis" style="padding-top:0"><div class="kpi"><small>Season diff</small><b class="${cum >= 0 ? 'pos' : 'neg'}">${sgn(cum)}</b></div><div class="kpi"><small>Best win</small><b style="font-size:16px">${best.ms > best.os ? `${best.ms}–${best.os} ${best.me.homeAway === 'home' ? 'vs' : '@'} ${esc(best.op.team.abbreviation)}` : '–'}</b></div><div class="kpi"><small>Worst loss</small><b style="font-size:16px">${worst.ms < worst.os ? `${worst.ms}–${worst.os} ${worst.me.homeAway === 'home' ? 'vs' : '@'} ${esc(worst.op.team.abbreviation)}` : '–'}</b></div></div></div></div>
    <div class="panel"><h3>Points for &amp; against by week</h3><div class="chart">${lineChart([{ v: played.map(g => g.ms), cls: 'lA', area: true }, { v: played.map(g => g.os), cls: 'lB' }], played.map(g => 'W' + g.wk))}</div><div class="legend"><span><i></i>Points scored</span><span><i class="b"></i>Points allowed</span></div></div>`;
}

/* ---------- 10 · head-to-head history (every meeting since 2000, from ESPN's schedule feeds) ---------- */
const H2H_FROM = () => isCFB() ? 2002 : 1970;
async function h2hHistory(aId, bId, onProgress, from = 2000) {
  const key = LK(`h2h:${[String(aId), String(bId)].sort().join('-')}:${from}`); const c = store.get(key, null); if (c && Date.now() - c.t < 6 * 3600000) return c.games;
  const years = []; for (let y = from; y <= CUR_SEASON; y++) years.push(y);
  const games = []; let done = 0;
  const grab = async (y, type) => { try { const d = await getJSON(`${API}/teams/${aId}/schedule?season=${y}${type === 3 ? '&seasontype=3' : ''}`, 86400000);
      (d.events || []).forEach(ev => { const c = ev.competitions?.[0]; if (!c?.competitors?.some(x => x.team.id === String(bId)) || !c.status?.type?.completed) return; const [a, h] = byHome(c);
        games.push({ id: ev.id, y, wk: ev.week?.number, post: type === 3 || ev.seasonType?.type === 3, date: ev.date, home: h.team.id, hs: scoreOf(h), as: scoreOf(a), hn: h.team.abbreviation, an: a.team.abbreviation, label: ev.week?.text || '' }); }); } catch {} done++; onProgress?.(done / (years.length * 2)); };
  for (let i = 0; i < years.length; i += 9) await Promise.all(years.slice(i, i + 9).flatMap(y => [grab(y, 2), grab(y, 3)]));
  if (from < 2000) { const prev = store.get(LK(`h2h:${[String(aId), String(bId)].sort().join('-')}:2000`), null); if (prev?.games) games.push(...prev.games); }
  const seen = new Set(); const uniq = games.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((x, y) => new Date(y.date) - new Date(x.date));
  store.set(key, { t: Date.now(), games: uniq }); return uniq;
}
function h2hHTML(games, A, B, limit = 10, from = 2000) {
  if (!games.length) return `<div class="empty">No meetings since ${from}.</div>`;
  const wins = { [A.id]: 0, [B.id]: 0 }; let ties = 0; games.forEach(g => { if (g.hs === g.as) ties++; else wins[g.hs > g.as ? g.home : (g.home === String(A.id) ? String(B.id) : String(A.id))]++; });
  const lead = wins[A.id] === wins[B.id] ? 'Series tied' : `${wins[A.id] > wins[B.id] ? esc(A.abbreviation) : esc(B.abbreviation)} leads`;
  const pf = {}; games.forEach(g => { pf[g.home] = (pf[g.home] || 0) + g.hs; const away = g.home === String(A.id) ? String(B.id) : String(A.id); pf[away] = (pf[away] || 0) + g.as; });
  const streak = (() => { let n = 0, who = null; for (const g of games) { const w = g.hs === g.as ? null : g.hs > g.as ? g.home : (g.home === String(A.id) ? String(B.id) : String(A.id)); if (!w) break; if (who && w !== who) break; who = w; n++; } return who ? `${esc((who === String(A.id) ? A : B).abbreviation)} has won ${n} straight` : ''; })();
  return `<div class="h2h-sum"><div class="h2h-side" style="--tc:${colorOf(A)}"><img src="${esc(logo(A))}" alt=""><b>${wins[A.id]}</b></div><div class="h2h-mid"><b>${lead}</b><small>${games.length} meetings since ${from}${from < 2000 ? ' (ESPN has partial seasons before the mid-1990s)' : ''}${ties ? ' · ' + ties + ' tie' + (ties > 1 ? 's' : '') : ''}</small><small>Avg score ${(pf[A.id] / games.length).toFixed(1)} – ${(pf[B.id] / games.length).toFixed(1)}</small>${streak ? `<small class="pos">${streak}</small>` : ''}</div><div class="h2h-side r" style="--tc:${colorOf(B)}"><img src="${esc(logo(B))}" alt=""><b>${wins[B.id]}</b></div></div>
    <div class="tw"><table><thead><tr><th>Season</th><th>Game</th><th>Result</th><th class="num">Score</th></tr></thead><tbody>${games.slice(0, limit).map(g => { const aHome = g.home === String(A.id); const aS = aHome ? g.hs : g.as, bS = aHome ? g.as : g.hs; const w = aS === bS ? 'T' : aS > bS ? 'W' : 'L'; return `<tr class="clk" data-g="${esc(g.id)}"><td class="num">${g.y}</td><td>${g.post ? '<span class="tag" style="font-size:10px">Playoffs</span> ' : ''}${esc(g.label || (g.wk ? 'Week ' + g.wk : ''))} · ${aHome ? esc(B.abbreviation) + ' @ ' + esc(A.abbreviation) : esc(A.abbreviation) + ' @ ' + esc(B.abbreviation)}</td><td><span class="res ${w}">${w}</span> <span class="muted">${esc(A.abbreviation)}</span></td><td class="num">${aS}–${bS}</td></tr>`; }).join('')}</tbody></table></div><div class="empty" style="padding:8px">${games.length > limit ? `<button class="chip" data-h2hmore>Show all ${games.length}</button> ` : ''}${from >= 2000 && H2H_FROM() < 2000 ? `<button class="chip" data-h2hold>Go back to ${H2H_FROM()} →</button>` : ''}</div>`;
}
function mountH2H(el, A, B, from = 2000) {
  if (!el) return; el.innerHTML = `<div class="panel"><h3>All-time series<span class="pill">since ${from}${from < 2000 ? ' · this takes a moment' : ''}</span></h3><div class="prog" style="margin:10px 16px"><i id="h2hp" style="width:0"></i></div></div>`;
  h2hHistory(A.id, B.id, p => { const b = document.getElementById('h2hp'); if (b) b.style.width = p * 100 + '%'; }, from).then(games => { if (!el.isConnected) return; const draw = lim => { el.innerHTML = `<div class="panel"><h3>All-time series<span class="pill">since ${from}</span></h3>${h2hHTML(games, A, B, lim, from)}</div>`; el.querySelector('[data-h2hmore]')?.addEventListener('click', () => draw(999)); el.querySelector('[data-h2hold]')?.addEventListener('click', () => mountH2H(el, A, B, H2H_FROM())); wire(); }; draw(10); }).catch(e => { el.innerHTML = `<div class="panel"><div class="empty">Series history unavailable (${esc(e.message)}).</div></div>`; });
}

/* ---------- 11 · player trend chart with rolling average + season high ---------- */
function trendChart(vals, labels, { h = 170, w = 520, win = 3 } = {}) {
  const v = vals.map(x => num(x)); if (v.length < 2) return '<div class="empty">Needs two games.</div>';
  const pad = { l: 34, r: 12, t: 16, b: 22 }; const mx = Math.max(...v) * 1.15 || 1; const n = v.length;
  const x = i => pad.l + i * (w - pad.l - pad.r) / (n - 1), y = val => pad.t + (h - pad.t - pad.b) * (1 - val / mx);
  const avg = v.map((_, i) => { const s = v.slice(Math.max(0, i - win + 1), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
  const mean = v.reduce((a, b) => a + b, 0) / n; const hi = v.indexOf(Math.max(...v));
  const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(mx * f)}" y2="${y(mx * f)}"/><text x="${pad.l - 4}" y="${y(mx * f) + 3}" text-anchor="end">${Math.round(mx * f)}</text>`).join('');
  const pts = v.map((val, i) => `${x(i)},${y(val)}`);
  return `<svg viewBox="0 0 ${w} ${h}"><g class="grid">${grid}</g>
    <path class="aA" d="M${pts[0]}L${pts.join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="lA" d="M${pts.join('L')}"/>
    <line class="mean" x1="${pad.l}" x2="${w - pad.r}" y1="${y(mean)}" y2="${y(mean)}"/><text x="${w - pad.r}" y="${y(mean) - 4}" text-anchor="end" class="meanlbl">avg ${mean.toFixed(1)}</text>
    <path class="lB dash" d="M${avg.map((val, i) => `${x(i)},${y(val)}`).join('L')}"/>
    ${v.map((val, i) => `<circle cx="${x(i)}" cy="${y(val)}" r="${i === hi ? 5 : 2.5}" class="${i === hi ? 'hi' : 'pt'}"/>`).join('')}
    <text x="${x(hi)}" y="${y(v[hi]) - 9}" text-anchor="middle" class="hilbl">season high ${v[hi]}</text>
    ${labels.map((l, i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
}
const FANTASY_NAMES = { passingYards: .04, passingTouchdowns: 4, interceptions: -2, rushingYards: .1, rushingTouchdowns: 6, receptions: .5, receivingYards: .1, receivingTouchdowns: 6, fumblesLost: -2 };
function fantasyFromLog(names, stats) { let p = 0, any = false; names.forEach((n, i) => { if (FANTASY_NAMES[n] != null) { any = true; p += num(stats[i]) * FANTASY_NAMES[n]; } }); return any ? Math.round(p * 10) / 10 : null; }

/* ---------- 12 · usage: target share & rush share per game, from box scores ---------- */
async function usageForGame(evId, teamId) { const ev = (await seasonGames()).find(e => e.id === String(evId)) || { id: evId, status: { type: { completed: true } } }; return (await gameLines(ev)).u[teamId] || null; }
async function usageHTML(id, teamId, rows) {
  const done = rows.filter(r => r.id).slice(-17); if (!done.length) return '';
  const per = await Promise.all(done.map(async r => { try { const u = await usageForGame(r.id, teamId); const me = u?.p?.[String(id)]; return me ? { r, tg: me[0], car: me[1], rec: me[2], yds: me[3], ry: me[4] || 0, ttg: u.tg, tcar: u.car, trec: u.rec || 0, try: u.ry || 0 } : null; } catch { return null; } }));
  const rowsU = per.filter(Boolean); if (!rowsU.length) return '';
  const sum = k => rowsU.reduce((n, x) => n + x[k], 0); const n = rowsU.length;
  const hasTg = sum('ttg') > 0, hasRec = sum('rec') > 0, showC = sum('car') >= Math.max(5, n) || (sum('tcar') && sum('car') / sum('tcar') >= .1);
  if (!hasRec && !showC) return '';
  const share = (a, b) => b ? a / b * 100 : 0;
  // receiving block: target share when ESPN lists targets (NFL); reception + yards share otherwise (college)
  const recSeries = hasTg ? rowsU.map(x => share(x.tg, x.ttg)) : rowsU.map(x => share(x.rec, x.trec)), ydsSeries = rowsU.map(x => share(x.ry, x.try));
  const carSeries = rowsU.map(x => share(x.car, x.tcar));
  const kpis = [...(hasRec ? (hasTg ? [['Target share', share(sum('tg'), sum('ttg')).toFixed(1) + '%'], ['Targets / game', (sum('tg') / n).toFixed(1)]] : [['Reception share', share(sum('rec'), sum('trec')).toFixed(1) + '%'], ['Rec. yards share', share(sum('ry'), sum('try')).toFixed(1) + '%']]) : []), ...(hasRec ? [['Catches / game', (sum('rec') / n).toFixed(1)]] : []), ...(showC ? [['Carry share', share(sum('car'), sum('tcar')).toFixed(1) + '%'], ['Carries / game', (sum('car') / n).toFixed(1)]] : []), ['Touches / game', ((sum('rec') + sum('car')) / n).toFixed(1)]];
  const series = [...(hasRec ? [{ v: recSeries, cls: 'lA', area: true }] : []), ...(hasRec && !hasTg ? [{ v: ydsSeries, cls: 'lC' }] : []), ...(showC ? [{ v: carSeries, cls: 'lB' }] : [])];
  const legend = [...(hasRec ? [`<span><i></i>${hasTg ? 'Target' : 'Reception'} share %</span>`] : []), ...(hasRec && !hasTg ? ['<span><i class="c"></i>Rec. yards share %</span>'] : []), ...(showC ? ['<span><i class="b"></i>Carry share %</span>'] : [])];
  const head = `<th>Wk</th><th>Opp</th>${hasRec ? (hasTg ? '<th class="num">Tgt</th><th class="num">Team</th><th class="num">Share</th>' : '<th class="num">Rec</th><th class="num">Team</th><th class="num">Share</th><th class="num">Yds</th><th class="num">Team</th><th class="num">Share</th>') : ''}${showC ? '<th class="num">Car</th><th class="num">Team</th><th class="num">Share</th>' : ''}<th class="num">Touches</th>`;
  const pct = (a, b) => b ? Math.round(share(a, b)) + '%' : '–';
  return `<div class="panel"><h3>Usage<span class="pill">${hasTg ? 'share of team targets' : 'share of team catches'}${showC ? ' & carries' : ''}</span></h3>
    <div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('')}</div>
    <div class="chart">${lineChart(series, rowsU.map(x => 'W' + x.r.week))}</div><div class="legend">${legend.join('')}</div>
    <div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${rowsU.map(x => `<tr class="clk" data-g="${esc(x.r.id)}"><td class="num">${esc(x.r.week)}</td><td class="tm"><img src="${esc(x.r.opponent?.logo)}" alt="">${esc(x.r.atVs)} ${esc(x.r.opponent?.abbreviation)}</td>${hasRec ? (hasTg ? `<td class="num">${x.tg}</td><td class="num muted">${x.ttg}</td><td class="num"><b>${pct(x.tg, x.ttg)}</b></td>` : `<td class="num">${x.rec}</td><td class="num muted">${x.trec}</td><td class="num"><b>${pct(x.rec, x.trec)}</b></td><td class="num">${x.ry}</td><td class="num muted">${x.try}</td><td class="num"><b>${pct(x.ry, x.try)}</b></td>`) : ''}${showC ? `<td class="num">${x.car}</td><td class="num muted">${x.tcar}</td><td class="num"><b>${pct(x.car, x.tcar)}</b></td>` : ''}<td class="num">${x.rec + x.car}</td></tr>`).join('')}</tbody></table></div>
    ${!hasTg && hasRec ? '<p class="note" style="padding:0 14px 10px;margin:0">ESPN\'s college box scores don\'t list targets, so share of the team\'s catches and receiving yards is shown instead.</p>' : ''}</div>`;
}

/* ---------- 13 · draft classes & rookies ---------- */
const isRookie = p => p && (p.exp === 0 || (p.dy && p.dy === SEASON));
function draftClassHTML(list, year) {
  const cls = list.filter(p => p.dy === year).sort((a, b) => (a.dr || 99) - (b.dr || 99) || (a.pk || 999) - (b.pk || 999));
  if (!cls.length) return `<div class="empty">No ${year} draft picks on current rosters.</div>`;
  const rounds = {}; cls.forEach(p => (rounds[p.dr || 'UDFA'] ||= []).push(p));
  return Object.entries(rounds).map(([r, ps]) => `<div class="hd" style="padding:8px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">${r === 'UDFA' ? 'Undrafted' : 'Round ' + r}<span class="muted" style="float:right">${ps.length}</span></div>` + ps.map(p => `<a href="#player/${esc(p.id)}"><img src="${esc(p.hs)}" alt="" loading="lazy"><span><b>${p.pk ? `<span class="muted num" style="font-weight:400">#${p.pk}</span> ` : ''}${esc(p.name)}</b> <span class="muted">${esc(p.pos)} · ${esc(p.team.displayName)}</span></span><img src="${esc(logo(p.team))}" alt="" style="border-radius:0;object-fit:contain"></a>`).join('')).join('');
}

/* ---------- 14 · transactions ---------- */
async function transactionsFeed() { const d = await getJSON(`${API}/transactions?limit=300`, 600000); return (d.transactions || []).map(t => ({ ...t, day: (t.date || '').slice(0, 10) })); }
function transRows(list, idx) { const byDay = {}; list.forEach(t => (byDay[t.day] ||= []).push(t));
  return Object.keys(byDay).sort().reverse().map(day => `<div class="hd" style="padding:8px 16px;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;background:var(--panel-2)">${esc(new Date(day + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</div>${byDay[day].map(t => { const tm = idx[t.team?.id] || t.team; return `<a class="trow" href="#team/${esc(t.team?.id)}" style="--tc:${colorOf(tm)}"><img src="${esc(logo(tm))}" alt=""><div><b>${esc(tm?.abbreviation || '')}</b><span>${esc(t.description)}</span></div></a>`; }).join('')}`).join('');
}
async function transactions(teamId) {
  if (LEAGUE.key !== 'nfl') { view.innerHTML = `<div class="bar"><div><h1>Transactions</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">ESPN publishes a transactions wire for the NFL only.</div></div>`; return; }
  const [list, idx] = await Promise.all([transactionsFeed(), teamsIndex()]);
  view.innerHTML = `<div class="bar"><div><h1>Transactions</h1><h2>Signings, releases, IR moves and trades · from ESPN's wire</h2></div><div class="row"><select id="trt" aria-label="Team"><option value="">All teams</option>${Object.values(idx).sort((a, b) => a.displayName.localeCompare(b.displayName)).map(t => `<option value="${t.id}" ${t.id === teamId ? 'selected' : ''}>${esc(t.displayName)}</option>`).join('')}</select><select id="trk" aria-label="Type"><option value="">All moves</option><option value="sign">Signings</option><option value="releas|waiv">Releases &amp; waivers</option><option value="injured reserve|\\bIR\\b">Injured reserve</option><option value="trade|acquir">Trades</option><option value="practice squad">Practice squad</option></select><input id="trq" placeholder="Player" aria-label="Filter"></div></div><div class="panel"><div class="plist" id="trl"></div></div>`;
  const render = () => { const tv = document.getElementById('trt').value, kv = document.getElementById('trk').value, q = document.getElementById('trq').value.toLowerCase(); const re = kv ? new RegExp(kv, 'i') : null;
    const rows = list.filter(t => (!tv || t.team?.id === tv) && (!re || re.test(t.description)) && (!q || t.description.toLowerCase().includes(q)));
    document.getElementById('trl').innerHTML = transRows(rows.slice(0, 400), idx) || '<div class="empty">No moves match.</div>'; };
  render(); ['trt', 'trk', 'trq'].forEach(k => document.getElementById(k).oninput = render);
}

/* ---------- 15 · strength of schedule ---------- */
async function sos() {
  const M = await buildModel(); const T = M.T; const calF = await seasonCalendar().catch(() => null);
  const pct = id => { const r = T[id]; const g = r.w + r.l + r.t; return g ? (r.w + r.t / 2) / g : .5; };
  const rows = M.ids.map(id => { const pl = M.played.filter(g => g.a === id || g.h === id).map(g => g.a === id ? g.h : g.a); const rem = M.remaining.filter(g => g.a === id || g.h === id).sort((x, y) => (x.wk || 0) - (y.wk || 0));
    const remRows = rem.map(g => { const home = g.h === id; const op = home ? g.a : g.h; return { op, home, wk: g.wk, p: home ? M.pWin(g.h, g.a, g.neutral) : 1 - M.pWin(g.h, g.a, g.neutral), rt: M.rt(op), ev: g.ev, g }; });
    const avg = arr => arr.length ? arr.reduce((n, x) => n + x, 0) / arr.length : null;
    let hard = null; for (let i = 0; i + 3 <= remRows.length; i++) { const s = avg(remRows.slice(i, i + 3).map(x => x.rt)); if (hard == null || s > hard.v) hard = { v: s, from: remRows[i].wk, to: remRows[i + 2].wk }; }
    return { id, team: T[id].team, conf: T[id].conf, rec: `${T[id].w}-${T[id].l}${T[id].t ? '-' + T[id].t : ''}`, pastPct: avg(pl.map(pct)), pastRt: avg(pl.map(o => T[o].rating)), remRt: avg(remRows.map(x => x.rt)), remN: remRows.length, projW: T[id].w + T[id].t / 2 + remRows.reduce((n, x) => n + x.p, 0), hard, remRows, rating: T[id].rating }; });
  const rank = (k, desc = true) => { const s = [...rows].filter(r => r[k] != null).sort((a, b) => desc ? b[k] - a[k] : a[k] - b[k]); s.forEach((r, i) => r[k + 'Rank'] = i + 1); };
  rank('pastRt'); rank('remRt'); rank('pastPct');
  const chip = x => `<a class="sch ${x.p >= .65 ? 'ez' : x.p <= .35 ? 'hd' : ''}" href="#game/${esc(x.ev.id)}" title="Week ${esc(x.wk)} · ${x.home ? 'vs' : '@'} ${esc(M.teamOf(x.op, x.g).displayName)} · ${Math.round(x.p * 100)}% to win · opp rating ${sgn(x.rt.toFixed(1))}"><img src="${esc(logo(M.teamOf(x.op, x.g)))}" alt=""><small>${x.home ? '' : '@'}</small></a>`;
  view.innerHTML = `<div class="bar"><div><h1>Strength of schedule</h1><h2>Opponent quality so far and still to come · ratings from the Power Index model</h2></div>${calF?.cur ? `<span class="upd">Through week ${calF.cur}</span>` : ''}</div>
    <div class="panel"><h3>All ${rows.length} teams<span class="pill">click a column to sort · hover a logo for the matchup</span></h3><div class="tw"><table id="sost"><thead><tr><th class="sort" data-k="team">Team</th><th class="num sort" data-k="rec">Record</th><th class="num sort" data-k="pastPct">Opp win %<br><small>played</small></th><th class="num sort" data-k="pastRt">Opp rating<br><small>played</small></th><th class="num sort" data-k="remRt">Opp rating<br><small>remaining</small></th><th class="num sort" data-k="remN">Left</th><th class="num sort" data-k="projW">Proj. W</th><th>Hardest stretch</th><th>Remaining <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">(green = likely win, red = likely loss)</span></th></tr></thead><tbody></tbody></table></div></div>
    <p class="note">Opponent rating is the Power Index rating (0 = average; higher = tougher). Projected wins add the model's win probability for every remaining game to the current record. Hardest stretch is the toughest three consecutive remaining games.</p>`;
  const fmtR = v => v == null ? '–' : sgn(v.toFixed(1));
  sortable(document.getElementById('sost'), rows, { team: r => r.team.displayName, rec: r => r.w, pastPct: r => r.pastPct ?? -1, pastRt: r => r.pastRt ?? -99, remRt: r => r.remRt ?? -99, remN: r => r.remN, projW: r => r.projW },
    r => `<tr class="clk ${isFav(r.id) ? 'fav' : ''}" data-t="${esc(r.id)}"><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.displayName)}</td><td class="num">${r.rec}</td><td class="num">${r.pastPct == null ? '–' : '.' + String(Math.round(r.pastPct * 1000)).padStart(3, '0')} <small class="muted">${r.pastPctRank ? ord(r.pastPctRank) : ''}</small></td><td class="num ${r.pastRt > 1.5 ? 'neg' : r.pastRt < -1.5 ? 'pos' : ''}">${fmtR(r.pastRt)} <small class="muted">${r.pastRtRank ? ord(r.pastRtRank) : ''}</small></td><td class="num ${r.remRt > 1.5 ? 'neg' : r.remRt < -1.5 ? 'pos' : ''}">${fmtR(r.remRt)} <small class="muted">${r.remRtRank ? ord(r.remRtRank) : ''}</small></td><td class="num">${r.remN}</td><td class="num"><b>${r.projW.toFixed(1)}</b></td><td class="muted">${r.hard ? `W${r.hard.from}–${r.hard.to} <small>(${sgn(r.hard.v.toFixed(1))})</small>` : '–'}</td><td><div class="schs">${r.remRows.map(chip).join('')}</div></td></tr>`, 'remRt');
  document.getElementById('sost').addEventListener('drawn', () => { wire(); view.querySelectorAll('.sch').forEach(a => a.onclick = e => e.stopPropagation()); }); wire(); view.querySelectorAll('.sch').forEach(a => a.onclick = e => e.stopPropagation());
}

/* ---------- 16 · division race: games back, magic numbers, clinch scenarios ---------- */
async function race() {
  if (!LEAGUE.hasDivisions) { view.innerHTML = `<div class="bar"><div><h1>Division race</h1><h2>${LEAGUE.name}</h2></div></div><div class="panel"><div class="empty">College conferences don't use divisions. See <a class="lnk" href="#standings">conference standings</a> and the <a class="lnk" href="#odds">simulated CFP odds</a>.</div></div>`; return; }
  if (!isCur()) { view.innerHTML = `<div class="bar"><div><h1>Division race</h1><h2>${SEASON}</h2></div></div><div class="panel"><div class="empty">The race tracker works for the current season. See the <a class="lnk" href="#playoffs">${SEASON} playoff picture</a>.</div></div>`; return; }
  view.innerHTML = `<div class="bar"><div><h1>Division race</h1><h2>Simulating the rest of the season…</h2></div></div><div class="prog" id="rp"><i style="width:0"></i></div>`;
  const M = await buildModel(); const T = M.T; const N = 2000; const sim = await simSeason(M, N, p => { const b = document.querySelector('#rp i'); if (b) b.style.width = p * 100 + '%'; });
  const calF = await seasonCalendar().catch(() => null); const cw = calF?.cur || 0;
  const divs = {}; M.ids.forEach(id => (divs[T[id].conf + '/' + T[id].div] ||= []).push(id));
  const W = id => T[id].w + T[id].t / 2, L = id => T[id].l + T[id].t / 2; const remOf = id => M.remaining.filter(g => g.a === id || g.h === id).length;
  const divHTML = ([key, ids]) => { const [conf, name] = key.split('/'); const sorted = [...ids].sort((a, b) => W(b) - W(a) || L(a) - L(b) || (T[b].pf - T[b].pa) - (T[a].pf - T[a].pa)); const lead = sorted[0];
    const magic = Math.max(...sorted.slice(1).map(x => remOf(x) - (W(lead) - W(x)) + 1)); const clinched = magic <= 0;
    const rows = sorted.map((id, i) => { const gb = ((W(lead) - W(id)) + (L(id) - L(lead))) / 2; const elim = remOf(id) - (W(lead) - W(id)) + 1; const eliminated = i > 0 && elim <= 0; const p = sim[id].div / N;
      const thisWk = M.remaining.find(g => g.wk === cw && (g.a === id || g.h === id)); const opp = thisWk ? (thisWk.a === id ? thisWk.h : thisWk.a) : null; const oppT = thisWk ? M.teamOf(opp, thisWk) : null;
      let note = ''; if (i === 0) note = clinched ? '<span class="tag ok">Clinched division</span>' : `Magic number <b>${magic}</b>${magic === 1 && thisWk ? ' · clinches with a win this week' : magic === 2 && thisWk ? ' · can clinch this week with a win plus a ' + esc(T[sorted[1]].team.abbreviation) + ' loss' : ''}`; else if (eliminated) note = '<span class="tag out">Eliminated from division</span>'; else { const toTie = Math.ceil(W(lead) - W(id)); note = gb === 0 ? 'Tied for the lead' : `Needs to make up <b>${gb}</b> game${gb === 1 ? '' : 's'} · ${remOf(id)} left${toTie > 0 ? ' · elimination number ' + elim : ''}`; }
      return `<tr class="clk ${isFav(id) ? 'fav' : ''} ${i === 0 ? 'hl' : ''}" data-t="${esc(id)}"><td class="tm"><img src="${esc(logo(T[id].team))}" alt="">${esc(T[id].team.displayName)}</td><td class="num">${T[id].w}-${T[id].l}${T[id].t ? '-' + T[id].t : ''}</td><td class="num">${gb ? gb : '–'}</td><td class="num">${remOf(id)}</td><td class="num">${(sim[id].wins / N).toFixed(1)}</td><td class="num ${p >= .75 ? 'pos' : p <= .1 ? 'neg' : ''}"><b>${p >= .995 ? '>99%' : p <= .005 ? '<1%' : Math.round(p * 100) + '%'}</b></td><td class="muted" style="white-space:normal">${note}</td><td class="muted">${thisWk ? `${thisWk.h === id ? 'vs' : '@'} ${esc(oppT.abbreviation)}${ids.includes(opp) ? ' <span class="tag" style="font-size:10px">div</span>' : ''}` : (cw ? 'Bye' : '')}</td></tr>`; }).join('');
    const divGames = M.remaining.filter(g => g.wk === cw && ids.includes(g.a) && ids.includes(g.h));
    return `<div class="panel"><h3>${esc(name)}<span class="pill">${esc(conf)}${divGames.length ? ` · ${divGames.length} division game${divGames.length > 1 ? 's' : ''} this week` : ''}</span></h3><div class="tw"><table><thead><tr><th>Team</th><th class="num">W-L</th><th class="num">GB</th><th class="num">Left</th><th class="num">Proj. W</th><th class="num">Win div</th><th>Status</th><th>Week ${cw}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`; };
  view.innerHTML = `<div class="bar"><div><h1>Division race</h1><h2>Games back, magic numbers and clinch scenarios · week ${cw}</h2></div><a class="chip" href="#odds">Full playoff odds →</a></div><div class="stack">${Object.entries(divs).sort(([a], [b]) => a.localeCompare(b)).map(divHTML).join('')}</div>
    <p class="note">Magic number = the combined leader wins and runner-up losses that clinch the division outright (ignores tiebreakers). Elimination number works the same way for the chasers. "Win div" comes from ${N.toLocaleString()} simulations of the remaining schedule.</p>`;
  wire();
}

/* ---------- 17 · weekly awards from box scores ---------- */
function awardLines(summary) {
  const out = {}; const g = (c, p, l) => { const i = c.labels.indexOf(l); return i < 0 ? 0 : num(p.stats[i]); };
  (summary.boxscore?.players || []).forEach(side => side.statistics.forEach(c => c.athletes.forEach(p => { const r = (out[p.athlete.id] ||= { id: p.athlete.id, name: p.athlete.displayName, pos: p.athlete.position?.abbreviation || '', tid: side.team.id, off: 0, def: 0, k: 0, line: [] });
    if (c.name === 'passing') { const y = g(c, p, 'YDS'), td = g(c, p, 'TD'), int = g(c, p, 'INT'); r.off += y * .04 + td * 4 - int * 2; if (y) r.line.push(`${p.stats[c.labels.indexOf('C/ATT')] || ''} ${y} pass yds, ${td} TD${int ? ', ' + int + ' INT' : ''}`); }
    if (c.name === 'rushing') { const y = g(c, p, 'YDS'), td = g(c, p, 'TD'); r.off += y * .1 + td * 6; if (y) r.line.push(`${g(c, p, 'CAR')} car, ${y} rush yds${td ? ', ' + td + ' TD' : ''}`); }
    if (c.name === 'receiving') { const y = g(c, p, 'YDS'), td = g(c, p, 'TD'), rec = g(c, p, 'REC'); r.off += y * .1 + td * 6 + rec * .5; if (rec) r.line.push(`${rec} rec, ${y} yds${td ? ', ' + td + ' TD' : ''}`); }
    if (c.name === 'fumbles') r.off -= g(c, p, 'LOST') * 2;
    if (c.name === 'defensive') { const tk = g(c, p, 'TOT'), sk = g(c, p, 'SACKS'), tfl = g(c, p, 'TFL'), pd = g(c, p, 'PD'), td = g(c, p, 'TD'); r.def += tk * .6 + sk * 4 + tfl * 1.5 + pd * 1.5 + td * 6; if (tk || sk) r.line.push(`${tk} tkl${sk ? ', ' + sk + ' sack' + (sk > 1 ? 's' : '') : ''}${tfl ? ', ' + tfl + ' TFL' : ''}${pd ? ', ' + pd + ' PD' : ''}${td ? ', ' + td + ' TD' : ''}`); }
    if (c.name === 'interceptions') { const n = g(c, p, 'INT'), td = g(c, p, 'TD'); r.def += n * 5 + td * 6; if (n) r.line.push(`${n} INT${td ? ' (TD)' : ''}`); }
    if (c.name === 'kicking') { const fg = String(p.stats[c.labels.indexOf('FG')] || '0/0').split('/'), xp = String(p.stats[c.labels.indexOf('XP')] || '0/0').split('/'), lng = g(c, p, 'LONG'); r.k += num(fg[0]) * 3 + num(xp[0]) + (lng >= 50 ? 2 : 0) - (num(fg[1]) - num(fg[0])) * 2; if (num(fg[1]) || num(xp[1])) r.line.push(`FG ${fg.join('/')}${lng ? ' (long ' + lng + ')' : ''}, XP ${xp.join('/')}`); }
  })));
  return Object.values(out).filter(r => r.off || r.def || r.k).map(r => ({ ...r, off: Math.round(r.off * 10) / 10, def: Math.round(r.def * 10) / 10, k: Math.round(r.k * 10) / 10 }));
}
async function weekAwards(evs, idx, rookies) {
  const lines = []; const teams = [];
  await Promise.all(evs.map(async ev => { try { const a = (await gameLines(ev)).a;
      const c = ev.competitions[0], [aw, h] = byHome(c); const as = scoreOf(aw), hs = scoreOf(h);
      a.forEach(r => { const me = r.tid === h.team.id ? h : aw, op = me === h ? aw : h; lines.push({ ...r, ev, team: idx[r.tid] || me.team, win: me.winner, opp: op.team.abbreviation, score: `${scoreOf(me)}–${scoreOf(op)}` }); });
      [[h, aw, hs, as], [aw, h, as, hs]].forEach(([me, op, ms, os]) => { if (ms <= os) return; const pct = (() => { const st = idx[op.team.id]?.stats; const ov = st?.find(s => s.name === 'overall')?.displayValue || op.records?.[0]?.summary || ''; const m = ov.match(/^(\d+)-(\d+)/); return m ? num(m[1]) / Math.max(1, num(m[1]) + num(m[2])) : .5; })();
        teams.push({ team: idx[me.team.id] || me.team, opp: op.team, ms, os, ev, road: me.homeAway === 'away', score: (ms - os) + pct * 24 + (me.homeAway === 'away' ? 4 : 0) + (num(op.curatedRank?.current) && num(op.curatedRank.current) <= 25 ? 8 : 0) }); }); } catch {} }));
  const top = (k, f = () => true, n = 3) => lines.filter(f).sort((a, b) => b[k] - a[k] + (b.win - a.win) * .01).slice(0, n);
  return { off: top('off'), def: top('def'), k: top('k', r => r.k > 0), rook: rookies ? top('off', r => rookies.has(String(r.id))) : [], team: teams.sort((a, b) => b.score - a.score).slice(0, 3), games: evs.length };
}
async function awards(wk, scope) {
  const calF = await seasonCalendar(); const cw = isCur() ? Math.min(calF.cur || 1, calF.reg.length) : calF.reg.length;
  view.innerHTML = `<div class="bar"><div><h1>Awards</h1><h2>Reading box scores…</h2></div></div><div class="prog" id="ap"><i style="width:0"></i></div>`;
  const [all, idx] = await Promise.all([seasonGames(), teamsIndex()]); const reg = all.filter(e => !e._post);
  const lastDone = Math.max(0, ...reg.filter(e => e.status?.type?.completed).map(e => e.week?.number || 0)); const w = Number(wk) || lastDone || cw;
  const rookies = LEAGUE.key === 'nfl' ? new Set((await allRosters().catch(() => [])).filter(isRookie).map(p => String(p.id))) : null;
  const weeks = scope === 'season' ? Array.from({ length: cw }, (_, i) => i + 1).filter(n => reg.some(e => e.week?.number === n && e.status?.type?.completed)) : [w];
  const results = []; let done = 0;
  for (const n of weeks) { const evs = reg.filter(e => e.week?.number === n && e.status?.type?.completed); results.push({ n, ...(await weekAwards(evs, idx, rookies)) }); done++; const b = document.querySelector('#ap i'); if (b) b.style.width = done / weeks.length * 100 + '%'; }
  const pcard = (title, list, key, unit) => `<div class="panel award"><h3>${title}</h3>${list.length ? list.map((r, i) => `<a class="aw ${i === 0 ? 'win' : ''}" href="#player/${esc(r.id)}" style="--tc:${colorOf(r.team)}"><img src="${esc(hsOf({ id: r.id }))}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(r.name)}</b><small>${esc(r.pos)} · ${esc(r.team?.abbreviation || '')} · ${r.win ? 'W' : 'L'} ${esc(r.score)} ${r.ev.competitions[0].competitors.find(x => x.team.id === r.tid)?.homeAway === 'home' ? 'vs' : '@'} ${esc(r.opp)}</small><small>${esc(r.line.join(' · '))}</small></div><span class="v">${r[key]}<small>${unit}</small></span></a>`).join('') : '<div class="empty">No qualifying performances.</div>'}</div>`;
  const tcard = list => `<div class="panel award"><h3>Team of the week</h3>${list.length ? list.map((t, i) => `<a class="aw ${i === 0 ? 'win' : ''}" href="#game/${esc(t.ev.id)}" style="--tc:${colorOf(t.team)}"><img src="${esc(logo(t.team))}" alt="" style="border-radius:0;object-fit:contain"><div><b>${esc(t.team.displayName)}</b><small>${t.ms}–${t.os} ${t.road ? '@' : 'vs'} ${esc(t.opp.displayName)}${t.road ? ' · on the road' : ''}</small></div><span class="v">${sgn(t.ms - t.os)}<small>margin</small></span></a>`).join('') : '<div class="empty">No results yet.</div>'}</div>`;
  const weekHTML = r => `<div class="award-wk"><h3 class="cap" style="margin:var(--s4) 0 var(--s3)">Week ${r.n}<span class="muted" style="font-weight:400;font-size:13px;text-transform:none;letter-spacing:0;margin-left:8px">${r.games} games</span></h3><div class="grid">${pcard('Offensive player of the week', r.off, 'off', 'pts')}${pcard('Defensive player of the week', r.def, 'def', 'pts')}${rookies ? pcard('Rookie of the week', r.rook, 'off', 'pts') : ''}${pcard('Kicker of the week', r.k, 'k', 'pts')}${tcard(r.team)}</div></div>`;
  view.innerHTML = `<div class="bar"><div><h1>Awards</h1><h2>${scope === 'season' ? SEASON + ' · every week' : 'Week ' + w} · picked automatically from box scores</h2></div><div class="row"><div class="chips"><a class="chip ${scope !== 'season' ? 'on' : ''}" href="#awards/${w}">Week</a><a class="chip ${scope === 'season' ? 'on' : ''}" href="#awards/${w}/season">Season archive</a></div>${scope !== 'season' ? `<select id="awk" aria-label="Week">${Array.from({ length: cw }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select>` : ''}</div></div>
    ${results.length ? (scope === 'season' ? results.slice().reverse() : results).map(weekHTML).join('') : '<div class="panel"><div class="empty">No completed games yet this week.</div></div>'}
    <p class="note">Offense scores like half-PPR fantasy (yards, touchdowns, receptions, turnovers). Defense: 0.6 per tackle, 4 per sack, 1.5 per TFL and pass defended, 5 per interception, 6 per TD. Kickers: 3 per FG, 1 per XP, +2 for a 50-yarder, −2 per miss. Team of the week weighs margin, the opponent's record and winning on the road.</p>`;
  const sel = document.getElementById('awk'); if (sel) sel.onchange = e => location.hash = `awards/${e.target.value}`;
}

/* ---------- 18 · records watch ---------- */
const RECORDS = {
  nfl: [['passingYards', 5477, 'Peyton Manning, 2013', [4000, 5000]], ['passingTouchdowns', 55, 'Peyton Manning, 2013', [30, 40, 50]], ['completions', 485, 'Tom Brady, 2021', [400, 450]], ['rushingYards', 2105, 'Eric Dickerson, 1984', [1000, 1500, 2000]], ['rushingTouchdowns', 28, 'LaDainian Tomlinson, 2006', [10, 15, 20]], ['receptions', 149, 'Cooper Kupp, 2021', [80, 100, 120]], ['receivingYards', 1964, 'Calvin Johnson, 2012', [1000, 1500]], ['receivingTouchdowns', 23, 'Randy Moss, 2007', [10, 15, 20]], ['sacks', 22.5, 'Michael Strahan, 2001 · T.J. Watt, 2021', [10, 15, 20]], ['interceptions', 14, 'Dick "Night Train" Lane, 1952', [5, 8, 10]]],
  cfb: [['passingYards', 5833, 'B.J. Symons, Texas Tech, 2003', [3000, 4000, 5000]], ['passingTouchdowns', 60, 'Joe Burrow, LSU, 2019', [30, 40, 50]], ['rushingYards', 2628, 'Barry Sanders, Oklahoma State, 1988', [1000, 1500, 2000]], ['rushingTouchdowns', 37, 'Barry Sanders, Oklahoma State, 1988', [15, 20, 30]], ['receptions', 155, 'Freddie Barnes, Bowling Green, 2009', [80, 100, 120]], ['receivingYards', 2060, 'Trevor Insley, Nevada, 1999', [1000, 1500]], ['receivingTouchdowns', 27, 'Troy Edwards, Louisiana Tech, 1998', [10, 15, 20]], ['sacks', 24, 'Terrell Suggs, Arizona State, 2002', [10, 15, 20]], ['interceptions', 14, 'Al Worley, Washington, 1968', [5, 8, 10]]]
};
/* NFL leaders built from the live box-score totals (same source as the Stats page), shaped like ESPN's leaders feed */
async function statsAsLeaders(onProgress) {
  const [data, idx] = await Promise.all([seasonStats(onProgress), teamsIndex()]); const roster = await allRosters().catch(() => []); const byId = {}; roster.forEach(p => byId[p.id] = p);
  const defs = [['passingYards', 'Passing Yards', r => r.pa?.[2]], ['passingTouchdowns', 'Passing Touchdowns', r => r.pa?.[3]], ['completions', 'Completions', r => r.pa?.[0]], ['rushingYards', 'Rushing Yards', r => r.ru?.[1]], ['rushingTouchdowns', 'Rushing Touchdowns', r => r.ru?.[2]], ['receptions', 'Receptions', r => r.re?.[1]], ['receivingYards', 'Receiving Yards', r => r.re?.[2]], ['receivingTouchdowns', 'Receiving Touchdowns', r => r.re?.[3]], ['sacks', 'Sacks', r => r.de?.[2]], ['interceptions', 'Interceptions', r => r.in?.[0]]];
  return defs.map(([name, displayName, f]) => ({ name, displayName, leaders: data.rows.map(r => ({ r, v: f(r) || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 60).map(({ r, v }) => { const rp = byId[r.id]; const team = idx[rp?.team?.id || r.tid] || { id: r.tid, abbreviation: '' }; return { value: v, displayValue: /\./.test(String(v)) ? v.toFixed(1) : String(v), athlete: { id: r.id, displayName: r.name, headshot: { href: rp?.hs || hsOf({ id: r.id }) }, position: { abbreviation: rp?.pos || r.pos || guessPos(r) } }, team, live: r.live }; }) }));
}
/* Power 4 single-season conference records (StatMuse / conference record books; sacks before 2000 are from conference books) */
const CONF_RECORDS = {
  sec: { name: 'SEC', passingYards: [5671, 'Joe Burrow, LSU, 2019'], passingTouchdowns: [60, 'Joe Burrow, LSU, 2019'], rushingYards: [2219, 'Derrick Henry, Alabama, 2015'], rushingTouchdowns: [28, 'Derrick Henry, Alabama, 2015'], receptions: [124, 'Amari Cooper, Alabama, 2014'], receivingYards: [1856, 'DeVonta Smith, Alabama, 2020'], receivingTouchdowns: [23, 'DeVonta Smith, Alabama, 2020'], sacks: [27, 'Derrick Thomas, Alabama, 1988'], interceptions: [12, 'Terry Hoage, Georgia, 1982'] },
  b1g: { name: 'Big Ten', passingYards: [4875, 'Dwayne Haskins, Ohio State, 2018'], passingTouchdowns: [50, 'Dwayne Haskins, Ohio State, 2018'], rushingYards: [2587, 'Melvin Gordon, Wisconsin, 2014'], rushingTouchdowns: [33, 'Montee Ball, Wisconsin, 2011'], receptions: [123, 'Charlie Jones, Purdue, 2022'], receivingYards: [1606, 'Jaxon Smith-Njigba, Ohio State, 2021'], receivingTouchdowns: [19, 'Desmond Howard, Michigan, 1991'], sacks: [16.5, 'Chase Young, Ohio State, 2019'], interceptions: [11, 'Jim Leonhard, Wisconsin, 2002'] },
  b12: { name: 'Big 12', passingYards: [5833, 'B.J. Symons, Texas Tech, 2003'], passingTouchdowns: [52, 'B.J. Symons, Texas Tech, 2003'], rushingYards: [2185, 'Troy Davis, Iowa State, 1996'], rushingTouchdowns: [27, 'Ricky Williams, Texas, 1998 · Collin Klein, Kansas State, 2011'], receptions: [134, 'Michael Crabtree, Texas Tech, 2007'], receivingYards: [1962, 'Michael Crabtree, Texas Tech, 2007'], receivingTouchdowns: [25, 'Stedman Bailey, West Virginia, 2012'], sacks: [17, 'Von Miller, Texas A&M, 2009'], interceptions: [10, 'Josh Bullocks, Nebraska, 2003'] },
  acc: { name: 'ACC', passingYards: [4779, 'Kyle McCord, Syracuse, 2024'], passingTouchdowns: [44, 'Kenny Pickett, Pittsburgh, 2021'], rushingYards: [2177, 'Andre Williams, Boston College, 2013'], rushingTouchdowns: [26, 'James Conner, Pittsburgh, 2014'], receptions: [110, 'Malik Washington, Virginia, 2023'], receivingYards: [1604, 'Torry Holt, NC State, 1998'], receivingTouchdowns: [18, 'DeAndre Hopkins, Clemson, 2012'], sacks: [19, 'Peter Boulware, Florida State, 1996'], interceptions: [14, 'Gerod Holliman, Louisville, 2014'] }
};
const CONF_KEYS = ['sec', 'b1g', 'b12', 'acc']; // same order as P4
async function records(conf) {
  view.innerHTML = `<div class="bar"><div><h1>Records watch</h1><h2>Loading leaders…</h2></div></div><div class="prog" id="lp"><i style="width:0"></i></div>`;
  let [cats, idx] = await Promise.all([isCFB() ? fullLeaders(p => { const b = document.querySelector('#lp i'); if (b) b.style.width = p * 100 + '%'; }) : statsAsLeaders(p => { const b = document.querySelector('#lp i'); if (b) b.style.width = p * 100 + '%'; }), teamsIndex()]);
  const ck = isCFB() && CONF_KEYS.includes(conf) ? conf : ''; const CR = ck ? CONF_RECORDS[ck] : null;
  if (ck) { const h2 = document.querySelector('.bar h2'); if (h2) h2.textContent = `Loading the ESPN top 50 for ${CR.name} players…`; cats = await Promise.all(cats.map(c => c.expandable && !c.expanded ? expandCategory(c).catch(() => c) : c)); }
  const confOf = tid => { const t = idx[tid]; const i = t ? p4Index({ name: t.confName || t.conf, abbreviation: t.conf }) : -1; return i >= 0 ? CONF_KEYS[i] : ''; };
  const gpOf = tid => { const st = idx[tid]?.stats; if (!st) return null; const r = recOf({ stats: st }); return r.w + r.l + r.t || null; };
  const total = TOTAL_GAMES(); const defs = (RECORDS[LEAGUE.key] || RECORDS.nfl).map(([name, rec, who, ms]) => CR ? (CR[name] ? [name, CR[name][0], CR[name][1], ms, rec, who] : null) : [name, rec, who, ms]).filter(Boolean); const calF = await seasonCalendar().catch(() => null);
  const blocks = defs.map(([name, rec, who, ms, natRec, natWho]) => { const c = cats.find(x => x.name === name); if (!c?.leaders?.length) return '';
    const pool = ck ? c.leaders.filter(l => confOf(l.team?.id) === ck) : c.leaders; if (!pool.length) return `<div class="panel"><h3>${esc(c.displayName)}<span class="pill">${CR.name} record ${rec} · ${esc(who)}</span></h3><div class="empty">No ${CR.name} players in ESPN's top 50 yet.</div></div>`;
    const rows = pool.slice(0, 40).map(l => { const gp = gpOf(l.team?.id) || Math.max(1, calF?.cur ? calF.cur - 1 : 1); const pace = l.value / gp * total; return { l, gp, pace, pct: pace / rec, t: idx[l.team?.id] || l.team }; }).sort((a, b) => b.pace - a.pace).slice(0, 6);
    const dec = /\./.test(String(rec));
    return `<div class="panel"><h3>${esc(c.displayName)}<span class="pill">${CR ? CR.name + ' ' : ''}record ${rec} · ${esc(who)}${natRec ? ` · <span class="muted">FBS ${natRec}</span>` : ''}</span></h3>${rows.map((r, i) => { const mile = [...ms].reverse().find(m => r.pace >= m); const cls = r.pct >= 1 ? 'rec' : r.pct >= .9 ? 'near' : ''; return `<a class="rw ${cls}" href="#player/${esc(r.l.athlete.id)}" style="--tc:${colorOf(r.t)}"><span class="r">${i + 1}</span><img src="${esc(hsOf(r.l.athlete))}" alt="" loading="lazy"><div><b>${esc(r.l.athlete.displayName)}</b><small>${esc(r.l.athlete.position?.abbreviation || '')} · ${esc(r.t?.abbreviation || '')} · ${esc(r.l.displayValue)} through ${r.gp} game${r.gp === 1 ? '' : 's'}</small><div class="rbar"><i style="width:${Math.min(100, r.pct * 100)}%"></i><em style="left:${Math.min(100, Math.max(0, r.l.value / rec * 100))}%"></em></div></div><span class="v">${dec ? r.pace.toFixed(1) : Math.round(r.pace)}<small>on pace</small>${r.pct >= 1 ? '<small class="livetag">record pace</small>' : mile ? `<small class="mile">${mile.toLocaleString()}+ pace</small>` : ''}</span></a>`; }).join('')}</div>`; }).filter(Boolean);
  view.innerHTML = `<div class="bar"><div><h1>Records watch</h1><h2>Who's on pace for ${CR ? CR.name : LEAGUE.key === 'nfl' ? 'NFL' : 'FBS'} single-season records and milestones · ${total}-game pace${LEAGUE.key === 'nfl' ? ' · totals from box scores, live' : ''}</h2></div>${isCFB() ? `<div class="chips"><a class="chip ${!ck ? 'on' : ''}" href="#records">FBS</a>${CONF_KEYS.map(k => `<a class="chip ${ck === k ? 'on' : ''}" href="#records/${k}">${CONF_RECORDS[k].name}</a>`).join('')}</div>` : ''}</div><div class="grid">${blocks.join('')}</div>
    <p class="note">Pace = current total ÷ the team's games played × ${total}. The bar shows progress toward the ${CR ? CR.name + ' conference' : ''} record; the tick marks where the player is right now. ${CR ? 'Conference records include bowl games (StatMuse / conference record books); sacks before 2000 come from conference books, so Derrick Thomas\'s 27 and Peter Boulware\'s 19 predate the official NCAA stat.' : (LEAGUE.key === 'nfl' ? 'NFL' : 'FBS') + ' single-season records as of 2025.'}${ck ? ' Conference view uses ESPN\'s top 50 per category, so a player outside the national top 50 won\'t appear.' : ''}</p>`;
}

/* ---------- 19 · CFP simulator ---------- */
async function cfpOdds() {
  view.innerHTML = `<div class="bar"><div><h1>CFP odds</h1><h2>Simulating the rest of the season…</h2></div></div><div class="prog" id="op"><i style="width:0"></i></div>`;
  const [M, rk] = await Promise.all([buildModel(), getJSON(`${API}/rankings`, 300000).catch(() => null)]);
  const T = M.T, ids = M.ids; const poll = (rk?.rankings || []).find(p => /cfp|playoff/i.test(p.name)) || (rk?.rankings || []).find(p => /ap/i.test(p.type)) || (rk?.rankings || [])[0];
  const prior = {}; (poll?.ranks || []).forEach(r => prior[r.team?.id] = (26 - r.current) / 5);
  const confOf = id => T[id].conf || T[id].div; const autoOk = id => !/independ/i.test(confOf(id) || '');
  const N = 2000; const out = {}; ids.forEach(id => out[id] = { in: 0, bye: 0, champ: 0, seed: 0, wins: 0 });
  const confs = {}; ids.forEach(id => (confs[confOf(id)] ||= []).push(id));
  const run = (from, to) => { for (let n = from; n < to; n++) {
    const W = {}; ids.forEach(id => W[id] = T[id].w + T[id].t / 2);
    M.remaining.forEach(g => { if (Math.random() < M.pWin(g.h, g.a, g.neutral)) { if (W[g.h] != null) W[g.h]++; } else if (W[g.a] != null) W[g.a]++; });
    const comp = {}; ids.forEach(id => comp[id] = W[id] + T[id].rating / 6 + (prior[id] || 0) + (Math.random() - .5) * .6);
    const champs = Object.entries(confs).filter(([c, m]) => autoOk(m[0])).map(([, m]) => [...m].sort((a, b) => comp[b] - comp[a])[0]);
    champs.forEach(id => out[id].champ++);
    const auto = [...champs].sort((a, b) => comp[b] - comp[a]).slice(0, 5); const rest = ids.filter(id => !auto.includes(id)).sort((a, b) => comp[b] - comp[a]).slice(0, 7);
    const field = [...auto, ...rest].sort((a, b) => comp[b] - comp[a]);
    field.forEach((id, i) => { out[id].in++; out[id].seed += i + 1; if (i < 4) out[id].bye++; });
    ids.forEach(id => out[id].wins += W[id]);
  } };
  for (let i = 0; i < N; i += 250) { run(i, i + 250); const b = document.querySelector('#op i'); if (b) b.style.width = ((i + 250) / N * 100) + '%'; await new Promise(r => setTimeout(r, 0)); }
  const rows = ids.map(id => ({ id, team: T[id].team, conf: confOf(id), rec: `${T[id].w}-${T[id].l}`, xw: out[id].wins / N, p: out[id].in / N, b: out[id].bye / N, c: out[id].champ / N, seed: out[id].in ? out[id].seed / out[id].in : null, rank: (poll?.ranks || []).find(r => r.team?.id === id)?.current })).filter(r => r.p >= .005 || r.rank).sort((a, b) => b.p - a.p || b.xw - a.xw);
  const pct = v => v >= .995 ? '>99%' : v <= .005 ? '<1%' : Math.round(v * 100) + '%'; const cls = v => v >= .75 ? 'pos' : v <= .15 ? 'neg' : '';
  view.innerHTML = `<div class="bar"><div><h1>CFP odds</h1><h2>${N.toLocaleString()} simulations of the remaining regular season · 12-team field, computed on this page</h2></div><a class="chip" href="#playoffs">Current rankings →</a></div>
    <div class="panel"><h3>Playoff contenders<span class="pill">${rows.length} teams</span></h3><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th>Conf</th><th class="num">Record</th><th class="num">Proj. W</th><th class="num">Conf champ</th><th class="num">Make CFP</th><th class="num">Top-4 bye</th><th class="num">Avg seed</th><th>Chance</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="clk ${isFav(r.id) ? 'fav' : ''}" data-t="${esc(r.id)}"><td class="num muted">${r.rank ? r.rank : '–'}</td><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.displayName)}</td><td class="muted">${esc(r.conf)}</td><td class="num">${r.rec}</td><td class="num">${r.xw.toFixed(1)}</td><td class="num">${pct(r.c)}</td><td class="num ${cls(r.p)}"><b>${pct(r.p)}</b></td><td class="num">${pct(r.b)}</td><td class="num">${r.seed ? r.seed.toFixed(1) : '–'}</td><td><div class="obar"><i style="width:${r.p * 100}%"></i></div></td></tr>`).join('')}</tbody></table></div></div>
    <p class="note">Each run plays out the remaining games with the Power Index model, then ranks teams by wins, rating and their current ${esc(poll?.shortName || 'poll')} position as a committee stand-in. The five highest-ranked conference champions get automatic bids, seven at-large teams fill the field, and seeds follow the ranking straight through (top four get byes). # is the current ${esc(poll?.shortName || 'poll')} rank. An estimate for fun, not an official projection.</p>`;
  wire();
}


/* =====================================================================
   v12 · model transparency, live extras, content pages, quality of life
   ===================================================================== */

/* ---------- 1 · prediction log + accuracy page ---------- */
const PRED_KEY = () => LK('pred:' + SEASON);
function logPredictions(M) {
  if (!isCur()) return; try { const log = store.get(PRED_KEY(), {}); let n = 0;
    M.remaining.forEach(g => { if (!g.pre || g.unrated) return; const p = M.pWin(g.h, g.a, g.neutral); const e = log[g.ev.id]; if (!e || Math.abs(e.p - p) > .002) { log[g.ev.id] = { ...(e || {}), wk: g.wk, h: g.h, a: g.a, p: Math.round(p * 1000) / 1000, t: Date.now() }; n++; } });
    if (n) store.set(PRED_KEY(), log); } catch {}
}
function logEspnPrediction(evId, summary) { try { const pr = summary.predictor; const hp = num(pr?.homeTeam?.gameProjection); if (!hp) return; const log = store.get(PRED_KEY(), {}); if (log[evId] && log[evId].espn == null && summary.header?.competitions?.[0]?.status?.type?.state === 'pre') { log[evId].espn = Math.round(hp * 10) / 1000; store.set(PRED_KEY(), log); } } catch {} }
async function accuracy() {
  const [M, idx] = await Promise.all([ratingModel(), teamsIndex()]); const log = store.get(PRED_KEY(), {});
  const done = M.played.map(g => ({ g, e: log[g.ev.id] })).filter(x => x.e);
  if (!done.length) { view.innerHTML = `<div class="bar"><div><h1>Model accuracy</h1><h2>How good are the win probabilities?</h2></div></div><div class="panel"><div class="empty">No scored predictions yet. Probabilities are logged automatically whenever you open a page that uses the model (Scores, Odds, Power index, team pages) before games kick off, then graded here once they're final. Check back after this week's games.</div></div>`; return; }
  const rows = done.map(({ g, e }) => { const hw = g.hs > g.as, tie = g.hs === g.as; const p = e.p; const pick = p >= .5 ? 'h' : 'a'; const correct = tie ? null : (pick === 'h') === hw; const brier = tie ? null : Math.pow(p - (hw ? 1 : 0), 2); const ll = tie ? null : -Math.log(Math.max(1e-6, hw ? p : 1 - p));
    const eb = e.espn != null && !tie ? Math.pow(e.espn - (hw ? 1 : 0), 2) : null; const ec = e.espn != null && !tie ? ((e.espn >= .5) === hw) : null;
    return { g, e, p, hw, tie, correct, brier, ll, eb, ec, upset: tie ? 0 : (hw ? 1 - p : p) }; });
  const graded = rows.filter(r => !r.tie); const n = graded.length; const acc = graded.filter(r => r.correct).length / n; const brier = graded.reduce((s, r) => s + r.brier, 0) / n; const ll = graded.reduce((s, r) => s + r.ll, 0) / n;
  const withE = graded.filter(r => r.eb != null); const eAcc = withE.length ? withE.filter(r => r.ec).length / withE.length : null, eBrier = withE.length ? withE.reduce((s, r) => s + r.eb, 0) / withE.length : null, mBrierE = withE.length ? withE.reduce((s, r) => s + r.brier, 0) / withE.length : null;
  const buckets = [[.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]].map(([lo, hi]) => { const b = graded.filter(r => { const c = Math.max(r.p, 1 - r.p); return c >= lo && c < hi; }); return { lo, hi, n: b.length, hit: b.length ? b.filter(r => r.correct).length / b.length : null, exp: b.length ? b.reduce((s, r) => s + Math.max(r.p, 1 - r.p), 0) / b.length : null }; });
  const upsets = [...graded].sort((x, y) => y.upset - x.upset).slice(0, 8);
  const tm = id => idx[id] || M.T[id]?.team || { abbreviation: '?' };
  view.innerHTML = `<div class="bar"><div><h1>Model accuracy</h1><h2>${n} graded games · ${SEASON} · logged before kickoff, scored after the final</h2></div></div>
    <div class="panel"><div class="kpis"><div class="kpi"><small>Straight-up</small><b>${Math.round(acc * 100)}%</b></div><div class="kpi"><small>Brier score</small><b>${brier.toFixed(3)}</b></div><div class="kpi"><small>Log loss</small><b>${ll.toFixed(3)}</b></div><div class="kpi"><small>Coin flip Brier</small><b class="muted">0.250</b></div>${eBrier != null ? `<div class="kpi"><small>ESPN FPI · same ${withE.length} games</small><b>${Math.round(eAcc * 100)}% · ${eBrier.toFixed(3)}</b></div><div class="kpi"><small>This model · same games</small><b>${mBrierE.toFixed(3)}</b></div>` : ''}</div></div>
    <div class="two"><div class="panel"><h3>Calibration<span class="pill">confidence vs. actual hit rate</span></h3><div class="calib">${buckets.map(b => `<div class="cb"><small>${Math.round(b.lo * 100)}–${Math.min(100, Math.round(b.hi * 100))}%</small><div class="cbt"><i class="exp" style="height:${(b.exp || 0) * 100}%"></i><i class="act" style="height:${(b.hit || 0) * 100}%"></i></div><b>${b.hit == null ? '–' : Math.round(b.hit * 100) + '%'}</b><em>${b.n} games</em></div>`).join('')}</div><div class="legend"><span><i style="background:var(--muted)"></i>Model confidence</span><span><i></i>Actual win rate</span></div><p class="note" style="padding:0 14px 12px;margin:0">Well-calibrated means the green bar matches the grey one in every bucket: 70% favorites should win about 70% of the time.</p></div>
    <div class="panel"><h3>Biggest upsets<span class="pill">by pre-game probability</span></h3>${upsets.map(r => { const win = r.hw ? r.g.h : r.g.a, lose = r.hw ? r.g.a : r.g.h; return `<a class="leader" style="grid-template-columns:auto 1fr auto" href="#game/${esc(r.g.ev.id)}"><img src="${esc(logo(tm(win)))}" alt=""><div><div class="nm">${esc(tm(win).abbreviation)} ${r.hw ? r.g.hs : r.g.as}, ${esc(tm(lose).abbreviation)} ${r.hw ? r.g.as : r.g.hs}</div><div class="sub">Week ${esc(r.g.ev.week?.number)} · model had ${esc(tm(lose).abbreviation)} at ${Math.round((1 - r.upset) * 100)}%${r.e.espn != null ? ` · ESPN ${Math.round((r.hw ? 1 - r.e.espn : r.e.espn) * 100)}% upset` : ''}</div></div><span class="val ${r.upset > .5 ? 'neg' : ''}">${Math.round(r.upset * 100)}%</span></a>`; }).join('')}</div></div>
    <p class="note">Brier score is the average squared error of the probabilities (0 is perfect, 0.25 is a coin flip; good NFL models land around 0.20). ESPN's number comes from the game page's predictor and is only captured for games you opened before kickoff.</p>`;
}

/* ---------- 2 · rating history ---------- */
const RHIST_KEY = () => LK('rhist:' + SEASON);
function snapshotRatings(M) {
  if (!isCur()) return; try { const wk = (cache.get(SB_URL())?.v?.week?.number) || Math.max(1, ...M.played.map(g => g.ev.week?.number || 0)); const h = store.get(RHIST_KEY(), {}); const cur = {}; M.ids.forEach(id => cur[id] = Math.round(M.T[id].rating * 10) / 10); h[wk] = cur; store.set(RHIST_KEY(), h); } catch {}
}
function ratingDelta(id) { const h = store.get(RHIST_KEY(), {}); const wks = Object.keys(h).map(Number).sort((a, b) => a - b); if (wks.length < 2) return null; const cur = h[wks[wks.length - 1]][id], prev = h[wks[wks.length - 2]][id]; return cur != null && prev != null ? cur - prev : null; }
function ratingHistoryHTML(id) { const h = store.get(RHIST_KEY(), {}); const wks = Object.keys(h).map(Number).sort((a, b) => a - b).filter(w => h[w][id] != null); if (wks.length < 2) return ''; const v = wks.map(w => h[w][id]); const mn = Math.min(...v, 0), mx = Math.max(...v, 0); return `<div class="panel"><h3>Power rating over time</h3><div class="chart">${signedLine(v, wks.map(w => 'W' + w))}</div></div>`; }
function signedLine(v, labels, { h = 150, w = 520 } = {}) {
  const pad = { l: 34, r: 10, t: 10, b: 22 }; const mx = Math.max(...v.map(Math.abs), 2) * 1.1; const n = v.length;
  const x = i => pad.l + i * (w - pad.l - pad.r) / Math.max(1, n - 1), y = val => pad.t + (h - pad.t - pad.b) * (1 - (val + mx) / (2 * mx));
  const pts = v.map((val, i) => `${x(i)},${y(val)}`);
  return `<svg viewBox="0 0 ${w} ${h}"><g class="grid">${[-mx, 0, mx].map(val => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(val)}" y2="${y(val)}" class="${val === 0 ? 'mid' : ''}"/><text x="${pad.l - 4}" y="${y(val) + 3}" text-anchor="end">${sgn(Math.round(val))}</text>`).join('')}</g><path class="wpf" d="M${x(0)},${y(0)}L${pts.join('L')}L${x(n - 1)},${y(0)}Z"/><path class="wp" d="M${pts.join('L')}"/>${v.map((val, i) => `<circle cx="${x(i)}" cy="${y(val)}" r="3" class="pt"/>`).join('')}${labels.map((l, i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
}

/* ---------- 5 · projected finish ---------- */
function finishHTML(out, id, N, T) { const d = out[id]?.divW; if (!d) return ''; const ws = Object.keys(d).map(Number).sort((a, b) => a - b); const mx = Math.max(...ws.map(w => d[w])); const mode = ws.reduce((b, w) => d[w] > d[b] ? w : b, ws[0]); const total = TOTAL_GAMES(); const cur = T[id].w;
  const pAtLeast = k => ws.filter(w => w >= k).reduce((s, w) => s + d[w], 0) / N;
  return `<div class="panel"><h3>Projected finish<span class="pill">most likely ${mode}-${total - mode}</span></h3><div class="dist">${ws.map(w => `<div class="db ${w === mode ? 'mode' : ''} ${w < cur ? 'past' : ''}"><i style="height:${d[w] / mx * 100}%"></i><b>${w}</b><small>${(v => v >= .995 ? '>99' : v <= .005 ? '<1' : Math.round(v * 100))(d[w] / N)}%</small></div>`).join('')}</div><div class="kpis" style="padding-top:0">${[Math.ceil(total * .5), Math.ceil(total * .65), Math.ceil(total * .8)].filter((v, i, a) => a.indexOf(v) === i && v >= cur).map(k => `<div class="kpi"><small>${k}+ wins</small><b>${(v => v >= .995 ? '>99%' : v <= .005 ? '<1%' : Math.round(v * 100) + '%')(pAtLeast(k))}</b></div>`).join('')}</div></div>`; }

/* ---------- 6 · pinned mini-scorebug ---------- */
let pinTimer = null;
function pinGame(id) { store.set(LK('pin'), id || null); renderPin(); toast(id ? 'Pinned · follows you on every page' : 'Unpinned'); }
async function renderPin() {
  const id = store.get(LK('pin'), null); let bar = document.getElementById('pinbar'); clearInterval(pinTimer); pinTimer = null;
  if (!id || location.hash.startsWith('#game/' + id) || location.hash.startsWith('#multi')) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('a'); bar.id = 'pinbar'; bar.className = 'pinbar'; document.body.appendChild(bar); }
  bar.href = '#game/' + id;
  const draw = async () => { try { const sb = await getJSON(SB_URL(), 15000); const ev = sb.events.find(e => e.id === String(id)); if (!ev) { pinGame(null); return; } const c = ev.competitions[0], st = ev.status.type, [a, h] = byHome(c); const sit = c.situation || {};
      const side = (t, home) => `<span class="pt ${sit.possession === t.id ? 'poss' : ''}" style="--tc:${colorOf(t.team)}"><img src="${esc(t.team.logo)}" alt=""><b>${esc(t.team.abbreviation)}</b><em class="num">${st.state === 'pre' ? '' : esc(t.score)}</em></span>`;
      bar.innerHTML = `${side(a)}<span class="pm"><b>${st.state === 'in' ? '<i class="dot"></i>' + esc(fmtClock(st, c)) : st.state === 'pre' ? esc(fmtShort(ev.date)) : esc(st.shortDetail)}</b><small>${st.state === 'in' ? esc(sit.downDistanceText || sit.lastPlay?.text?.slice(0, 60) || '') : ''}</small></span>${side(h, true)}<button class="px" data-unpin aria-label="Unpin">×</button>`;
      bar.querySelector('[data-unpin]').onclick = e => { e.preventDefault(); e.stopPropagation(); pinGame(null); };
      if (st.completed) { clearInterval(pinTimer); pinTimer = null; } } catch {} };
  await draw(); pinTimer = setInterval(() => { if (!document.hidden) draw(); }, LIVE_MS());
}

/* ---------- 7 · hot-game auto-switch ---------- */
const excitement = ev => { const c = ev.competitions[0], [a, h] = byHome(c); const margin = Math.abs(num(a.score) - num(h.score)); const q = c.status?.period || 1; const [m] = (c.status?.displayClock || '15:00').split(':'); const late = q >= 4 ? 1 - num(m) / 15 : (q - 1) / 4 * .5; return (c.situation?.isRedZone ? 3 : 0) + late * 4 + Math.max(0, 3 - margin / 4) + (favGame(ev) ? 2 : 0); };
let switchT = null, lastSwitchTarget = null;
function hotCheck(events, currentId) {
  if (!store.get('autoSwitch', false) || switchT) return;
  const live = events.filter(e => e.status.type.state === 'in'); if (live.length < 2 && currentId) return;
  const best = [...live].sort((x, y) => excitement(y) - excitement(x))[0]; if (!best || best.id === currentId || best.id === lastSwitchTarget) return;
  const cur = live.find(e => e.id === currentId); const c = best.competitions[0]; const hot = c.situation?.isRedZone || ((c.status?.period || 0) >= 4 && Math.abs(num(c.competitors[0].score) - num(c.competitors[1].score)) <= 8);
  if (!hot || (cur && excitement(best) < excitement(cur) + 2.5)) return;
  const [a, h] = byHome(c); let n = 10; lastSwitchTarget = best.id;
  let bar = document.getElementById('switchbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'switchbar'; document.body.appendChild(bar); }
  const draw = () => bar.innerHTML = `<span><i class="dot"></i>Switching to <b>${esc(a.team.abbreviation)} @ ${esc(h.team.abbreviation)}</b> in ${n}s · ${esc(c.situation?.isRedZone ? 'red zone' : 'close in the 4th')}</span><button class="chip" data-go>Go now</button><button class="chip" data-cancel>Stay</button>`;
  const stop = () => { clearInterval(switchT); switchT = null; bar.remove(); };
  draw(); bar.classList.add('show');
  bar.onclick = e => { if (e.target.closest('[data-cancel]')) stop(); if (e.target.closest('[data-go]')) { stop(); location.hash = 'game/' + best.id; } };
  switchT = setInterval(() => { n--; if (n <= 0) { stop(); location.hash = 'game/' + best.id; } else draw(); }, 1000);
}

/* ---------- 8 · haptics ---------- */
function buzz(kind) { if (!store.get('haptics', true) || !navigator.vibrate) return; try { navigator.vibrate(kind === 'score' ? [80, 40, 80] : kind === 'turnover' ? [160] : [40]); } catch {} }

/* ---------- 9 · "if scores hold" seeding (NFL) ---------- */
async function ifHoldHTML(events) {
  if (!LEAGUE.hasDivisions || !isCur()) return ''; const liveOrDone = events.filter(e => e.status.type.state !== 'pre'); if (!events.some(e => e.status.type.state === 'in')) return '';
  const M = await ratingModel().catch(() => null); if (!M) return ''; const T = M.T;
  const seedsFor = applyThisWeek => { const W = {}, PD = {}, H = {}; M.ids.forEach(id => { W[id] = T[id].w + T[id].t / 2; PD[id] = T[id].pf - T[id].pa; });
    M.played.forEach(g => { const k = g.a + '|' + g.h; (H[k] ||= [0, 0]); if (g.as > g.hs) H[k][0]++; else if (g.hs > g.as) H[k][1]++; });
    if (applyThisWeek) events.forEach(ev => { const c = ev.competitions[0]; if (c.status?.type?.completed) return; if (ev.status.type.state !== 'in') return; const [a, h] = byHome(c); if (!T[a.team.id] || !T[h.team.id]) return; const as = num(a.score), hs = num(h.score); const k = a.team.id + '|' + h.team.id; (H[k] ||= [0, 0]); if (as > hs) { W[a.team.id]++; H[k][0]++; } else if (hs > as) { W[h.team.id]++; H[k][1]++; } else { W[a.team.id] += .5; W[h.team.id] += .5; } PD[a.team.id] += as - hs; PD[h.team.id] += hs - as; });
    const cmp = (x, y) => { if (W[y] !== W[x]) return W[y] - W[x]; const k1 = H[x + '|' + y] || [0, 0], k2 = H[y + '|' + x] || [0, 0]; const xw = k1[0] + k2[1], yw = k1[1] + k2[0]; if (xw !== yw) return yw - xw; return PD[y] - PD[x]; };
    const divs = {}; M.ids.forEach(id => (divs[T[id].conf + '/' + T[id].div] ||= []).push(id)); const confs = {}; M.ids.forEach(id => (confs[T[id].conf] ||= []).push(id)); const seed = {};
    Object.entries(confs).forEach(([conf, cids]) => { const winners = Object.entries(divs).filter(([k]) => k.startsWith(conf + '/')).map(([, m]) => [...m].sort(cmp)[0]).sort(cmp); const rest = cids.filter(id => !winners.includes(id)).sort(cmp); [...winners, ...rest].forEach((id, i) => seed[id] = i + 1); });
    return seed; };
  const before = seedsFor(false), after = seedsFor(true);
  const changes = M.ids.filter(id => before[id] !== after[id] && (before[id] <= 8 || after[id] <= 8)).sort((x, y) => after[x] - after[y]);
  if (!changes.length) return '';
  return `<div class="panel"><h3>If today's scores hold<span class="pill">seed changes · live</span></h3><div class="holds">${changes.map(id => `<a class="hold ${after[id] < before[id] ? 'up' : 'down'}" href="#team/${esc(id)}"><img src="${esc(logo(T[id].team))}" alt=""><b>${esc(T[id].team.abbreviation)}</b><small>${esc(T[id].conf)}</small><span class="num">${before[id]} → <b>${after[id]}</b></span><em>${after[id] <= 7 && before[id] > 7 ? 'into the field' : after[id] > 7 && before[id] <= 7 ? 'out of the field' : after[id] < before[id] ? 'up' : 'down'}</em></a>`).join('')}</div></div>`;
}

/* ---------- 11 · matchup preview ---------- */
function previewText(M, aId, hId, odds, neutral) {
  const A = M.T[aId], H = M.T[hId]; if (!A || !H) return ''; const p = M.pWin(hId, aId, neutral); const fav = p >= .5 ? H : A, dog = fav === H ? A : H; const pf = Math.max(p, 1 - p);
  const spread = (H.rating - A.rating) + (neutral ? 0 : HFA()); const modelLine = `${esc(fav.team.abbreviation)} by ${Math.abs(spread).toFixed(1)}`;
  const rk = (arr, id, key, asc) => { const s = [...arr].sort((x, y) => asc ? M.T[x][key] - M.T[y][key] : M.T[y][key] - M.T[x][key]); return s.indexOf(id) + 1; };
  const n = M.ids.length; const oA = rk(M.ids, aId, 'off'), oH = rk(M.ids, hId, 'off'), dA = rk(M.ids, aId, 'def', true), dH = rk(M.ids, hId, 'def', true);
  const edge = (x, y) => Math.abs(x - y) >= n * .15 ? (x < y ? 'has the edge' : 'is at a disadvantage') : 'is an even matchup';
  const lineTxt = odds?.details ? ` The line is ${esc(odds.details)}${odds.overUnder ? ` (O/U ${esc(odds.overUnder)})` : ''}; the model makes it ${modelLine}${(() => { const m = String(odds.details).match(/([A-Z]+)\s*(-?\d+(?:\.\d+)?)/); if (!m) return ''; const vegasFav = m[1], vs = Math.abs(num(m[2])); const diff = (vegasFav === fav.team.abbreviation ? Math.abs(spread) - vs : -Math.abs(spread) - vs); return Math.abs(diff) >= 3 ? `, so it likes <b>${diff > 0 ? esc(fav.team.abbreviation) : esc(dog.team.abbreviation)}</b> against the number` : ', in line with the market'; })()}.` : ` The model makes it ${modelLine}.`;
  return `<p class="preview"><b>${esc(fav.team.displayName)}</b> ${pf >= .75 ? 'are heavy favorites' : pf >= .6 ? 'are favored' : 'are slight favorites'} at <b>${Math.round(pf * 100)}%</b> (rating ${sgn(fav.rating.toFixed(1))} vs ${sgn(dog.rating.toFixed(1))}${neutral ? ', neutral site' : fav === H ? ', at home' : ', on the road'}).${lineTxt} ${esc(A.team.abbreviation)}'s offense ranks <b>${ord(oA)}</b> against ${esc(H.team.abbreviation)}'s <b>${ord(dH)}</b>-ranked defense, which ${edge(oA, dH)} for ${esc(A.team.abbreviation)}; the other way, ${esc(H.team.abbreviation)}'s <b>${ord(oH)}</b> offense meets a <b>${ord(dA)}</b> defense and ${edge(oH, dA)}.${A.last3 - A.srs > 4 ? ` ${esc(A.team.abbreviation)} are trending up.` : ''}${H.last3 - H.srs > 4 ? ` ${esc(H.team.abbreviation)} are trending up.` : ''}</p>`;
}

/* ---------- 12 · weekly recap ---------- */
async function recap(wk) {
  const calF = await seasonCalendar(); const cw = isCur() ? Math.min(calF.cur || 1, calF.reg.length) : calF.reg.length;
  view.innerHTML = `<div class="bar"><div><h1>Weekly recap</h1><h2>Reading results…</h2></div></div><div class="prog" id="ap"><i style="width:0"></i></div>`;
  const [M, idx] = await Promise.all([ratingModel(), teamsIndex()]); const reg = M.games.filter(e => !e._post);
  const lastDone = Math.max(0, ...reg.filter(e => e.status?.type?.completed).map(e => e.week?.number || 0)); const w = Number(wk) || lastDone || cw;
  const evs = reg.filter(e => e.week?.number === w && e.status?.type?.completed); const log = store.get(PRED_KEY(), {});
  const games = evs.map(ev => { const c = ev.competitions[0], [a, h] = byHome(c); const as = scoreOf(a), hs = scoreOf(h); const e = log[ev.id]; const p = e?.p ?? (M.T[h.team.id] && M.T[a.team.id] ? M.pWin(h.team.id, a.team.id, !!c.neutralSite) : .5); const hw = hs > as; const win = hw ? h : a, lose = hw ? a : h;
    return { ev, a, h, as, hs, win, lose, margin: Math.abs(hs - as), upset: hs === as ? 0 : (hw ? 1 - p : p), logged: !!e, ws: Math.max(hs, as), ls: Math.min(hs, as) }; });
  const rookies = LEAGUE.key === 'nfl' ? new Set((await allRosters().catch(() => [])).filter(isRookie).map(p => String(p.id))) : null;
  const aw = await weekAwards(evs, idx, rookies).catch(() => null);
  const hist = store.get(RHIST_KEY(), {}); const wks = Object.keys(hist).map(Number).sort((a, b) => a - b); const movers = (() => { const i = wks.indexOf(w + 1) >= 0 ? wks.indexOf(w + 1) : wks.length - 1; if (i < 1) return []; const cur = hist[wks[i]], prev = hist[wks[i - 1]]; return M.ids.map(id => ({ id, d: cur[id] != null && prev[id] != null ? cur[id] - prev[id] : null })).filter(x => x.d != null).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 8); })();
  const gcard = g => `<a class="game" href="#game/${esc(g.ev.id)}" style="--ca:${colorOf(g.a.team)};--cb:${colorOf(g.h.team)}"><div class="team ${g.a === g.win ? 'w' : 'l'}"><img src="${esc(g.a.team.logo)}" alt=""><b>${esc(g.a.team.displayName)}</b></div><div class="score">${g.as}</div><div class="team ${g.h === g.win ? 'w' : 'l'}"><img src="${esc(g.h.team.logo)}" alt=""><b>${esc(g.h.team.displayName)}</b></div><div class="score">${g.hs}</div></a>`;
  const list = (title, pill, arr, f) => `<div class="panel"><h3>${title}<span class="pill">${pill}</span></h3>${arr.length ? arr.map(g => `${gcard(g)}<div class="recap-why">${f(g)}</div>`).join('') : '<div class="empty">Nothing here this week.</div>'}</div>`;
  const upsets = games.filter(g => g.upset > .5).sort((x, y) => y.upset - x.upset).slice(0, 5), close = [...games].sort((x, y) => x.margin - y.margin).slice(0, 5).filter(g => g.margin <= 7), blow = [...games].sort((x, y) => y.margin - x.margin).slice(0, 5).filter(g => g.margin >= 17);
  const pcard = (title, list, key) => list?.length ? `<div class="panel award"><h3>${title}</h3>${list.slice(0, 1).map(r => `<a class="aw win" href="#player/${esc(r.id)}" style="--tc:${colorOf(r.team)}"><img src="${esc(hsOf({ id: r.id }))}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(r.name)}</b><small>${esc(r.pos)} · ${esc(r.team?.abbreviation || '')} · ${esc(r.line.join(' · '))}</small></div><span class="v">${r[key]}<small>pts</small></span></a>`).join('')}</div>` : '';
  view.innerHTML = `<div class="bar"><div><h1>Week ${w} recap</h1><h2>${games.length} games · upsets by pre-game win probability, closest finishes, blowouts, rating movers</h2></div><div class="row"><select id="rwk" aria-label="Week">${Array.from({ length: Math.max(lastDone, w) }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select><a class="chip" href="#awards/${w}">Full awards →</a></div></div>
    ${games.length ? `<div class="grid">
      ${list('Biggest upsets', games.some(g => g.logged) ? 'from logged probabilities' : 'from current ratings', upsets, g => `${esc(g.win.team.abbreviation)} had a <b>${Math.round((1 - g.upset) * 100)}%</b> chance`)}
      ${list('Closest finishes', 'one-score games', close, g => `Decided by ${g.margin}${g.margin === 0 ? ' · tie' : ''}`)}
      ${list('Blowouts', 'margin 17+', blow, g => `${esc(g.win.team.abbreviation)} by ${g.margin}`)}
      ${movers.length ? `<div class="panel"><h3>Rating movers<span class="pill">Power index Δ</span></h3>${movers.map(x => `<a class="leader" style="grid-template-columns:auto 1fr auto" href="#team/${esc(x.id)}"><img src="${esc(logo(M.T[x.id].team))}" alt=""><div><div class="nm">${esc(M.T[x.id].team.displayName)}</div><div class="sub">now ${sgn(M.T[x.id].rating.toFixed(1))}</div></div><span class="val ${x.d > 0 ? 'pos' : 'neg'}">${sgn(x.d.toFixed(1))}</span></a>`).join('')}</div>` : ''}
      ${aw ? pcard('Offensive player of the week', aw.off, 'off') + pcard('Defensive player of the week', aw.def, 'def') : ''}
    </div>` : '<div class="panel"><div class="empty">No completed games in this week yet.</div></div>'}`;
  document.getElementById('rwk').onchange = e => location.hash = `recap/${e.target.value}`;
}

/* ---------- 13 · bowl projections (CFB) ---------- */
async function bowls() {
  if (!isCFB()) { view.innerHTML = `<div class="bar"><div><h1>Bowl projections</h1></div></div><div class="panel"><div class="empty">Bowl projections are a college football page. Switch to CFB in the header.</div></div>`; return; }
  view.innerHTML = `<div class="bar"><div><h1>Bowl projections</h1><h2>Simulating…</h2></div></div><div class="prog" id="op"><i style="width:0"></i></div>`;
  const [M, rk] = await Promise.all([ratingModel(), getJSON(`${API}/rankings`, 300000).catch(() => null)]); const T = M.T; const N = 1500;
  const out = await simSeason(M, N, p => { const b = document.querySelector('#op i'); if (b) b.style.width = p * 100 + '%'; });
  const poll = (rk?.rankings || []).find(p => /cfp|playoff/i.test(p.name)) || (rk?.rankings || []).find(p => /ap/i.test(p.type)) || (rk?.rankings || [])[0];
  const ranks = (poll?.ranks || []).map(r => r.team?.id).filter(id => T[id]);
  const remOf = id => M.remaining.filter(g => g.a === id || g.h === id).length;
  const rows = M.ids.map(id => { const w = T[id].w, rem = remOf(id); const d = out[id].divW; const p6 = Object.keys(d).filter(k => Number(k) >= 6).reduce((s, k) => s + d[k], 0) / N; const status = w >= 6 ? 'Eligible' : w + rem < 6 ? 'Eliminated' : `Needs ${6 - w} of ${rem}`; return { id, team: T[id].team, conf: T[id].conf, w, l: T[id].l, rem, p6, status, xw: out[id].wins / N }; });
  const elig = rows.filter(r => r.status === 'Eligible').length, alive = rows.filter(r => r.status.startsWith('Needs')).length, outc = rows.filter(r => r.status === 'Eliminated').length; const expected = rows.reduce((s, r) => s + r.p6, 0);
  const field = ranks.slice(0, 12), next = ranks.slice(12, 20);
  const card = (id, i, lbl) => `<a class="seed-card" href="#team/${esc(id)}" style="--tc:${colorOf(T[id].team)}"><span class="sd">${lbl ?? i + 1}</span><img src="${esc(logo(T[id].team))}" alt=""><div><b>${esc(T[id].team.abbreviation)}</b><small>${T[id].w}-${T[id].l}</small></div></a>`;
  view.innerHTML = `<div class="bar"><div><h1>Bowl projections</h1><h2>Eligibility tracker and playoff field · ${esc(poll?.shortName || '')}</h2></div><a class="chip" href="#odds">CFP odds →</a></div>
    <div class="panel"><div class="kpis"><div class="kpi"><small>Bowl eligible now</small><b>${elig}</b></div><div class="kpi"><small>Still alive</small><b>${alive}</b></div><div class="kpi"><small>Eliminated</small><b>${outc}</b></div><div class="kpi"><small>Expected eligible</small><b>${expected.toFixed(0)}</b></div><div class="kpi"><small>Bowl spots</small><b class="muted">~82</b></div></div></div>
    <div class="two"><div class="stack"><div class="panel"><h3>Projected playoff field<span class="pill">straight seeding from the poll</span></h3><div class="lhead" style="grid-template-columns:1fr"><span>Byes</span></div><div class="byes">${field.slice(0, 4).map((id, i) => card(id, i)).join('')}</div><div class="lhead" style="grid-template-columns:1fr"><span>First round hosts &amp; visitors</span></div><div class="byes">${field.slice(4).map((id, i) => card(id, i + 4)).join('')}</div></div>
      <div class="panel"><h3>Next in line<span class="pill">13–20 · New Year's Six at-large pool</span></h3><div class="byes">${next.map((id, i) => card(id, i + 12)).join('')}</div></div></div>
    <div class="panel"><h3>Eligibility<span class="pill">6 wins · ${rows.length} teams · scroll</span><input id="bq" placeholder="Find a team" style="padding:4px 8px;font-size:12px;margin-left:auto;width:140px"></h3><div class="tw scrolly"><table id="bt" class="stats"><thead><tr><th class="sort" data-k="team">Team</th><th class="sort" data-k="conf">Conf</th><th class="num sort" data-k="w">Record</th><th class="num sort" data-k="rem">Left</th><th class="num sort" data-k="xw">Proj. W</th><th class="num sort" data-k="p6">6+ wins</th><th class="sort" data-k="status">Status</th></tr></thead><tbody></tbody></table></div></div></div>`;
  const bq = document.getElementById('bq'); const rowsFor = () => { const q = (bq?.value || '').toLowerCase(); return q ? rows.filter(r => (r.team.displayName + ' ' + r.conf).toLowerCase().includes(q)) : rows; };
  const drawB = () => sortable(document.getElementById('bt'), rowsFor(), { team: r => r.team.displayName, conf: r => r.conf, w: r => r.w + r.xw / 100, rem: r => r.rem, xw: r => r.xw, p6: r => r.p6, status: r => r.status }, r => `<tr class="clk ${isFav(r.id) ? 'fav' : ''}" data-t="${esc(r.id)}"><td class="tm"><img src="${esc(logo(r.team))}" alt="">${esc(r.team.displayName)}</td><td class="muted">${esc(r.conf)}</td><td class="num">${r.w}-${r.l}</td><td class="num">${r.rem}</td><td class="num">${r.xw.toFixed(1)}</td><td class="num ${r.p6 >= .75 ? 'pos' : r.p6 <= .15 ? 'neg' : ''}">${r.p6 >= .995 ? '>99%' : r.p6 <= .005 ? '<1%' : Math.round(r.p6 * 100) + '%'}</td><td><span class="tag ${r.status === 'Eligible' ? 'ok' : r.status === 'Eliminated' ? 'out' : ''}">${esc(r.status)}</span></td></tr>`, 'p6');
  drawB(); if (bq) bq.oninput = drawB;
  document.getElementById('bt').addEventListener('drawn', wire); wire();
}

/* ---------- 14 · coaching / QB change markers ---------- */
const CHANGE_RE = /named (the )?(starting|starter)|starting (qb|quarterback)|benched|head coach|fired|interim|coaching change|relieved of/i;
async function teamChanges(id, abbr, name) {
  const out = []; try { const n = await getJSON(`${API}/news?limit=100`, 300000); (n.articles || []).forEach(a => { const txt = (a.headline || '') + ' ' + (a.description || ''); const mine = (a.categories || []).some(c => String(c.teamId || c.team?.id) === String(id)) || new RegExp(`\\b(${abbr}|${name.split(' ').pop()})\\b`, 'i').test(txt); if (mine && CHANGE_RE.test(txt)) out.push({ date: a.published, text: a.headline, href: a.links?.web?.href }); }); } catch {}
  if (LEAGUE.key === 'nfl') try { (await transactionsFeed()).filter(t => t.team?.id === String(id) && /trade|acquir|signed qb|released qb/i.test(t.description)).slice(0, 3).forEach(t => out.push({ date: t.date, text: t.description.slice(0, 90) })); } catch {}
  return out.sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 6);
}

/* ---------- 15 · share cards (canvas → PNG) ---------- */
function loadImg(src) { return new Promise(res => { if (!src) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
async function shareCard({ title, sub, rows, logos = [], footer = 'gridiron desk' }) {
  const W = 1080, pad = 56, rowH = 76; const H = 300 + rows.length * rowH; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  const dark = root.dataset.theme !== 'light'; ctx.fillStyle = dark ? '#0b0f14' : '#f7f8fa'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, 10, H);
  const imgs = await Promise.all(logos.map(loadImg)); let y = pad + 40;
  ctx.fillStyle = dark ? '#f1f5f9' : '#0b0f14'; ctx.font = '800 54px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(title.toUpperCase(), pad, y); y += 36;
  ctx.fillStyle = dark ? '#94a3b8' : '#475569'; ctx.font = '500 24px Barlow, sans-serif'; ctx.fillText(sub, pad, y); y += 50;
  imgs.forEach((im, i) => { if (im) try { ctx.drawImage(im, W - pad - 96 * (imgs.length - i), pad - 10, 84, 84); } catch {} });
  rows.forEach((r, i) => { ctx.fillStyle = i % 2 ? (dark ? '#111822' : '#eef1f5') : 'transparent'; ctx.fillRect(pad - 16, y - 46, W - pad * 2 + 32, rowH); ctx.fillStyle = dark ? '#f1f5f9' : '#0b0f14'; ctx.font = '700 34px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(r.left, pad, y); if (r.mid) { ctx.fillStyle = dark ? '#94a3b8' : '#475569'; ctx.font = '500 22px Barlow, sans-serif'; ctx.fillText(r.mid, pad + 340, y); } ctx.fillStyle = r.hl ? '#22c55e' : (dark ? '#f1f5f9' : '#0b0f14'); ctx.font = '800 40px "JetBrains Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText(String(r.right), W - pad, y); ctx.textAlign = 'left'; y += rowH; });
  ctx.fillStyle = dark ? '#475569' : '#94a3b8'; ctx.font = '600 20px Barlow, sans-serif'; ctx.fillText(footer.toUpperCase() + ' · ' + new Date().toLocaleDateString(), pad, H - 36);
  let blob; try { blob = await new Promise(res => cv.toBlob(res, 'image/png')); } catch { toast('Could not render the card (logos blocked)'); return; }
  const file = new File([blob], title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title }); return; } catch {} }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Card saved');
}

/* ---------- 16 · keyboard navigation ---------- */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
  const [r] = (location.hash.slice(1) || 'home').split('/');
  if (e.key === 'r' || e.key === 'R') { location.hash = 'redzone'; return; }
  if (r === 'scores') { if (e.key === 'ArrowLeft') document.getElementById('prevw')?.click(); else if (e.key === 'ArrowRight') document.getElementById('nextw')?.click(); else if (/^[1-9]$/.test(e.key)) { const g = view.querySelectorAll('.stack a.game')[Number(e.key) - 1]; if (g) location.hash = g.getAttribute('href').slice(1); } }
  if (e.key === 'Escape') document.getElementById('switchbar')?.querySelector('[data-cancel]')?.click();
});

/* ---------- 17 · stale-data fallback ---------- */
const STALE = { at: null };
function staleBadge() { return STALE.at ? `<span class="tag out" title="ESPN's feed failed; showing the last copy from ${esc(fmtDate(STALE.at))}">stale · ${esc(ago(STALE.at))}</span>` : ''; }

/* ---------- 18 · settings export / import ---------- */
const SETTING_KEYS = ['league', 'season', 'theme', 'fformat', 'fpos', 'liveInterval', 'sound', 'notify', 'haptics', 'autoSwitch', 'ptrend'];
function exportSettings() { const o = {}; try { Object.keys(localStorage).forEach(k => { if (SETTING_KEYS.includes(k) || /:(favTeams|sbFilter|pin)$/.test(k)) o[k] = localStorage.getItem(k); }); } catch {} return JSON.stringify({ v: 1, app: 'gridiron-desk', at: new Date().toISOString(), data: o }, null, 0); }
function importSettings(txt) { const j = JSON.parse(txt); if (j?.app !== 'gridiron-desk' || !j.data) throw new Error('Not a Gridiron Desk settings file'); let n = 0; Object.entries(j.data).forEach(([k, v]) => { if (SETTING_KEYS.includes(k) || /:(favTeams|sbFilter|pin)$/.test(k)) { localStorage.setItem(k, v); n++; } }); return n; }

/* ---------- 19 · one summary fetch per game, shared by fantasy / awards / usage ---------- */
async function gameLines(ev) {
  const key = LK('gl4:' + ev.id); const done = ev.status?.type?.completed; let c = done ? store.get(key, null) : null; if (c) return c;
  const s = await getJSON(`${API}/summary?event=${ev.id}`, done ? 86400000 : 60000);
  const usage = {}; (s.boxscore?.players || []).forEach(side => { const t = { tg: 0, car: 0, rec: 0, ry: 0, p: {} }; const rec = side.statistics.find(x => x.name === 'receiving'), ru = side.statistics.find(x => x.name === 'rushing'); const ti = rec?.labels.indexOf('TGTS') ?? -1, ri = rec?.labels.indexOf('REC') ?? -1, ryi = rec?.labels.indexOf('YDS') ?? -1, ci = ru?.labels.indexOf('CAR') ?? -1, ruyi = ru?.labels.indexOf('YDS') ?? -1;
    (rec?.athletes || []).forEach(a => { const tg = ti >= 0 ? num(a.stats[ti]) : 0; t.tg += tg; t.rec += num(a.stats[ri]); t.ry += num(a.stats[ryi]); const r = (t.p[a.athlete.id] ||= [0, 0, 0, 0, 0]); r[0] += tg; r[2] += num(a.stats[ri]); r[3] += num(a.stats[ryi]); r[4] += num(a.stats[ryi]); });
    (ru?.athletes || []).forEach(a => { const car = num(a.stats[ci]); t.car += car; const r = (t.p[a.athlete.id] ||= [0, 0, 0, 0, 0]); r[1] += car; r[3] += num(a.stats[ruyi]); }); usage[side.team.id] = t; });
  c = { f: fantasyFromBox(s), a: awardLines(s), u: usage, s: boxLines(s) }; if (done && Object.keys(c.f).length) store.set(key, c); return c;
}


/* =====================================================================
   v14.2 · COACHES: head coach per team from ESPN's core feed (career records, experience, seasons)
   ===================================================================== */
async function coachOf(teamId) {
  const key = LK(`coach:${SEASON}:${teamId}`); const c = store.get(key, null); if (c && Date.now() - c.t < 86400000) return c.v;
  const https = u => String(u || '').replace(/^http:/, 'https:');
  const list = await getJSON(`${CORE}/seasons/${SEASON}/teams/${teamId}/coaches`, 86400000); const ref = list.items?.[0]?.$ref; if (!ref) return null;
  const season = await getJSON(https(ref), 86400000); const person = season.person?.$ref ? await getJSON(https(season.person.$ref), 86400000).catch(() => season) : season;
  const recs = await Promise.all((person.careerRecords || []).map(r => getJSON(https(r.$ref), 86400000).catch(() => null)));
  const rec = {}; recs.filter(Boolean).forEach(r => { const g = n => num(r.stats?.find(x => x.name === n)?.value); rec[/post/i.test(r.type || r.name) ? 'post' : /regular/i.test(r.type || r.name) ? 'reg' : 'total'] = { w: g('wins'), l: g('losses'), t: g('ties'), summary: r.summary || r.displayValue || '' }; });
  const years = (person.coachSeasons || []).map(x => Number((x.$ref || '').match(/seasons\/(\d{4})/)?.[1])).filter(Boolean).sort((a, b) => a - b);
  const v = { id: person.id || season.id, name: `${person.firstName || season.firstName || ''} ${person.lastName || season.lastName || ''}`.trim(), hs: person.headshot?.href || season.headshot?.href || '', exp: person.experience ?? season.experience ?? null, dob: person.dateOfBirth || season.dateOfBirth || null, college: null, rec, years, first: years[0] || null, nSeasons: years.length };
  store.set(key, { t: Date.now(), v }); return v;
}
const ageOf = dob => dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000)) : null;
const pctOf = r => r && r.w + r.l + r.t ? ((r.w + r.t / 2) / (r.w + r.l + r.t)) : null;
function coachPanelHTML(c, teamRec) {
  if (!c) return ''; const tot = c.rec.total || c.rec.reg; const pct = pctOf(tot);
  return `<div class="panel"><h3>Head coach</h3><a class="coach" href="#coaches" style="text-decoration:none"><img src="${esc(c.hs)}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(c.name)}</b><small>${c.exp != null ? c.exp + ' season' + (c.exp === 1 ? '' : 's') + ' as a head coach' : ''}${c.first ? ' · since ' + c.first : ''}${ageOf(c.dob) ? ' · age ' + ageOf(c.dob) : ''}</small></div></a>
    <div class="kpis"><div class="kpi"><small>This season</small><b>${esc(teamRec || '–')}</b></div><div class="kpi"><small>Career</small><b>${esc(tot?.summary || '–')}</b></div><div class="kpi"><small>Win %</small><b>${pct != null ? pct.toFixed(3).replace(/^0/, '') : '–'}</b></div><div class="kpi"><small>Postseason</small><b>${esc(c.rec.post?.summary || '0-0')}</b></div></div></div>`;
}
async function coaches(sub) {
  const scope = isCFB() ? (STAT_SCOPES().some(x => x[0] === sub) ? sub : store.get(LK('coachScope'), 'p4')) : ''; if (isCFB()) store.set(LK('coachScope'), scope);
  view.innerHTML = `<div class="bar"><div><h1>Coaches</h1><h2>Loading head coaches…</h2></div></div><div class="prog" id="cp"><i style="width:0"></i></div>`;
  const [idx, cr, rk] = await Promise.all([teamsIndex(), computedRecords().catch(() => ({})), isCFB() ? getJSON(`${API}/rankings`, 300000).catch(() => null) : null]);
  const ranked = new Set(((rk?.rankings || []).find(p => /ap/i.test(p.type)) || (rk?.rankings || [])[0])?.ranks?.map(r => r.team?.id) || []);
  const confKey = t => { const i = p4Index({ name: t.confName || t.conf, abbreviation: t.conf }); return i >= 0 ? CONF_KEYS[i] : ''; };
  const teams = Object.values(idx).filter(t => !isCFB() || scope === 'all' || (scope === 'top25' ? ranked.has(t.id) : scope === 'p4' ? !!confKey(t) : confKey(t) === scope));
  const rows = []; let done = 0;
  for (let i = 0; i < teams.length; i += 8) { await Promise.all(teams.slice(i, i + 8).map(async t => { try { const c = await coachOf(t.id); if (c) rows.push({ c, t }); } catch {} done++; const b = document.querySelector('#cp i'); if (b) b.style.width = done / teams.length * 100 + '%'; })); }
  const recOfTeam = t => { const r = cr[t.id]; if (r) return r; const x = recOf({ stats: t.stats || [] }); return { ...x, overall: `${x.w}-${x.l}${x.t ? '-' + x.t : ''}` }; };
  const data = rows.map(({ c, t }) => { const tot = c.rec.total || c.rec.reg || { w: 0, l: 0, t: 0, summary: '0-0' }; const tr = recOfTeam(t); return { c, t, w: tot.w, l: tot.l, ties: tot.t, g: tot.w + tot.l + tot.t, pct: pctOf(tot) ?? 0, post: c.rec.post, pw: c.rec.post?.w || 0, pl: c.rec.post?.l || 0, exp: c.exp ?? c.nSeasons, age: ageOf(c.dob), first: c.first, sw: tr.w, sl: tr.l, st: tr.t, spct: tr.w + tr.l + tr.t ? (tr.w + tr.t / 2) / (tr.w + tr.l + tr.t) : 0, sRec: tr.overall }; });
  view.innerHTML = `<div class="bar"><div><h1>Coaches</h1><h2>${data.length} head coaches · career records from ESPN · this season from results</h2></div></div>
    ${isCFB() ? `<div class="chips" style="margin-bottom:var(--s3)"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;align-self:center">Teams</span>${STAT_SCOPES().map(([k, l]) => `<a class="chip ${k === scope ? 'on' : ''}" href="#coaches/${k}">${l}</a>`).join('')}</div>` : ''}
    <div class="panel"><div class="lfilters"><input id="cq" placeholder="Coach or team" style="padding:5px 8px;font-size:13px;width:200px"><span class="muted" style="font-size:12px;margin-left:auto">click a column to sort</span></div>
      <div class="tw"><table id="ct" class="stats"><thead><tr><th>#</th><th class="sort" data-k="name">Coach</th><th class="sort" data-k="team">Team</th><th class="num sort" data-k="spct">This season</th><th class="num sort" data-k="exp">Yrs HC</th><th class="num sort" data-k="first">Since</th><th class="num sort" data-k="age">Age</th><th class="num sort" data-k="w">Career W</th><th class="num sort" data-k="l">Career L</th><th class="num sort" data-k="pct">Win %</th><th class="num sort" data-k="pw">Playoff W-L</th><th class="num sort" data-k="g">Games</th></tr></thead><tbody></tbody></table></div></div>
    <p class="note">Career records are ESPN's head-coaching totals${LEAGUE.key === 'nfl' ? ' in the NFL' : ' (FBS head-coaching jobs)'}; the postseason column is ${LEAGUE.key === 'nfl' ? 'playoff' : 'bowl and playoff'} games. "This season" uses the live record from completed games. Interim coaches appear once ESPN lists them.</p>`;
  const table = document.getElementById('ct'); let q = '';
  const draw = () => { const list = data.filter(r => !q || (r.c.name + ' ' + r.t.displayName).toLowerCase().includes(q));
    sortable(table, list, { name: r => r.c.name.split(' ').pop(), team: r => r.t.displayName, spct: r => r.spct + r.sw / 1000, exp: r => r.exp ?? -1, first: r => -(r.first || 9999), age: r => r.age ?? 0, w: r => r.w, l: r => r.l, pct: r => r.pct, pw: r => r.pw - r.pl / 100, g: r => r.g },
      (r, i) => `<tr class="clk ${isFav(r.t.id) ? 'fav' : ''}" data-t="${esc(r.t.id)}"><td class="num muted">${i + 1}</td><td class="tm"><img src="${esc(r.c.hs)}" alt="" style="border-radius:50%" onerror="this.style.visibility='hidden'"><div class="sp"><b>${esc(r.c.name)}</b><small>${r.first ? 'since ' + r.first : ''}</small></div></td><td class="tm"><img src="${esc(logo(r.t))}" alt="">${esc(r.t.abbreviation)}</td><td class="num">${esc(r.sRec)}</td><td class="num">${r.exp ?? '–'}</td><td class="num">${r.first || '–'}</td><td class="num">${r.age ?? '–'}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num"><b>${r.g ? r.pct.toFixed(3).replace(/^0/, '') : '–'}</b></td><td class="num">${r.post ? `${r.pw}-${r.pl}` : '0-0'}</td><td class="num muted">${r.g}</td></tr>`, 'pct'); };
  draw(); table.addEventListener('drawn', wire); wire();
  document.getElementById('cq').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
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
  await Promise.all(evs.map(async ev => { try { const f = (await gameLines(ev)).f;
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
        <label class="row" style="margin-top:6px"><input type="checkbox" id="stog" ${store.get('sound', false) ? 'checked' : ''}> Sound on scores, turnovers and red-zone entries (while this tab is open)</label>
        <label class="row" style="margin-top:6px"><input type="checkbox" id="htog" ${store.get('haptics', true) ? 'checked' : ''} ${navigator.vibrate ? '' : 'disabled'}> Vibrate on alerts (phones)</label>
        <label class="row" style="margin-top:6px"><input type="checkbox" id="atog" ${store.get('autoSwitch', false) ? 'checked' : ''}> Auto-switch to the hottest game on RedZone and Gamecast (10-second warning)</label><p class="muted" style="font-size:12px;margin:8px 0 0">${nperm === 'unsupported' ? 'Not supported in this browser.' : nperm === 'denied' ? 'Blocked in browser settings.' : nperm === 'granted' ? 'Permission granted.' : 'You will be asked for permission.'}</p>
        <p class="muted" style="font-size:12px;margin:8px 0 0">My teams: ${favs.length ? favs.map(f => esc((teamIndex || {})[f]?.abbreviation || f)).join(', ') : 'none yet. Open a team page and tap ☆.'}</p></div></div>
      <div class="panel"><h3>Live refresh</h3><div class="box"><p class="muted" style="margin:0 0 10px">How often live pages re-check ESPN. Game pages and the ticker use this rate; heavier pages (Home, Leaders, player logs) use double it. ESPN's own feeds update every 10–20 s, so faster than 10 s gains nothing. Polling pauses while the tab is hidden.</p>
        <select id="lint">${[[10,'Every 10 s (fastest useful)'],[15,'Every 15 s (default)'],[30,'Every 30 s'],[60,'Every 60 s (light)']].map(([v, l]) => `<option value="${v}" ${Number(store.get('liveInterval', 15)) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="panel"><h3>Install</h3><div class="box"><p class="muted" style="margin:0 0 10px">Add Gridiron Desk to your home screen for a full-screen app with the last scoreboard cached offline.</p>
        ${installable ? '<button class="chip on" id="inst">Install app</button>' : '<p class="muted" style="font-size:13px;margin:0">On iPhone: Share → <b>Add to Home Screen</b>. On Android/desktop Chrome: use the install icon in the address bar. (Requires the site to be served over https, e.g. GitHub Pages.)</p>'}</div></div>
      <div class="panel"><h3>Sync settings</h3><div class="box"><p class="muted" style="margin:0 0 10px">Move your teams, league, season, fantasy format and alert settings to another device. Export copies a small code; paste it on the other device and import.</p><div class="row"><button class="chip on" id="sexp">Copy settings code</button><button class="chip" id="sdl">Download file</button></div><textarea id="simp" placeholder="Paste a settings code here…" style="width:100%;margin-top:10px;min-height:60px;font-family:var(--mono);font-size:12px"></textarea><div class="row" style="margin-top:8px"><button class="chip" id="sim">Import</button></div></div></div>
      <div class="panel"><h3>Cache &amp; updates</h3><div class="box"><p class="muted" style="margin:0 0 10px">Running version <b class="num">${APP_VERSION}</b>. Rosters are cached for a day so Players and Leaders open instantly. If a new upload doesn't appear, force an update.</p><div class="row"><button class="chip" id="clr">Clear cached data</button><button class="chip on" id="upd">Force update</button></div></div></div>
    </div>`;
  document.getElementById('season').onchange = e => setSeason(Number(e.target.value));
  view.querySelectorAll('[data-league]').forEach(b => b.onclick = () => setLeague(b.dataset.league));
  document.getElementById('lint').onchange = e => { store.set('liveInterval', Number(e.target.value)); toast('Live refresh: every ' + e.target.value + ' s'); };
  document.getElementById('stog').onchange = e => { store.set('sound', e.target.checked); if (e.target.checked) beep('score'); };
  document.getElementById('htog').onchange = e => { store.set('haptics', e.target.checked); if (e.target.checked) buzz('score'); };
  document.getElementById('atog').onchange = e => { store.set('autoSwitch', e.target.checked); };
  document.getElementById('sexp').onclick = async () => { const txt = exportSettings(); try { await navigator.clipboard.writeText(txt); toast('Settings code copied'); } catch { document.getElementById('simp').value = txt; toast('Copy the code from the box'); } };
  document.getElementById('sdl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportSettings()], { type: 'application/json' })); a.download = 'gridiron-desk-settings.json'; a.click(); };
  document.getElementById('sim').onclick = () => { try { const n = importSettings(document.getElementById('simp').value.trim()); toast(`Imported ${n} settings · reloading`); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message); } };
  document.getElementById('ntog').onchange = async e => { if (e.target.checked) { const p = await Notification.requestPermission(); if (p !== 'granted') { e.target.checked = false; toast('Notifications blocked'); return; } } store.set('notify', e.target.checked); toast(e.target.checked ? 'Alerts on' : 'Alerts off'); settings(); };
  const inst = document.getElementById('inst'); if (inst) inst.onclick = async () => { window.deferredInstall.prompt(); await window.deferredInstall.userChoice; window.deferredInstall = null; settings(); };
  document.getElementById('upd').onclick = forceUpdate;
  document.getElementById('clr').onclick = () => { try { Object.keys(localStorage).filter(k => /^(rosters|nfl:|cfb:)/.test(k) && !/favTeams|sbFilter|pin|teamColors|oddsHist|pred:|rhist:/.test(k)).forEach(k => localStorage.removeItem(k)); } catch {} cache.clear(); rosterIndex = null; rosterLoading = null; leadersFull = null; leadersLoading = null; toast('Cache cleared'); };
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.deferredInstall = e; });
const APP_VERSION = '14.2';
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
  const seeds = isCFB() ? (rk ? `<div class="panel"><h3>${esc(rk.shortName || rk.name)} top 10<a class="lnk" style="font-size:12px;letter-spacing:0;text-transform:none" href="#playoffs">Full rankings →</a></h3>${rk.ranks.slice(0, 10).map(r => `<a class="leader" style="grid-template-columns:24px 26px 1fr auto;padding:6px 12px" href="#team/${esc(r.team?.id)}"><span class="rank num">${esc(r.current)}</span><img src="${esc(r.team?.logo || '')}" alt="" style="width:26px;height:26px;border-radius:0;object-fit:contain"><div class="nm">${esc(teamName(r.team))}</div><span class="num muted">${esc(r.recordSummary || '')}</span></a>`).join('')}</div>` : '') : (stnd?.children || []).map(c => { const top = [...(c.standings?.entries || c.children.flatMap(d => d.standings?.entries || []))].sort((x, y) => Number(x.stats.find(s => s.name === 'playoffSeed')?.value ?? 99) - Number(y.stats.find(s => s.name === 'playoffSeed')?.value ?? 99)).slice(0, 7); return `<div class="panel"><h3>${esc(c.abbreviation)} top 7</h3>${top.map((e, i) => `<a class="leader" style="grid-template-columns:24px 26px 1fr auto;padding:6px 12px" href="#team/${esc(e.team.id)}"><span class="rank num">${i + 1}</span><img src="${esc(logo(e.team))}" alt="" style="width:26px;height:26px;border-radius:0;object-fit:contain"><div class="nm">${esc(e.team.displayName)}</div><span class="num muted">${esc(e.stats.find(s => s.name === 'overall')?.displayValue || '')}</span></a>`).join('')}</div>`; }).join('');
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
