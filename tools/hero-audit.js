/**
 * The hero has to fit in one window.
 *
 * The whole page has one job — get someone to book a slot — so the button that
 * does it cannot start below the fold. It was: on a landscape iPad the heading
 * is sized from viewport WIDTH, and a landscape tablet has width to spare and
 * very little height, so the type grew until it pushed the CTA off the bottom
 * of the screen.
 *
 * Checks, at every viewport a client plausibly holds:
 *   - the hero CTA is fully inside the first viewport
 *   - so are the heading and the lede
 *   - the hero itself does not overflow the window it is meant to fill
 *
 * Short landscape sizes are the point of this list. Portrait phones were never
 * the problem; they have height and no width.
 *
 * Run against a live server:  node tools/hero-audit.js
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Heights are the VIEWPORT, i.e. after browser chrome — which is what the
// client actually sees, and what dvh resolves to.
const SIZES = [
  ['iPhone SE portrait',      375,  553],
  ['iPhone 15 Pro portrait',  393,  740],
  ['iPhone 15 landscape',     852,  330],
  ['iPad mini landscape',    1133,  650],
  ['iPad 11 landscape',      1194,  715],
  ['iPad portrait',           820, 1010],
  ['laptop 1280',            1280,  660],
  ['laptop 1440',            1440,  760],
  ['desktop 1920',           1920,  940],
];

const PROBE = `(() => {
  const vh = window.innerHeight;
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const hero = document.querySelector('.hero').getBoundingClientRect();
  const h1 = document.querySelector('.hero .display');
  // EVERY control in the hero, not just the primary button. The first version
  // measured only .btn and passed while the secondary link had wrapped below
  // it and off the bottom of the screen — the same blind spot, one element
  // over, as measuring the heading and forgetting the button.
  const controls = [...document.querySelectorAll('.hero a, .hero button')]
    .filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((el) => ({
      label: (el.textContent || '').trim().slice(0, 22),
      bottom: Math.round(el.getBoundingClientRect().bottom),
    }));
  return {
    vh,
    heroH: Math.round(hero.height),
    heroBottom: Math.round(hero.bottom),
    cta: pick('.hero-actions .btn'),
    controls,
    lede: pick('.hero .lede'),
    head: pick('.hero .display'),
    h1px: Math.round(parseFloat(getComputedStyle(h1).fontSize)),
  };
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  let failures = 0;

  for (const [name, w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const r = await page.evaluate(PROBE);

    const problems = [];
    // 2px of tolerance for sub-pixel rounding, and no more.
    for (const c of r.controls) {
      if (c.bottom > r.vh + 2) problems.push(`"${c.label}" ${c.bottom - r.vh}px below the fold`);
    }
    if (r.head && r.head.bottom > r.vh + 2) problems.push(`heading ${r.head.bottom - r.vh}px below the fold`);
    if (r.lede && r.lede.bottom > r.vh + 2) problems.push(`lede ${r.lede.bottom - r.vh}px below the fold`);
    if (r.heroH > r.vh + 2) problems.push(`hero is ${r.heroH - r.vh}px taller than the window`);

    if (problems.length) failures += 1;
    console.log(
      `  ${problems.length ? 'FAIL' : 'PASS'}  ${name.padEnd(23)} ${String(w).padStart(4)}x${String(h).padStart(4)}` +
      `  hero ${String(r.heroH).padStart(4)}  h1 ${String(r.h1px).padStart(3)}px` +
      `  CTA ends ${String(r.cta ? r.cta.bottom : 0).padStart(4)}/${r.vh}` +
      (problems.length ? `   ${problems.join('; ')}` : ''),
    );
    await ctx.close();
  }

  console.log(`\n########## HERO FIT FAILURES: ${failures} ##########`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
