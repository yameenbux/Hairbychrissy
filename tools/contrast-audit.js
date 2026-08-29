/**
 * Contrast audit.
 *
 * Walks every rendered text node on every page and state, resolves the real
 * painted background behind it, and checks the WCAG AA threshold for that
 * text's own size and weight. Run it after any change to the palette.
 *
 *   node server.js &
 *   node tools/contrast-audit.js
 *
 * Needs playwright-core and a Chromium binary; set CHROMIUM_PATH if yours is
 * somewhere other than the default below.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const AUDIT = `(() => {
  function lum(rgb) {
    const c = rgb.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  }
  function parse(s) {
    const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { rgb: p.slice(0,3), a: p.length > 3 ? p[3] : 1 };
  }
  // Walk up until an opaque background is found — what the eye actually sees.
  function bgOf(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.85) return c.rgb;
      n = n.parentElement;
    }
    return [255,255,255];
  }
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    if (!el.offsetParent && el.tagName !== 'BODY') return;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    const fg = parse(cs.color); if (!fg) return;
    const bg = bgOf(el);
    const l1 = lum(fg.rgb), l2 = lum(bg);
    const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight,10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      out.push({
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
        text: txt.slice(0,42), ratio: +ratio.toFixed(2), need,
        size: Math.round(size), color: cs.color, bg: 'rgb(' + bg.join(',') + ')'
      });
    }
  });
  return out;
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, permissions: ['notifications'] });
  const p = await ctx.newPage();
  let total = 0;

  async function audit(label) {
    const fails = await p.evaluate(AUDIT);
    console.log(`\n### ${label} — ${fails.length} contrast failure(s)`);
    fails.forEach(f => console.log(`   ${f.ratio}:1 (need ${f.need}) ${f.size}px  ${f.sel}  "${f.text}"  ${f.color} on ${f.bg}`));
    total += fails.length;
  }

  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await audit('client site — landing');

  await p.locator('#bookServiceGrid .card[data-id="la-weave"]').click();
  await p.waitForTimeout(1800);
  await p.locator('.cal-cell[data-date]:not([disabled])').first().click();
  await p.waitForTimeout(900);
  await audit('client site — calendar + slots');

  await p.locator('.slot').first().click();
  await p.waitForTimeout(500);
  await p.fill('#fName','Test Client'); await p.fill('#fPhone','07700900123'); await p.fill('#fEmail','t@e.com');
  await p.locator('#detailsForm button[type=submit]').click();
  await p.waitForTimeout(600);
  await audit('client site — payment step');

  await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await p.fill('#pw','chrissy'); await p.locator('#loginForm button[type=submit]').click();
  await p.waitForTimeout(1500);
  await audit('dashboard — today');

  for (const v of ['bookings','hours','time-off','services','alerts','settings']) {
    await p.locator(`#adminNav a[data-view="${v}"]`).click();
    await p.waitForTimeout(600);
    await audit('dashboard — ' + v);
  }

  console.log(`\n=== TOTAL CONTRAST FAILURES: ${total} ===`);
  await b.close();
  process.exit(total === 0 ? 0 : 1);
})();
