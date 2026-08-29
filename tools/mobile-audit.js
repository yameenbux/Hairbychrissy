/**
 * Mobile audit.
 *
 * Most of Chrissy's clients book on a phone, so the phone is the primary
 * target, not an adaptation. This checks the things that actually break a
 * booking on a real handset:
 *
 *   - tap targets under 44x44 (Apple's HIG minimum)
 *   - form inputs under 16px, which make iOS Safari zoom the page on focus
 *     and leave the client stranded mid-form
 *   - anything overflowing the viewport horizontally
 *   - content trapped under the sticky header or a notch
 *
 * Run against a live server:  node tools/mobile-audit.js
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Two throwaway 1x1 PNGs so the details step can be measured with thumbnails
// showing — the state a client attaching inspiration photos actually sees.
const PIXEL = path.join(os.tmpdir(), 'hbc-audit-1.png');
const PIXEL2 = path.join(os.tmpdir(), 'hbc-audit-2.png');
for (const f of [PIXEL, PIXEL2]) {
  fs.writeFileSync(f, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ));
}
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Real handsets, smallest first. The SE is the one that finds the bugs.
const DEVICES = [
  { name: 'iPhone SE',        width: 375, height: 667, dpr: 2 },
  { name: 'iPhone 13 mini',   width: 375, height: 812, dpr: 3 },
  { name: 'iPhone 15 Pro',    width: 393, height: 852, dpr: 3 },
  { name: 'iPhone 15 Pro Max',width: 430, height: 932, dpr: 3 },
  { name: 'Pixel 7',          width: 412, height: 915, dpr: 2.6 },
  { name: 'Galaxy S8 (narrow)', width: 360, height: 740, dpr: 3 },
];

const PROBE = `(() => {
  const problems = [];
  const vw = document.documentElement.clientWidth;

  // 1. Tap targets.
  const interactive = 'a[href], button, input, select, textarea, summary, [role="tab"], label.pay-option, label.toggle, label.check';
  document.querySelectorAll(interactive).forEach(el => {
    if (!el.offsetParent && el.tagName !== 'BODY') return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    // A visually-hidden control inside a big label is fine — the label is the target.
    if (cs.position === 'absolute' && cs.opacity === '0') return;
    if (r.width < 44 || r.height < 44) {
      problems.push({
        kind: 'tap-target',
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
        text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0,32),
        detail: Math.round(r.width) + 'x' + Math.round(r.height)
      });
    }
  });

  // 2. Inputs that trigger the iOS zoom-on-focus trap.
  document.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.offsetParent) return;
    const cs = getComputedStyle(el);
    if (cs.opacity === '0') return;
    const size = parseFloat(cs.fontSize);
    if (size < 16) {
      problems.push({ kind: 'ios-zoom', sel: (el.id ? '#'+el.id : el.tagName.toLowerCase()) + '[' + (el.type||'text') + ']', text: '', detail: size + 'px' });
    }
  });

  // 3. Horizontal overflow.
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push({ kind: 'page-overflow', sel: 'html', text: '', detail: document.documentElement.scrollWidth + ' > ' + vw });
  }
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') return;
      problems.push({
        kind: 'element-overflow',
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
        text: (el.textContent||'').trim().slice(0,28),
        detail: 'left ' + Math.round(r.left) + ' right ' + Math.round(r.right) + ' of ' + vw
      });
    }
  });

  // Collapse duplicates so one bad rule doesn't produce fifty lines.
  const seen = new Map();
  for (const p of problems) {
    const key = p.kind + '|' + p.sel + '|' + p.detail;
    if (!seen.has(key)) seen.set(key, { ...p, count: 0 });
    seen.get(key).count++;
  }
  return [...seen.values()];
})()`;

async function scan(page, label, results) {
  const found = await page.evaluate(PROBE);
  if (found.length) results.push({ label, found });
  return found.length;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  let grand = 0;

  for (const d of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const results = [];

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    await scan(page, 'landing', results);

    // Walk the booking flow — the screens that actually matter — entering it
    // the way a client does, through the CTA rather than by direct URL.
    await page.locator('.cta-repeat a.btn-cta').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await scan(page, 'booking page', results);

    await page.selectOption('#serviceSelect', 'hollywood-waves');
    await page.waitForTimeout(400);
    await page.locator('#serviceNext').click();
    await page.waitForTimeout(1700);
    await scan(page, 'calendar', results);

    const day = page.locator('.cal-cell[data-date]:not([disabled])').first();
    if (await day.count()) {
      await day.click();
      await page.waitForTimeout(900);
      await scan(page, 'slots', results);
      const slot = page.locator('.slot').first();
      if (await slot.count()) {
        await slot.click();
        await page.waitForTimeout(500);
        await scan(page, 'details form', results);
        await page.fill('#fName','Test Client');
        await page.fill('#fPhone','07700900123');
        await page.fill('#fEmail','t@e.com');
        await page.fill('#fNotes','Long honey waves, like the third photo on your grid.');
        // With thumbnails on screen: the remove button is a real tap target
        // and has to be measured as one.
        await page.setInputFiles('#fPhotos', [PIXEL, PIXEL2]).catch(() => {});
        await page.waitForTimeout(500);
        await scan(page, 'details form with photos', results);
        await page.locator('#detailsForm button[type=submit]').click();
        await page.waitForTimeout(500);
        await scan(page, 'payment', results);
      }
    }

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await scan(page, 'admin login', results);
    await page.fill('#pw','chrissy');
    await page.locator('#loginForm button[type=submit]').click();
    await page.waitForTimeout(1500);
    await scan(page, 'admin today', results);
    for (const v of ['hours','services','alerts']) {
      const link = page.locator(`#adminNav a[data-view="${v}"]`);
      if (!(await link.isVisible())) {
        // The dashboard nav collapses on small screens; open it if there is a
        // control to do so. If there isn't, that is itself the finding.
        const toggle = page.locator('#adminNavToggle');
        if (await toggle.count() && await toggle.isVisible()) {
          await toggle.click();
          await page.waitForTimeout(300);
        }
      }
      if (!(await link.isVisible())) {
        results.push({ label: 'admin nav', found: [{
          kind: 'unreachable', sel: `#adminNav a[data-view="${v}"]`,
          text: v, detail: 'no way to reach this section on this screen', count: 1,
        }]});
        continue;
      }
      await link.click();
      await page.waitForTimeout(600);
      await scan(page, 'admin ' + v, results);
    }

    /*
     * The screens with no nav link of their own. Skipping these is how a
     * whole view gets shipped unmeasured — the header audit passed for a
     * week while the nav ran through the wordmark, for exactly this reason.
     */
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    // Wait for the dashboard to actually be up rather than guessing a delay.
    // A blind timeout that is fractionally too short turns every step after
    // it into a thirty-second locator timeout, six times over — which is what
    // took this audit from two minutes to twenty.
    await page.waitForSelector('#dayList', { state: 'visible', timeout: 15000 }).catch(() => {});

    // The run sheet, on a day that has something in it.
    const upcoming = await page.evaluate(() => {
      const row = document.querySelector('#upcomingList .appt[data-date], #dayList .appt[data-date]');
      return row ? row.dataset.date : null;
    });
    if (upcoming) {
      await page.fill('#dayPick', upcoming, { timeout: 5000 });
      await page.dispatchEvent('#dayPick', 'change');
      await page.waitForTimeout(400);
      await scan(page, 'admin run sheet', results);

      // The move and note panels open inside a row, so they are only ever
      // measured if something opens them.
      for (const action of ['move', 'note']) {
        const btn = page.locator(`#dayList .appt [data-action="${action}"]`).first();
        if (await btn.count() && await btn.isVisible()) {
          await btn.click({ timeout: 5000 });
          await page.waitForTimeout(300);
          await scan(page, `admin ${action} panel`, results);
          const close = page.locator("#dayList .appt .appt-panel [data-do='close']").first();
          if (await close.count()) { await close.click({ timeout: 5000 }); await page.waitForTimeout(200); }
        }
      }
    }

    // The add-a-booking form.
    const addBtn = page.locator('#newBookingBtn');
    if (await addBtn.count() && await addBtn.isVisible()) {
      await addBtn.click({ timeout: 5000 });
      await page.waitForSelector('#newBookingForm', { state: 'visible', timeout: 5000 }).catch(() => {});
      await scan(page, 'admin add booking', results);
    }

    const count = results.reduce((n,r) => n + r.found.length, 0);
    grand += count;
    console.log(`\n=== ${d.name} (${d.width}x${d.height}) — ${count} issue(s) ===`);
    for (const r of results) {
      console.log(`  [${r.label}]`);
      for (const f of r.found) {
        console.log(`     ${f.kind.padEnd(17)} ${f.detail.padEnd(22)} ${f.sel} ${f.text ? '"'+f.text+'"' : ''}${f.count>1?'  x'+f.count:''}`);
      }
    }
    await ctx.close();
  }

  console.log(`\n########## TOTAL MOBILE ISSUES: ${grand} ##########`);
  await browser.close();
  process.exit(grand === 0 ? 0 : 1);
})();
