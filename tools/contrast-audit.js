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
      if (c && c.a >= 0.85) return { rgb: c.rgb, host: n };
      n = n.parentElement;
    }
    return { rgb: [255,255,255], host: document.body };
  }

  /*
   * Is this text sitting on a PHOTOGRAPH rather than on a colour?
   *
   * bgOf resolves the nearest opaque background, which for white text over a
   * service card is the cream band behind the photo — so it computed 1.11:1
   * and called seven perfectly legible captions failures. They were quoted as
   * an immovable baseline in this repository for weeks precisely because
   * everyone could see they were wrong, which is how a check stops being read.
   *
   * A ratio against a colour the reader never sees is not a measurement. These
   * are reported separately as unmeasurable, with the honest reason: a still
   * frame of a photograph is what tools/scrim-audit.js samples for the hero,
   * and that is the technique this needs too if it is ever to give a number.
   */
  /*
   * Every element on the page that PAINTS A PICTURE — an img, a video, or
   * anything carrying a background-image url(). Gradients are deliberately not
   * in here: a gradient over a known colour is still arithmetic, a photograph
   * is not.
   *
   * Collected once. The first version of this looked only for <img> tags and
   * still called seven service captions failures, because what is behind them
   * is a <span class="svc-photo"> with a background-image — a sibling, not an
   * ancestor, and not an image element. Looking for the tag rather than for
   * the paint is the mistake.
   */
  const painters = [...document.querySelectorAll('*')].filter((n) => {
    if (/^(IMG|VIDEO|PICTURE)$/.test(n.tagName)) return true;
    return /url\\(/.test(getComputedStyle(n).backgroundImage);
  });

  function overImagery(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (const m of painters) {
      if (m === el || m.contains(el)) {
        // An ancestor painting a photo behind its own text counts too.
        if (m !== el) return true;
        continue;
      }
      const b = m.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) return true;
    }
    return false;
  }

  function effectiveAlpha(el) {
    let a = 1, n = el;
    while (n && n !== document.documentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(o)) a *= o;
      n = n.parentElement;
    }
    return a;
  }
  /** What the pixel ends up being: fg laid over bg at this alpha. */
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

  const describe = (el) => el.tagName.toLowerCase() +
    (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.')
      : '');

  const out = [];
  const unknown = [];
  document.querySelectorAll('*').forEach(el => {
    if (!el.offsetParent && el.tagName !== 'BODY') return;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return;
    /*
     * Disabled controls are exempt, and that is the specification's own words:
     * WCAG 1.4.3 requires no contrast ratio of "text ... that is part of an
     * inactive user interface component". A greyed-out past date on the
     * calendar or a booking step you have not reached yet is dimmed BECAUSE it
     * cannot be used, and the dimming is the message.
     *
     * Without this the audit reports every disabled date in the month — twenty
     * or so numerals that are behaving exactly as intended — and a check that
     * fires on correct behaviour gets muted, which costs more than it saves.
     */
    if (el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')) return;
    const fg = parse(cs.color); if (!fg) return;
    const bg = bgOf(el);
    // Fully transparent is invisible, not low contrast — nothing to report.
    const alpha = fg.a * effectiveAlpha(el);
    if (alpha <= 0.02) return;
    if (overImagery(el)) { unknown.push({ sel: describe(el), text: txt.slice(0,42) }); return; }
    const painted = over(fg.rgb, bg.rgb, alpha);
    const l1 = lum(painted), l2 = lum(bg.rgb);
    const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight,10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      out.push({
        sel: describe(el),
        text: txt.slice(0,42), ratio: +ratio.toFixed(2), need,
        size: Math.round(size),
        color: cs.color,
        // The two differ whenever opacity is in play, and the difference is
        // the whole point of the check — print both.
        painted: 'rgb(' + painted.map(Math.round).join(',') + ')',
        bg: 'rgb(' + bg.rgb.join(',') + ')'
      });
    }
  });
  return { fails: out, unknown };
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, permissions: ['notifications'] });
  const p = await ctx.newPage();
  let total = 0;
  let unknownTotal = 0;

  /*
   * Scroll the whole page so every .reveal has fired, then come back.
   *
   * This is NOT a nicety. Reveals start at opacity 0 and only animate in when
   * they intersect the viewport, so anything below the fold is invisible at
   * the moment of measurement. The audit used to look at those elements'
   * declared colours anyway and report white-on-cream failures for seven
   * service cards that were not on screen — 35 of the 37 "known baseline"
   * failures on the landing page were that, and they were quoted as a stable
   * baseline in this repository for weeks.
   *
   * Compositing ancestor opacity fixed the false alarm but replaced it with a
   * blind spot: skip anything at alpha 0 and below-the-fold content is never
   * checked at all. Both are wrong. Revealing first and then measuring is the
   * only version that looks at what a reader actually sees.
   */
  async function revealAll() {
    await p.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
    });
    await p.waitForTimeout(700);
  }

  async function audit(label) {
    const { fails, unknown } = await p.evaluate(AUDIT);
    console.log(`\n### ${label} — ${fails.length} contrast failure(s)` +
      (unknown.length ? `, ${unknown.length} over imagery (needs an eye, or a scrim-audit-style frame sample)` : ''));
    fails.forEach(f => console.log(
      `   ${f.ratio}:1 (need ${f.need}) ${f.size}px  ${f.sel}  "${f.text}"  ${f.color}` +
      `${f.painted !== f.color.replace(/\s/g, '') ? ` → painted ${f.painted}` : ''} on ${f.bg}`));
    if (process.env.SHOW_UNKNOWN && unknown.length) {
      unknown.forEach(u => console.log(`   [over imagery] ${u.sel}  "${u.text}"`));
    }
    total += fails.length;
    unknownTotal += unknown.length;
  }

  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await revealAll();
  await audit('client site — landing');

  // Any VISIBLE CTA, not one particular block. `.cta-repeat a.btn-cta`
  // named a element that no longer renders on the landing page, and this
  // died on a 30s timeout rather than reporting. The header CTA is hidden
  // on phones too, so pinning it to one instance was wrong at some widths
  // even while it worked.
  await p.locator('a.btn-cta:visible').first().click();
  await p.waitForLoadState('domcontentloaded');
  await p.waitForTimeout(1500);
  await audit('client site — booking page');

  await p.selectOption('#serviceSelect', 'hollywood-waves');
  await p.waitForTimeout(400);
  await audit('client site — service chosen');
  await p.locator('#serviceNext').click();
  await p.waitForTimeout(1800);
  await p.locator('.cal-cell[data-date]:not([disabled])').first().click();
  await p.waitForTimeout(900);
  await audit('client site — calendar + slots');

  await p.locator('.slot').first().click();
  await p.waitForTimeout(500);
  await p.fill('#fName','Test Client'); await p.fill('#fPhone','07700900123'); await p.fill('#fEmail','t@e.com');
  await p.fill('#fNotes','Long honey waves.');
  await audit('client site — details, notes and photos');
  await p.locator('#detailsForm button[type=submit]').click();
  await p.waitForTimeout(600);
  await audit('client site — payment step');

  /*
   * The two standalone pages, which this audit did not visit at all until now.
   * aftercare.html carries the longest and most consequential prose on the
   * site — it is what a client reads to avoid damaging their own hair — and it
   * was the one page never checked.
   *
   * Scrolled to the bottom first: the aftercare rail dims points it has not
   * reached, so measuring it at the top would measure the finished state of
   * two of eight and the held-back state of the rest either way. Both ends get
   * walked.
   */
  for (const [path, label] of [['/aftercare.html', 'aftercare'], ['/shop.html', 'shop']]) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await audit(`client site — ${label}, at the top`);
    await revealAll();
    await audit(`client site — ${label}, scrolled`);
  }

  await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await p.fill('#pw','chrissy'); await p.locator('#loginForm button[type=submit]').click();
  await p.waitForTimeout(1500);
  await audit('dashboard — today');

  for (const v of ['bookings','hours','time-off','services','alerts','settings']) {
    await p.locator(`#adminNav a[data-view="${v}"]`).click();
    await p.waitForTimeout(600);
    await audit('dashboard — ' + v);
  }

  /*
   * The screens reached by a button rather than a nav link. Every one of them
   * introduces a colour pairing the others do not have — the dashed gap rows,
   * the break row on cream, the amber override box — so leaving them out
   * would mean the audit passing on colours it had never looked at.
   */
  await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);

  const day = await p.evaluate(() => {
    const row = document.querySelector('#upcomingList .appt[data-date], #dayList .appt[data-date]');
    return row ? row.dataset.date : null;
  });
  if (day) {
    await p.fill('#dayPick', day);
    await p.dispatchEvent('#dayPick', 'change');
    await p.waitForTimeout(500);
    await audit('dashboard — run sheet');

    for (const action of ['move', 'note']) {
      const btn = p.locator(`#dayList .appt [data-action="${action}"]`).first();
      if (await btn.count() && await btn.isVisible()) {
        await btn.click();
        await p.waitForTimeout(300);
        await audit(`dashboard — ${action} panel`);
        const close = p.locator("#dayList .appt .appt-panel [data-do='close']").first();
        if (await close.count()) { await close.click(); await p.waitForTimeout(200); }
      }
    }
  }

  // The add form, and then the same form showing the overrides she is about
  // to make — amber on cream is the pairing most likely to fall short.
  await p.locator('#newBookingBtn').click();
  await p.waitForTimeout(500);
  await audit('dashboard — add booking');

  await p.selectOption('#nbService', 'hair-ups');
  await p.fill('#nbDate', day || '2026-09-03');
  /*
   * 07:00 is before her earliest opening time on any day (09:00, Saturday),
   * so this raises the "outside your hours" override whatever date lands in
   * `day`. It used to be 13:10, which only worked because of an invented lunch
   * break; removing that break silently disarmed this check, and the audit
   * said so rather than reporting a pass it had not earned.
   */
  await p.fill('#nbStart', '07:00');
  await p.fill('#nbName', 'Contrast Probe');
  await p.fill('#nbPhone', '07700900000');
  await p.locator('#nbSubmit').click();
  await p.waitForTimeout(800);
  if (await p.locator('#nbWarnings').isVisible()) {
    await audit('dashboard — override warning');
  } else {
    console.log('\n!! could not raise an override warning — that path went unmeasured');
  }

  console.log(`\n=== TOTAL CONTRAST FAILURES: ${total} ===`);
  if (unknownTotal) console.log(`=== ${unknownTotal} run(s) of text over imagery, not measurable from a colour ===`);
  await b.close();
  process.exit(total === 0 ? 0 : 1);
})();
