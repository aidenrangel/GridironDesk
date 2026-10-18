# Gridiron Desk

NFL and college football (FBS), switchable from the header.

A single-page NFL stats site built on ESPN's public JSON feeds: home page, scores with live gamecast,
standings, playoff picture + simulated odds, power index, team stats, league leaders, fantasy scoring,
player pages and comparison, rosters, injuries, news, seasons back to 2010.
No build step, no backend.

## Files
- `index.html` – app shell
- `styles.css` – all styling (dark/light themes)
- `app.js` – all logic and pages
- `manifest.json`, `sw.js`, `icon-*.png` – installable-app support (home screen, offline shell)

## Deploy to GitHub Pages (about one minute)
1. On github.com create a new public repo, e.g. `gridiron-desk`.
2. Click **uploading an existing file** (or drag and drop) and upload all files in this folder.
3. Commit. Then open **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. After ~1 minute the site is live at `https://<your-username>.github.io/gridiron-desk/`.

Everything (install to home screen, offline shell, notifications) works once it's served over https.
Opening `index.html` directly from disk also works in Safari/Chrome; only the install/offline features need https.

## Live games
- **Gamecast** (`#game/ID`): scorebug with a ticking clock, field view, scoring strip (click a score to jump to the play), play-by-play with clickable player names, win probability, game flow, live tiles, drive chart, box score.
- **Split screen** (`#multi/ID,ID,...`): up to four games side by side; add `/theater` to hide the chrome. Reachable from any Gamecast or from RedZone.
- **Player cards**: click any name in the play feed, top performers or box score for the player's live line and fantasy points.

## Season tools (v11)
- **Team dashboard** tab: record splits, scoring by quarter, point differential, PF/PA by week. **Moves** tab shows the team's transactions.
- **All-time series**: every meeting since 2000 (button on Gamecast, team pages and Compare; built from ESPN's season schedules, cached for six hours).
- **Player trends & usage**: pick any stat (or fantasy points) for a by-week chart with a 3-game average and season high; RB/WR/TE profiles get target and carry share per game.
- **Draft classes**: Players page filter; Leaders has a Rookies chip.
- **Schedule strength** (`#sos`), **Division race** (`#race`, NFL), **Awards** (`#awards`), **Records watch** (`#records`), **Transactions** (`#transactions`, NFL), **CFP odds** (`#odds` in college mode).

## v12
- **Model accuracy** (`#accuracy`): every win probability is logged before kickoff and graded after the final — straight-up %, Brier score, calibration, biggest upsets, ESPN comparison when available.
- **Offense/defense ratings**, weekly rating movement and rating history (Power index, team pages, Compare); **projected finish** distribution on team pages; **matchup previews** on pregame pages and model picks on the scoreboard.
- **Weekly recap** (`#recap`), **Bowl projections** (`#bowls`, college), pinned mini-scorebug (📌 on any Gamecast), auto-switch to the hottest game (Settings / RedZone), haptics, key-moment markers on the win-probability chart, "if scores hold" seed changes on the live scoreboard, share cards (PNG), keyboard shortcuts (←/→ week, 1–9 open a game, R RedZone), stale scoreboard fallback, settings export/import.

## Player stats (v13)
- **Stats** replaces Leaders. NFL: full season tables (passing, rushing, receiving, defense, kicking, punting, returns) summed from every game's box score — every player, sortable columns, position/team/rookie filters, qualified toggle, per-game toggle, live games included. College: ESPN's top-50 leaderboards merged into one table per group with a conference filter.

## Notes
- Favorite teams, theme, season, fantasy format and the roster cache live in your browser's localStorage.
- Playoff odds, the power index and fantasy points are computed in the page; they are not ESPN's numbers. The power index is an opponent-adjusted (SRS-style) rating in points: average margin (home field removed, capped at 28) plus average opponent rating, solved iteratively; FCS opponents count as −30 in college mode.

## Keyboard shortcuts
`/` search · `←` `→` previous/next week · `t` theme · `?` help · `g` then `h` home, `s` scores, `t` standings,
`p` playoffs, `o` odds, `l` leaders, `r` players, `m` teams, `f` fantasy, `n` news, `i` injuries, `c` compare.
