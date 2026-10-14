# Gridiron Desk

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

## Notes
- Favorite teams, theme, season, fantasy format and the roster cache live in your browser's localStorage.
- Playoff odds, the power index and fantasy points are computed in the page; they are not ESPN's numbers.

## Keyboard shortcuts
`/` search · `←` `→` previous/next week · `t` theme · `?` help · `g` then `h` home, `s` scores, `t` standings,
`p` playoffs, `o` odds, `l` leaders, `r` players, `m` teams, `f` fantasy, `n` news, `i` injuries, `c` compare.
