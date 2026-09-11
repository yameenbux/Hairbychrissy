/**
 * Cache-bust the stylesheet and scripts at publish time.
 *
 * THE PROBLEM THIS SOLVES, in the words of the person who hit it: "footer
 * still wrong", about ninety seconds after a deploy that had already fixed
 * the footer. It had. Their browser was holding the previous app.css.
 *
 * GitHub Pages serves assets with `max-age=600` and there is no way to change
 * that from here — the headers are the CDN's, not ours. So for up to ten
 * minutes after a deploy, anybody who had the old stylesheet keeps it, and the
 * page they see is new HTML wearing old CSS, which looks far more broken than
 * either version alone. Chrissy checking her own site straight after a change
 * is exactly the person who lands in that window.
 *
 * (Under Node this never happens: serveStatic sends `no-store` for anything
 * that is not an image or a font. This is a Pages-only fix, which is why it
 * runs in the workflow rather than being committed into the HTML.)
 *
 * WHY ONE TOKEN FOR EVERYTHING, rather than a hash per file. A per-file hash
 * is tempting and it is wrong here, because the JS is ES modules: app.js
 * imports ./coverflow.js directly, so stamping the <script> tag does nothing
 * for a change that lands only in coverflow.js — the import specifier inside
 * app.js is what the browser resolves, and it has not changed. Stamping every
 * reference with the same build token, specifiers included, needs no
 * dependency graph and cannot get the ordering wrong. It re-fetches assets
 * that did not change, which for one stylesheet and a handful of small
 * modules costs nothing worth counting.
 *
 * Run:  node tools/stamp-assets.js [token]
 * The token defaults to the short commit SHA, and to a timestamp outside git.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

function buildToken() {
  if (process.argv[2]) return process.argv[2];
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    // Not a checkout — a timestamp still changes every build, which is all
    // the token has to do.
    return Date.now().toString(36);
  }
}

const token = buildToken();
let edits = 0;

/*
 * Two shapes of reference, because they genuinely are two shapes.
 *
 *   - In the HTML, assets are reached through a folder: ./css/app.css,
 *     ./js/app.js.
 *   - Inside public/js, a module imports its SIBLINGS: './api-base.js'. No
 *     folder in the path, because it is already in the folder.
 *
 * The first version of this only matched the first shape, so it stamped
 * eleven references and quietly left every module import untouched — which is
 * precisely the gap the file above explains at length. Matching a bare
 * './name.js' everywhere would be worse than useless, though: in the HTML it
 * would rewrite nothing real, and there is no reason to guess. So the pattern
 * depends on which kind of file is being rewritten.
 */
const FOLDER_REF = /(["'])(\.\/(?:css|js)\/[A-Za-z0-9_\-./]+\.(?:css|js))(?:\?v=[^"']*)?\1/g;
const SIBLING_REF = /(["'])(\.\/[A-Za-z0-9_-]+\.js)(?:\?v=[^"']*)?\1/g;

/** Add or replace `?v=` on every relative asset reference in one file. */
function stamp(text, patterns) {
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (_m, quote, asset) => {
      edits += 1;
      return `${quote}${asset}?v=${token}${quote}`;
    });
  }
  return out;
}

const files = fs.readdirSync(PUBLIC)
  .filter((f) => f.endsWith('.html'))
  .map((f) => path.join(PUBLIC, f));

// The JS too, so a change inside an imported module actually reaches anyone.
const js = fs.existsSync(path.join(PUBLIC, 'js'))
  ? fs.readdirSync(path.join(PUBLIC, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(PUBLIC, 'js', f))
  : [];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = stamp(before, [FOLDER_REF]);
  if (after !== before) fs.writeFileSync(file, after);
}
for (const file of js) {
  const before = fs.readFileSync(file, 'utf8');
  const after = stamp(before, [SIBLING_REF]);
  if (after !== before) fs.writeFileSync(file, after);
}

console.log(`stamped ${edits} asset reference(s) with ?v=${token}`);

/*
 * A reference that did not get stamped is the whole failure this exists to
 * stop, so it fails the build rather than warning where nobody reads it.
 *
 * THE CHECK IS DELIBERATELY WIDER THAN THE STAMP. The first version of this
 * re-used the stamping patterns to do the checking, which made it incapable
 * of reporting anything: a shape the stamp cannot match is a shape the check
 * cannot see either, so it passed while every module import in public/js went
 * untouched. Whatever the stamp does not reach is exactly what has to be
 * caught, so the check looks for ANY quoted local .css or .js path and
 * demands a ?v= on it.
 *
 * Absolute and cross-origin URLs are skipped on purpose: somebody else's
 * asset, somebody else's caching.
 */
const LOCAL_ASSET = /["']((?!https?:|\/\/|data:)[A-Za-z0-9_\-./]*\.(?:css|js))(\?v=[^"']*)?["']/g;
const missed = [];
for (const file of [...files, ...js]) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(LOCAL_ASSET)) {
    if (!m[2]) missed.push(`${path.relative(ROOT, file)} -> ${m[1]}`);
  }
}
if (missed.length) {
  console.error('\nUNSTAMPED ASSET REFERENCES — these will be served stale:');
  for (const m of missed) console.error(`  ${m}`);
  process.exit(1);
}
