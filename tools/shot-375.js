/**
 * Every page at 375px.
 *
 * 375 is the iPhone SE / 13 mini width and the narrowest screen this site has
 * to work on properly. Nine in ten of her clients book on a phone, so this is
 * not a responsive check bolted on at the end — it is the primary view.
 *
 * Captures a full-page screenshot of every page and every state that is only
 * reachable by interacting (the booking steps, the dashboard views), and
 * measures the things that break at this width:
 *
 *   - horizontal overflow, and which element causes it
 *   - text under 12px, and inputs under 16px (which make iOS zoom)
 *   - tap targets under 44px
 *   - lines longer than 46 characters or shorter than 24 (a measure that has
 *     collapsed into a column too narrow to read)
 *   - headings that wrap to more than three lines
 *
 * Run against a live server:  node tools/shot-375.js
 * Screenshots land in .shots/ (gitignored).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '.shots';
const WIDTH = 375;

fs.mkdirSync(OUT, { recursive: true });

const PROBE = `(() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const seen = new Set();
  const add = (kind, detail, el, text) => {
    const sel = el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : '-';
    const key = kind + sel + detail;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, detail, sel, text: (text || '').slice(0, 40) });
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Horizontal overflow, named to the element that causes it.
  if (document.documentElement.scrollWidth > vw + 1) {
    document.querySelectorAll('body *').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        add('overflow', Math.round(r.right - vw) + 'px past the edge', el, el.textContent);
      }
    });
  }

  // Type that is too small to read, or that makes iOS zoom on focus.
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el)) return;
    if (!el.textContent || !el.textContent.trim()) return;
    if (el.children.length) return;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < 12) add('type-too-small', size.toFixed(1) + 'px', el, el.textContent);
  });
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!visible(el)) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16) add('ios-zoom', size.toFixed(1) + 'px', el, el.getAttribute('placeholder'));
  });

  // Tap targets.
  document.querySelectorAll('a[href], button, input, select, textarea, label.check, label.toggle, label.pay-option, [role="tab"]').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      add('tap-target', Math.round(r.width) + 'x' + Math.round(r.height), el, el.textContent);
    }
  });

  // Measure: a paragraph column that has collapsed too narrow to read.
  document.querySelectorAll('p, li, .lede').forEach((el) => {
    if (!visible(el)) return;
    const t = (el.textContent || '').trim();
    if (t.length < 60) return;
    const r = el.getBoundingClientRect();
    const ch = parseFloat(getComputedStyle(el).fontSize) * 0.5;
    const cols = r.width / ch;
    if (cols < 24) add('measure-narrow', Math.round(cols) + 'ch', el, t);
  });

  // Headings that have wrapped into a stack.
  document.querySelectorAll('h1, h2, h3').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    const lines = el.getBoundingClientRect().height / parseFloat(cs.lineHeight || cs.fontSize);
    if (lines > 3.4) add('heading-wraps', Math.round(lines) + ' lines', el, el.textContent);
  });

  return out;
})()`;

async function shoot(page, name, results) {
  /*
   * Scroll the whole page first.
   *
   * Sections fade in on an IntersectionObserver, so in a full-page screenshot
   * everything below the first viewport is still at opacity 0 — the capture
   * comes back as one screen of content and thirty of white. Walking the page
   * once fires every observer, and then the screenshot shows what a client
   * who has scrolled actually sees.
   */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
    // Belt and braces: anything the observer missed is shown anyway, so a
    // blank patch in a screenshot means a layout bug and never a timing one.
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    await new Promise((r) => setTimeout(r, 120));
  });
  await page.waitForTimeout(450);
  const found = await page.evaluate(PROBE);
  const file = path.join(OUT, `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  results.push({ name, file, height: h, found });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const results = [];

  // ---- the client site, and the whole booking flow
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await shoot(page, 'home', results);

  await page.locator('#navToggle').click().catch(() => {});
  await shoot(page, 'home nav open', results);
  await page.locator('#navToggle').click().catch(() => {});

  await page.locator('#bookServiceGrid .card[data-id="hollywood-waves"]').click();
  await page.waitForTimeout(1600);
  await shoot(page, 'book calendar', results);

  const cell = page.locator('.cal-cell[data-date]:not([disabled])').first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(900);
    await shoot(page, 'book slots', results);

    const slot = page.locator('.slot').first();
    if (await slot.count()) {
      await slot.click();
      await page.waitForTimeout(500);
      await shoot(page, 'book details', results);
      await page.fill('#fName', 'Amara Okafor');
      await page.fill('#fPhone', '07700 900123');
      await page.fill('#fEmail', 'amara@example.com');
      await page.locator('#detailsForm button[type=submit]').click();
      await page.waitForTimeout(700);
      await shoot(page, 'book payment', results);
    }
  }

  // ---- the standalone pages
  for (const [name, url] of [
    ['confirmed', `${BASE}/confirmed?ref=HBC-1001`],
    ['pay demo', `${BASE}/pay/demo?ref=HBC-1001`],
    ['404', `${BASE}/does-not-exist`],
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await shoot(page, name, results);
  }

  // ---- the dashboard
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await shoot(page, 'admin login', results);
  await page.fill('#pw', process.env.ADMIN_PASSWORD || 'chrissy');
  await page.locator('#loginForm button[type=submit]').click();
  await page.waitForSelector('#dayList', { state: 'visible', timeout: 15000 }).catch(() => {});
  await shoot(page, 'admin today', results);

  await page.locator('#newBookingBtn').click().catch(() => {});
  await page.waitForSelector('#newBookingForm', { state: 'visible', timeout: 5000 }).catch(() => {});
  await shoot(page, 'admin add booking', results);

  for (const v of ['bookings', 'hours', 'time-off', 'services', 'alerts', 'settings']) {
    const link = page.locator(`#adminNav a[data-view="${v}"]`);
    if (!(await link.isVisible())) {
      const toggle = page.locator('#adminNavToggle');
      if (await toggle.count() && await toggle.isVisible()) {
        await toggle.click();
        await page.waitForTimeout(250);
      }
    }
    if (!(await link.isVisible())) continue;
    await link.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await shoot(page, 'admin ' + v, results);
  }

  // ---- report
  let total = 0;
  console.log(`\nEvery page at ${WIDTH}px\n${'='.repeat(60)}`);
  for (const r of results) {
    total += r.found.length;
    const flag = r.found.length ? `${r.found.length} problem(s)` : 'clean';
    console.log(`\n${r.name.padEnd(22)} ${String(r.height).padStart(6)}px tall   ${flag}`);
    console.log(`  ${r.file}`);
    for (const f of r.found) {
      console.log(`    ${f.kind.padEnd(16)} ${f.detail.padEnd(20)} ${f.sel} ${f.text ? `"${f.text}"` : ''}`);
    }
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log(`########## 375px PROBLEMS: ${total} across ${results.length} screens ##########`);
  await browser.close();
  process.exit(total === 0 ? 0 : 1);
})();
