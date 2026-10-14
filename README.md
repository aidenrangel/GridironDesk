# Gridiron Desk

A single-page NFL stats site (scores, standings, playoff picture + simulated odds, power index,
league leaders, fantasy scoring, players, rosters, injuries, news) built on ESPN's public JSON feeds.
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
