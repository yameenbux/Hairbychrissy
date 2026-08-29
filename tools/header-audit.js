/**
 * Header centring.
 *
 * The wordmark sits in the middle column of a three-column grid, which is only
 * the page centre while the outer two columns are equal. Hiding one of them —
 * as the mobile layout did — silently pushes it off centre. Measured, not
 * assumed, at every breakpoint the site actually has.
 *
 *   node server.js &
 *   node tools/header-audit.js
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WIDTHS = [320, 360, 375, 414, 640, 768, 860, 1024, 1280, 1440, 1920];
const TOLERANCE = 2; // px

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  let failures = 0;

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    const r = await page.evaluate(() => {
      const brand = document.querySelector('.site-header .brand');
      const mark = document.querySelector('.site-header .brand-mark');
      const b = brand.getBoundingClientRect();

      // Centred is not the same as uncollided: the wordmark can sit dead centre
      // and still have nav links running straight through it.
      const overlaps = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
      const collisions = [...document.querySelectorAll('.site-header a, .site-header button')]
        .filter((el) => el !== brand && !brand.contains(el))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const r2 = el.getBoundingClientRect();
          return r2.width > 0 && r2.height > 0 && overlaps(b, r2);
        })
        .map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 18));

      return {
        centre: b.left + b.width / 2,
        viewport: document.documentElement.clientWidth,
        markVisible: mark ? mark.getBoundingClientRect().width > 0 : false,
        markW: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
        collisions,
      };
    });

    const target = r.viewport / 2;
    const off = r.centre - target;
    const centred = Math.abs(off) <= TOLERANCE;
    const clear = r.collisions.length === 0;
    const ok = centred && clear && r.markVisible;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${String(width).padStart(4)}px  centre off by ${off.toFixed(1)}px  logo ${r.markVisible ? `${r.markW}px` : 'MISSING'}${clear ? '' : `  OVERLAPS: ${r.collisions.join(', ')}`}`,
    );
    await ctx.close();
  }

  console.log(`\n########## HEADER FAILURES: ${failures} ##########`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
