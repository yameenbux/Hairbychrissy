/**
 * The ban list, enforced.
 *
 * A list of banned things in a brief is a one-time cleanup; a list of banned
 * things in CI is a rule. These are the five, plus the two scales the rest of
 * the design now depends on — because the way a type scale dies is one
 * font-size: 13px typed into one rule six months from now.
 *
 * Run:  node tools/banlist-audit.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lines = (p) => read(p).split('\n');

const CSS = ['public/css/app.css', 'public/css/admin.css'];
const HTML = fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`);
const JS = ['public/js/app.js', 'public/js/admin.js'];

const failures = [];
const fail = (rule, file, line, detail) => failures.push({ rule, file, line, detail });

/* 1 — purple gradients. Any purple at all, in fact: her palette has none, so
      a purple channel appearing is a sign something was pasted in. */
for (const f of [...CSS, ...HTML]) {
  lines(f).forEach((l, i) => {
    if (/\b(purple|violet|indigo|rebeccapurple|fuchsia|magenta)\b/i.test(l) && !l.trim().startsWith('*') && !l.includes('//')) {
      fail('purple', f, i + 1, l.trim().slice(0, 70));
    }
  });
}

/* 2 — emoji as icons. Symbols and pictographs in markup or rendered strings.
      Text arrows and typographic marks in prose are not icons and are fine;
      anything in the pictograph blocks is. */
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2630}]/u;
for (const f of [...HTML, ...JS]) {
  lines(f).forEach((l, i) => {
    const m = l.match(PICTO);
    // An arrow inside a sentence is punctuation. An arrow inside a tag is an icon.
    if (m && /<[a-z][^>]*>\s*[^<]*$/i.test(l.slice(0, l.indexOf(m[0])))) {
      fail('emoji-as-icon', f, i + 1, `${JSON.stringify(m[0])} in ${l.trim().slice(0, 60)}`);
    }
  });
}

/* 3 — Inter as the display font. The display roles must resolve to the serif. */
const app = read('public/css/app.css');
for (const role of ['.display, .display-sm', '.numeral']) {
  const at = app.indexOf(role + ' {');
  if (at === -1) { fail('display-face', 'public/css/app.css', 0, `${role} rule is gone`); continue; }
  const body = app.slice(at, app.indexOf('}', at));
  if (!/font-family:\s*var\(--display-face\)/.test(body)) {
    fail('display-face', 'public/css/app.css', app.slice(0, at).split('\n').length, `${role} does not use --display-face`);
  }
}
if (!/--display-face:\s*var\(--wordmark\)/.test(app)) {
  fail('display-face', 'public/css/app.css', 0, '--display-face no longer resolves to the serif');
}

/* 4 — generic placeholders faking a photograph. */
if (/\.media-placeholder\s*\{[^}]*radial-gradient/s.test(app)) {
  fail('fake-placeholder', 'public/css/app.css', 0, '.media-placeholder is imitating a photograph again');
}

/* 5 — centred-everything. A few centred atoms are fine; a centred band is not. */
for (const f of CSS) {
  lines(f).forEach((l, i) => {
    if (/text-align:\s*center/.test(l) && /^\s*\.(band|shell|section-head|hero|split)\b/.test(l)) {
      fail('centred-layout', f, i + 1, l.trim().slice(0, 70));
    }
  });
}
for (const f of HTML) {
  lines(f).forEach((l, i) => {
    if (/text-align:\s*center/.test(l)) fail('centred-layout', f, i + 1, l.trim().slice(0, 70));
  });
}

/* 6 — the type scale. Nothing off it. */
for (const f of [...CSS, ...HTML]) {
  lines(f).forEach((l, i) => {
    if (/^\s*(\/\*|\*)/.test(l)) return;
    // Extract the value and inspect it, rather than trying to express "not
    // var()" as a lookahead — \s* backtracks to zero width and the lookahead
    // then passes on the space, which quietly matched every line.
    for (const [prop, rule] of [['font-size', 'off-scale-type'], ['letter-spacing', 'off-scale-tracking']]) {
      const m = l.match(new RegExp(prop + ':([^;"\'}]+)'));
      if (!m) continue;
      const value = m[1].trim();
      if (/inherit|smaller|larger|^100%$|^0$|^normal$/.test(value)) continue;
      // On-scale means every length in the value comes from a token. A clamp
      // of two tokens is on the scale; a clamp with a raw rem in it is not.
      const raw = value.replace(/var\(--[a-z0-9-]+\)/g, '');
      if (/[\d.]+(px|rem|em|%)/.test(raw)) fail(rule, f, i + 1, `${prop}: ${value}`);
    }
  });
}

/* 7 — motion inside the brief's band, and nothing springy. */
for (const f of CSS) {
  lines(f).forEach((l, i) => {
    if (/^\s*(\/\*|\*)/.test(l)) return;
    for (const d of l.match(/transition:[^;]*/g) || []) {
      for (const ms of d.match(/(\d+)ms/g) || []) {
        const n = Number(ms.replace('ms', ''));
        if (n !== 0 && (n < 200 || n > 300)) fail('motion-out-of-band', f, i + 1, `${ms} in ${d.trim().slice(0, 50)}`);
      }
    }
    if (/cubic-bezier\([^)]*-[\d.]/.test(l)) fail('bounce', f, i + 1, l.trim().slice(0, 70));
    if (/animation:[^;]*infinite/.test(l)) fail('looping-animation', f, i + 1, l.trim().slice(0, 70));
  });
}

/*
 * 8 — one CTA. Every client-facing page must offer it, with the same words.
 * book.html is deliberately not in the list: it IS the destination, so a page
 * pointing at itself proves nothing. Rules 1-7 still cover it, via HTML above.
 */
const CTA = 'Book your slot';
for (const f of ['public/index.html', 'public/confirmed.html', 'public/404.html']) {
  if (!read(f).includes(CTA)) fail('missing-cta', f, 0, `no "${CTA}" on this page`);
}

/*
 * 9 — no dead anchors. The header and footer are copied between pages on
 * purpose, so they cannot drift apart — but a same-page anchor copied onto a
 * page that has no such section is a nav link that silently does nothing.
 * That is exactly what happened to book.html: it inherited the home page's
 * #services / #work / #process / #faq and none of those sections are on it.
 * A cross-page link is written "./#services" and is not checked here.
 */
for (const f of HTML) {
  const html = read(f);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const seen = new Set();
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    const target = m[1];
    if (seen.has(target)) continue;
    seen.add(target);
    if (!ids.has(target)) fail('dead-anchor', f, 0, `href="#${target}" — no element with that id on this page`);
  }
}

/* ------------------------------------------------------------- report */
const byRule = {};
for (const f of failures) (byRule[f.rule] ||= []).push(f);

const RULES = [
  'purple', 'emoji-as-icon', 'display-face', 'fake-placeholder', 'centred-layout',
  'off-scale-type', 'off-scale-tracking', 'motion-out-of-band', 'bounce',
  'looping-animation', 'missing-cta', 'dead-anchor',
];
for (const rule of RULES) {
  const hits = byRule[rule] || [];
  console.log(`${hits.length ? 'FAIL' : 'PASS'}  ${rule.padEnd(20)} ${hits.length || ''}`);
  for (const h of hits) console.log(`        ${h.file}:${h.line}  ${h.detail}`);
}
console.log(`\n########## BAN LIST FAILURES: ${failures.length} ##########`);
process.exit(failures.length === 0 ? 0 : 1);
