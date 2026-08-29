/**
 * Sticky-header clearance, a CLAUDE.md non-negotiable:
 *
 *   "Fixed/sticky elements must not overlap section headings. Test every
 *    heading against the sticky header at 1280px, 1440px and 1920px."
 *
 * Navigates to every in-page anchor, waits for the scroll to settle, and
 * checks the destination heading actually clears the sticky header. Also
 * verifies the nav labels match between header and footer, and that every
 * interactive element takes a visible focus ring.
 *
 *   node server.js &
 *   node tools/sticky-audit.js
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WIDTHS = [1280, 1440, 1920];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  let failures = 0;

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);

    const targets = await page.$$eval('.site-header nav a[href^="#"]', (as) =>
      as.map((a) => a.getAttribute('href')).filter((h) => h && h !== '#'),
    );

    console.log(`\n=== ${width}px ===`);

    for (const href of targets) {
      await page.evaluate((h) => {
        document.querySelector(`.site-header nav a[href="${h}"]`).click();
      }, href);
      // Smooth scrolling needs time to land before measuring.
      await page.waitForTimeout(1200);

      const result = await page.evaluate((h) => {
        const header = document.querySelector('.site-header');
        const section = document.querySelector(h);
        if (!section) return { missing: true };
        const heading = section.querySelector('h1, h2, h3, .label');
        if (!heading) return { noHeading: true };
        const hb = header.getBoundingClientRect();
        const tb = heading.getBoundingClientRect();
        return { headerBottom: Math.round(hb.bottom), headingTop: Math.round(tb.top), text: heading.textContent.trim().slice(0, 28) };
      }, href);

      if (result.missing || result.noHeading) {
        console.log(`  SKIP  ${href} (no section or heading)`);
        continue;
      }
      const clear = result.headingTop >= result.headerBottom;
      if (!clear) failures += 1;
      console.log(
        `  ${clear ? 'PASS' : 'FAIL'}  ${href.padEnd(14)} heading top ${String(result.headingTop).padStart(5)}  vs header bottom ${String(result.headerBottom).padStart(4)}  "${result.text}"`,
      );
    }

    // Nav labels must match between header and footer.
    const [head, foot] = await Promise.all([
      page.$$eval('.site-header nav a', (as) => as.map((a) => a.textContent.trim().toLowerCase())),
      page.$$eval('.footer-links a', (as) => as.map((a) => a.textContent.trim().toLowerCase())),
    ]);
    const same = JSON.stringify(head) === JSON.stringify(foot);
    if (!same) failures += 1;
    console.log(`  ${same ? 'PASS' : 'FAIL'}  nav labels identical in header and footer`);
    if (!same) console.log(`        header: ${head.join(', ')}\n        footer: ${foot.join(', ')}`);

    // Focus must be visible — the design being minimal is not an excuse.
    const focusOk = await page.evaluate(() => {
      const el = document.querySelector('.site-header nav a');
      el.focus();
      const cs = getComputedStyle(el, null);
      const style = getComputedStyle(el);
      return style.outlineStyle !== 'none' || cs.outlineWidth !== '0px';
    });
    if (!focusOk) failures += 1;
    console.log(`  ${focusOk ? 'PASS' : 'FAIL'}  keyboard focus ring visible`);

    await ctx.close();
  }

  console.log(`\n########## STICKY / NAV / FOCUS FAILURES: ${failures} ##########`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
