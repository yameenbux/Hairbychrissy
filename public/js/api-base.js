/**
 * Where the booking API lives, resolved once and shared.
 *
 * This exists because the dashboard and the client site each worked it out
 * their own way, and only one of them was right. app.js consulted the injected
 * meta tag and a host table; admin.js assumed the API sat on the same origin as
 * itself. On Pages it does not — the pages are served from
 * hairbychrissy.ysbdesigns.uk and the API answers from Render — so every
 * dashboard request went to the static host, which has no API, and a correct
 * password came back as a 404 dressed up as a failed sign-in.
 *
 * One module, imported by both, so the two cannot disagree again.
 */

/*
 * The meta tag is normally injected by .github/workflows/pages.yml. It is not
 * there if GitHub's own Jekyll builder published the site instead, which
 * happens whenever the Pages source is set to a branch rather than to GitHub
 * Actions.
 *
 * Keyed by host so a laptop is never caught by it: localhost has no entry, so
 * `npm start` still talks to its own server rather than to production.
 */
const KNOWN_HOSTS = {
  'hairbychrissy.ysbdesigns.uk': 'https://hairbychrissy-api.onrender.com',
  'yameenbux.github.io': 'https://hairbychrissy-api.onrender.com',
};

export function resolveApiBase() {
  if (window.HBC_API) return String(window.HBC_API).replace(/\/$/, '');
  const meta = document.querySelector('meta[name="hbc-api"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');
  const known = KNOWN_HOSTS[location.hostname];
  if (known) return known;
  // Same origin. Derived from this module's own URL rather than assumed to be
  // "/", so it is correct whether the app sits at a domain root or a subpath.
  // This file lives in js/, the same folder as its two callers, so '../' is
  // the site root for either of them.
  return new URL('../', import.meta.url).href.replace(/\/$/, '');
}
