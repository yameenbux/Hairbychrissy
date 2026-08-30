/**
 * Client site.
 *
 * The same file is served two ways, so it has to cope with both:
 *
 *   under Node   — the booking API is at ./api/*, the calendar is live
 *   on Pages     — flat files only. Content comes from ./data/site.json and the
 *                  booking section degrades to an enquiry route rather than
 *                  pretending to hold a slot it cannot.
 *
 * Point the static build at a hosted booking API by adding
 *   <meta name="hbc-api" content="https://your-api.example.com">
 * to index.html, or setting window.HBC_API before this script runs.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  site: null,
  live: false,        // is a booking API actually reachable?
  apiBase: null,
  step: 1,
  service: null,
  month: null,
  date: null,
  slot: null,
  details: null,
  payment: 'cash',
  monthCache: null,
  submitting: false,
};

/* --------------------------------------------------------------- helpers */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Clean rounded values only — never raw FX output. */
const money = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return 'Free';
  return `£${Math.round(v).toLocaleString('en-GB')}`;
};

/** Her extensions are quoted, not listed, so a price is not always a number. */
const priceLabel = (s) => (s?.priceOnRequest ? 'On request' : money(s?.price));

function duration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function prettyDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${DOW_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * Where the API lives when the page was published without a build step.
 *
 * The tag below is normally injected by .github/workflows/pages.yml. It is not
 * there if GitHub's own Jekyll builder published the site instead, which
 * happens whenever the Pages source is set to a branch rather than to GitHub
 * Actions — and that has silently been the case, which is why the calendar sat
 * in enquiry mode with every check green.
 *
 * Keyed by host so a laptop is never caught by it: localhost has no entry, so
 * `npm start` still talks to its own server rather than to production.
 */
const KNOWN_HOSTS = {
  'hairbychrissy.ysbdesigns.uk': 'https://hairbychrissy-api.onrender.com',
  'yameenbux.github.io': 'https://hairbychrissy-api.onrender.com',
};

function resolveApiBase() {
  if (window.HBC_API) return String(window.HBC_API).replace(/\/$/, '');
  const meta = document.querySelector('meta[name="hbc-api"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');
  const known = KNOWN_HOSTS[location.hostname];
  if (known) return known;
  // Same origin. Derived from this script's own URL rather than assumed to be
  // "/", so it is correct whether the app sits at a domain root or a subpath.
  return new URL('../', import.meta.url).href.replace(/\/$/, '');
}

async function api(path, options) {
  const res = await fetch(`${state.apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    // A static host answers an unknown path with its 404 page, not JSON.
    throw new Error('No booking service is reachable.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* -------------------------------------------------------------- content */

/**
 * Fills in the shared content. Runs on both pages, and the booking page has
 * no hero, reviews or FAQ — so every write here is guarded. A missing element
 * on one page must not throw and take the whole script, and the booking
 * calendar with it, down with it.
 */
const put = (sel, prop, value) => { const el = $(sel); if (el) el[prop] = value; };

function renderStatic() {
  const { brand, services, reviews, faqs } = state.site;

  put('#heroLocation', 'textContent', brand.location.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
  put('#heroIntro', 'textContent', brand.intro);
  put('#navInstagram', 'href', brand.instagram);
  if (brand.strapline) put('#strapline', 'textContent', brand.strapline);

  // Her three headline services, in her own words, above the price list.
  const offerList = $('#offerList');
  if (offerList && state.site.offers) {
    offerList.innerHTML = state.site.offers
      .map(
        (o, i) => `
        <article class="step reveal">
          <span class="numeral">${i + 1}/</span>
          <h3>${esc(o.title)}</h3>
          <p class="small muted" style="letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">${esc(o.kicker)}</p>
          <p>${esc(o.text)}</p>
        </article>`,
      )
      .join('');
  }

  // Why extensions — her own four benefits, as text rather than her graphic so
  // it stays searchable, translatable and readable at any width.
  const benefitList = $('#benefitList');
  if (benefitList && state.site.benefits) {
    benefitList.innerHTML = state.site.benefits
      .map(
        (b) => `
        <article class="benefit reveal">
          <h3>${esc(b.title)}</h3>
          <p>${esc(b.text)}</p>
        </article>`,
      )
      .join('');
  }

  renderCare();

  if (brand.signoff) put('#signoff', 'textContent', brand.signoff);

  renderTransformations();
  renderReels();
  renderPortfolio();

  renderServiceCards('#serviceGrid', false);

  /*
   * No reviews means no reviews section — not a heading with nothing under it.
   * The same rule the portfolio follows: a page with a section missing reads
   * as finished, a page with an empty section reads as broken. They come back
   * the moment real ones are added to lib/seed.js.
   */
  const reviewGrid = $('#reviewGrid');
  if (reviewGrid) {
    if (!reviews.length) {
      reviewGrid.closest('section')?.remove();
    } else {
      reviewGrid.innerHTML = reviews
        .map(
          (r) => `
      <blockquote class="review reveal">
        <span class="mark" aria-hidden="true">”</span>
        <p>${esc(r.text)}</p>
        <footer>${esc(r.name)} — ${esc(r.service)}</footer>
      </blockquote>`,
        )
        .join('');
    }
  }

  put('#faqList', 'innerHTML', faqs
    .map((f) => `<details><summary>${esc(f.q)}</summary><div class="answer"><p>${esc(f.a)}</p></div></details>`)
    .join(''));

  put('#footStudio', 'innerHTML', [
    ...brand.addressLines.map((l) => `<li>${esc(l)}</li>`),
    brand.email ? `<li><a href="mailto:${esc(brand.email)}">${esc(brand.email)}</a></li>` : '',
    `<li><a href="${esc(brand.instagram)}" target="_blank" rel="noopener">${esc(brand.handle)}</a></li>`,
    brand.website ? `<li><a href="${esc(brand.website)}" target="_blank" rel="noopener">${esc(brand.websiteLabel || brand.website)}</a></li>` : '',
  ].join(''));

  put('#legalCopy', 'textContent', `© ${new Date().getFullYear()} ${brand.name}. London.`);
  put('#legalNotice', 'textContent', brand.notice);

  if (brand.credit?.name) {
    const c = brand.credit;
    put('#legalCredit', 'innerHTML', c.url
      ? `Site by <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`
      : `Site by ${esc(c.name)}`);
  }

  loadImagery();
  observeReveals();
}

/* ------------------------------------------------------------- her work */

const havePhoto = (file) => (state.site.photos || []).includes(file);

function renderTransformations() {
  const wrap = $('#baSet');
  if (!wrap) return;
  const sets = (state.site.transformations || []).filter((t) => havePhoto(t.before) && havePhoto(t.after));
  wrap.innerHTML = sets
    .map(
      (t) => `
      <figure class="ba reveal">
        <div class="ba-pair">
          <div class="ba-side">
            <div class="card-media" style="background-image:url('./images/${esc(t.before)}')"></div>
            <span class="ba-tag">Before</span>
          </div>
          <div class="ba-side">
            <div class="card-media" style="background-image:url('./images/${esc(t.after)}')"></div>
            <span class="ba-tag">After</span>
          </div>
        </div>
        ${t.caption ? `<figcaption>${esc(t.caption)}</figcaption>` : ''}
      </figure>`,
    )
    .join('');
  observeReveals();
}

/**
 * Her reels. Nothing is fetched until the section is actually scrolled to, and
 * not at all under reduced motion or Save Data — autoplaying video a client
 * never reaches is pure waste of their allowance. The poster stands in either
 * way.
 */
function renderReels() {
  const grid = $('#reelGrid');
  if (!grid) return;
  const list = (state.site.reels || []).filter((r) => havePhoto(r.poster));
  if (!list.length) { grid.remove(); return; }

  grid.innerHTML = list
    .map(
      (r) => `
      <figure class="reel reveal">
        <video poster="./images/${esc(r.poster)}" muted loop playsinline preload="none"
               disablepictureinpicture data-webm="./video/${esc(r.webm)}" data-mp4="./video/${esc(r.mp4)}"></video>
        ${r.caption ? `<figcaption>${esc(r.caption)}</figcaption>` : ''}
      </figure>`,
    )
    .join('');
  observeReveals();

  if (!motionOK() || navigator.connection?.saveData) return;
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const v = entry.target;
        if (!entry.isIntersecting) { v.pause(); return; }
        if (v.dataset.started !== 'true') {
          v.dataset.started = 'true';
          if (v.dataset.webm) v.insertAdjacentHTML('beforeend', `<source src="${v.dataset.webm}" type="video/webm">`);
          if (v.dataset.mp4) v.insertAdjacentHTML('beforeend', `<source src="${v.dataset.mp4}" type="video/mp4">`);
          v.preload = 'auto';
          v.load();
        }
        v.play().catch(() => {});
      });
    },
    { threshold: 0.35 },
  );
  $$('#reelGrid video').forEach((v) => io.observe(v));
}

/*
 * Her maintenance essentials.
 *
 * The marks are drawn rather than typed. Her poster used icons in hairline
 * circles, and the site has no icon set — but a glyph or an emoji would render
 * at a different weight and baseline on every platform, which is why the ban
 * list rules them out. These are five paths in the same hairline stroke as the
 * rest of the page, in a circle the same width as the rule above each row.
 *
 * currentColor throughout, so they inherit rather than hard-code a value and
 * cannot drift out of the palette.
 */
const CARE_MARKS = {
  calendar: '<rect x="7" y="8" width="14" height="12" rx="1"/><path d="M7 12h14M11 6v4M17 6v4"/>',
  head: '<path d="M16.9 19.7v-1.8a4.5 4.5 0 0 0-1-6.5 4.5 4.5 0 0 0-7.2 2.8l-1 1.7 1.4.5v1.6a1.6 1.6 0 0 0 1.6 1.7z"/>',
  sparkle: '<path d="M14 6.5l1.6 4.4 4.4 1.6-4.4 1.6L14 18.5l-1.6-4.4L8 12.5l4.4-1.6z"/><path d="M19.5 17.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  clock: '<circle cx="14" cy="14" r="7"/><path d="M14 10v4.3l2.8 1.7"/>',
  heart: '<path d="M14 20.5S7.5 16.6 7.5 12.3A3.6 3.6 0 0 1 14 10.2a3.6 3.6 0 0 1 6.5 2.1c0 4.3-6.5 8.2-6.5 8.2z"/>',
};

const careMark = (name) => `
  <svg class="care-mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"
       fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="14" cy="14" r="13.5" stroke-width="1"/>
    ${CARE_MARKS[name] || ''}
  </svg>`;

function renderCare() {
  const box = $('#careList');
  const care = state.site.maintenance;
  if (!box || !care?.points?.length) return;

  box.innerHTML = `
    <p class="care-intro">${esc(care.intro)}</p>
    <ul class="care-list">
      ${care.points
        .map(
          (c) => `
        <li class="care-item">
          ${careMark(c.mark)}
          <div>
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.text)}</p>
          </div>
        </li>`,
        )
        .join('')}
    </ul>`;
}

function renderPortfolio() {
  const grid = $('#folioGrid');
  if (!grid) return;
  const items = (state.site.gallery || []).filter((g) => havePhoto(g.file));
  if (!items.length) { grid.closest('section')?.remove(); return; }
  grid.innerHTML = items
    .map(
      (g) => `
      <figure class="reveal" style="margin:0">
        <div class="card-media" style="background-image:url('./images/${esc(g.file)}')"></div>
        <figcaption class="card-body"><span class="card-name">${esc(g.label)}</span></figcaption>
        <p class="small muted" style="margin-top:6px">${esc(g.caption)}</p>
      </figure>`,
    )
    .join('');
  if (state.site.brand?.instagram) $('#folioIg').href = state.site.brand.instagram;
  observeReveals();
}

/**
 * Swap in real photography where a file actually exists.
 * Driven by the manifest the server and the static build both publish, rather
 * than by probing for each file and absorbing a 404 for every one that is not
 * there yet.
 */
function loadImagery() {
  const have = new Set(state.site.photos || []);

  $$('[data-img]').forEach((el) => {
    const file = el.dataset.img.split('/').pop();
    if (!have.has(file)) return;
    el.style.backgroundImage = `url("${el.dataset.img}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.classList.remove('media-placeholder');
  });

  // Only the home page carries a hero. Every other page — book.html, and
  // anything added later — shares this script, so a missing hero is a normal
  // state, not a fault. Dereferencing it unconditionally threw here once and
  // took the whole of init() down with it, leaving the booking page's service
  // dropdown empty and the flow hidden.
  const heroEl = $('#heroMedia');
  if (!heroEl) return;

  const video = $('#heroVideo');

  if (video) {
    // The poster alone is a complete hero, so the placeholder can go as soon
    // as we know the poster exists.
    if (have.has('hero-poster.jpg')) heroEl.classList.remove('media-placeholder');
    startHeroVideo(video);
  } else if (have.has('hero.jpg')) {
    heroEl.classList.remove('media-placeholder');
    heroEl.innerHTML = '<img src="./images/hero.jpg" alt="" width="2000" height="1200" fetchpriority="high">';
  }
}

/**
 * Load and play the hero video only when it is wanted.
 *
 * Skipped entirely — not merely paused — when the viewer has asked for reduced
 * motion or has Save Data on. Pausing still costs the download; on a phone
 * that is someone's data for a decoration they did not want. The poster is a
 * complete hero on its own.
 */
function startHeroVideo(video) {
  // loadImagery() runs once per rendered grid, so this can be called several
  // times. Without a guard the element collects duplicate <source> tags and a
  // fresh observer on each pass.
  if (video.dataset.started === 'true') return;
  video.dataset.started = 'true';

  if (!motionOK()) return;
  if (navigator.connection?.saveData) return;

  const webm = video.dataset.webm;
  const mp4 = video.dataset.mp4;
  if (webm) video.insertAdjacentHTML('beforeend', `<source src="${webm}" type="video/webm">`);
  if (mp4) video.insertAdjacentHTML('beforeend', `<source src="${mp4}" type="video/mp4">`);

  video.preload = 'auto';
  video.load();
  // A rejected autoplay is normal on some devices; the poster stays, which is
  // exactly the intended fallback.
  video.play().catch(() => {});

  // Stop decoding while the hero is off screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause())),
      { threshold: 0.1 },
    ).observe(video);
  }
}

function renderServiceCards(target, selectable) {
  const grid = $(target);
  if (!grid) return;
  grid.innerHTML = state.site.services
    .map(
      (s) => `
      <button type="button" class="card reveal" data-id="${esc(s.id)}"
              ${selectable ? `aria-pressed="${state.service?.id === s.id}"` : ''}>
        <span class="card-media media-placeholder" data-img="./images/service-${esc(s.id)}.jpg">
          <span class="card-select">${selectable ? 'Select' : 'Book'}</span>
        </span>
        <span class="card-body">
          <span class="card-name">${esc(s.name)}</span>
          <span class="card-price">${priceLabel(s)}</span>
        </span>
      </button>`,
    )
    .join('');

  $$(`${target} .card`).forEach((card) => {
    card.addEventListener('click', () => {
      if (state.live) {
        selectService(card.dataset.id);
      } else {
        enquire(card.dataset.id);
      }
    });
  });
  loadImagery();
  observeReveals();
}

/* --------------------------------------------------------------- motion */

let observer;
function observeReveals() {
  if (!('IntersectionObserver' in window)) {
    $$('.reveal').forEach((el) => el.classList.add('in'));
    return;
  }
  observer = observer || new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        // 80ms stagger between siblings entering together.
        setTimeout(() => entry.target.classList.add('in'), i * 80);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  );
  $$('.reveal:not(.in)').forEach((el) => observer.observe(el));
}

/* ------------------------------------------------------ static fallback */

/**
 * With no booking service reachable the page must not imply it can hold a
 * slot. It shows the price list and routes the client to Chrissy directly.
 */
function enterStaticMode(reason) {
  state.live = false;
  $('#bookingLive').hidden = true;
  $('#bookingStatic').hidden = false;
  $('#liveDot').dataset.state = 'static';
  $('#liveDot').textContent = 'Enquiry only';
  $('#bookIntro').textContent = 'Choose a service below and message Chrissy to arrange a date.';

  const ig = state.site?.brand?.instagram || 'https://www.instagram.com/hairbychrissy_x';
  $('#bookingStatic').innerHTML = `
    <p><strong>Live booking is not connected to this page yet.</strong>
    ${esc(reason || '')} Pick a service and send a message — dates are confirmed by reply.</p>
    <p style="margin-top:14px"><a class="btn" href="${esc(ig)}" target="_blank" rel="noopener">Message on Instagram</a></p>`;
}

function enquire(serviceId) {
  const s = state.site.services.find((x) => x.id === serviceId);
  const ig = state.site.brand.instagram;
  const note = s ? `Enquiring about ${s.name} (${money(s.price)}).` : 'Enquiring about an appointment.';
  try { navigator.clipboard?.writeText(note); } catch { /* clipboard is a nicety */ }
  window.open(ig, '_blank', 'noopener');
}

/* --------------------------------------------------------------- steps */

function goto(step) {
  state.step = step;
  document.body.dataset.step = String(step);
  $$('.step-tab').forEach((t) => t.setAttribute('aria-selected', String(Number(t.dataset.step) === step)));
  $$('.step-panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
  unlockTabs();
  $('.steps')?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
}

function unlockTabs() {
  const reach = { 1: true, 2: !!state.service, 3: !!state.slot, 4: !!state.details };
  $$('.step-tab').forEach((t) => { t.disabled = !reach[t.dataset.step]; });
}

function selectService(id, options = {}) {
  const service = state.site.services.find((s) => s.id === id);
  if (!service) return;
  const changed = state.service?.id !== id;
  state.service = service;
  if (changed) { state.date = null; state.slot = null; state.details = null; }
  renderServiceCards('#bookServiceGrid', true);
  const select = $('#serviceSelect');
  if (select && select.value !== id) select.value = id;
  renderServicePreview();
  updateSummary();
  renderPayCopy();
  state.month = state.month || state.site.today.slice(0, 7);
  loadMonth({ autoAdvance: 3 });
  renderSlots([]);
  if (options.advance !== false) goto(2);
}

/**
 * The service dropdown.
 *
 * A photo grid sells a service; a dropdown picks one. The grid still does the
 * selling on the home page — here the client has already decided to book, and
 * seven full-bleed cards between them and the calendar is furniture.
 */
function buildServiceSelect() {
  const select = $('#serviceSelect');
  if (!select || !state.site?.services) return;

  select.innerHTML = '<option value="">Choose a service…</option>' + state.site.services
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} — ${s.priceOnRequest ? 'price on request' : money(s.price)}</option>`)
    .join('');

  select.addEventListener('change', () => {
    const next = $('#serviceNext');
    if (!select.value) {
      state.service = null;
      renderServicePreview();
      if (next) next.disabled = true;
      return;
    }
    // Choosing does not jump the page; the button does. Being thrown to a
    // calendar the instant a select changes is disorienting, and on a phone
    // it happens while the picker is still closing.
    selectService(select.value, { advance: false });
    if (next) next.disabled = false;
  });

  $('#serviceNext')?.addEventListener('click', () => { if (state.service) goto(2); });
}

function renderServicePreview() {
  const box = $('#servicePreview');
  if (!box) return;
  const s = state.service;
  if (!s) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `
    <span class="svc-preview-name">${esc(s.name)}</span>
    <span class="svc-preview-meta">${s.priceOnRequest ? 'Quoted at your consultation' : money(s.price)} · about ${duration(s.duration)}</span>`;
}

/* ------------------------------------------------------------ calendar */

function shiftMonth(delta, options) {
  const [y, m] = state.month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  state.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  loadMonth(options);
}

async function loadMonth({ autoAdvance = 0 } = {}) {
  if (!state.service || !state.month) return;
  const [y, m] = state.month.split('-').map(Number);
  $('#calMonth').textContent = `${MONTHS[m - 1]} ${y}`;

  try {
    const data = await api(`/api/month?month=${state.month}&service=${encodeURIComponent(state.service.id)}`);
    state.monthCache = data;

    // A month with nothing bookable is a dead end — skip to the first that has
    // something rather than making the client hunt.
    const bookable = data.days.some((d) => !d.reason && d.count > 0);
    if (!bookable && autoAdvance > 0) {
      updateMonthNav();
      if (!$('#nextMonth').disabled) { shiftMonth(1, { autoAdvance: autoAdvance - 1 }); return; }
    }
    paintCalendar(data);
  } catch (err) {
    $('#calGrid').innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(err.message)}</div>`;
  }
  updateMonthNav();
}

function updateMonthNav() {
  const today = state.site.today.slice(0, 7);
  $('#prevMonth').disabled = state.month <= today;
  const horizon = new Date(`${state.site.today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + state.site.rules.horizonDays);
  const last = `${horizon.getUTCFullYear()}-${String(horizon.getUTCMonth() + 1).padStart(2, '0')}`;
  $('#nextMonth').disabled = state.month >= last;
}

function paintCalendar(data) {
  const head = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
  const lead = data.days[0]?.weekday ?? 0;
  const blanks = Array.from({ length: lead }, () => '<div class="cal-cell cal-blank"></div>').join('');

  const cells = data.days
    .map((d) => {
      const bookable = !d.reason && d.count > 0;
      const label = d.reason === 'blocked' ? 'Away'
        : d.reason === 'closed' ? 'Closed'
        : d.reason === 'past' || d.reason === 'horizon' ? ''
        : d.count > 0 ? `${d.count} free` : 'Full';
      const cls = ['cal-cell', d.date === state.site.today ? 'is-today' : ''].filter(Boolean).join(' ');
      return `
        <button type="button" class="${cls}" data-date="${d.date}" ${bookable ? '' : 'disabled'}
                aria-pressed="${state.date === d.date}"
                aria-label="${prettyDate(d.date)}${bookable ? `, ${d.count} slots available` : ', unavailable'}">
          <span class="n">${d.day}</span>
          <span class="${bookable ? 'free' : 'none'}">${label}</span>
        </button>`;
    })
    .join('');

  // Pad the final row: unfilled cells would otherwise show the grid lines
  // ending mid-row.
  const trailing = (7 - ((lead + data.days.length) % 7)) % 7;
  const tail = Array.from({ length: trailing }, () => '<div class="cal-cell cal-blank"></div>').join('');

  $('#calGrid').innerHTML = head + blanks + cells + tail;
  $$('#calGrid .cal-cell[data-date]').forEach((btn) =>
    btn.addEventListener('click', () => selectDate(btn.dataset.date)),
  );
}

async function selectDate(dateStr) {
  state.date = dateStr;
  state.slot = null;
  updateSummary();
  if (state.monthCache) paintCalendar(state.monthCache);
  $('#slotHeading').textContent = prettyDate(dateStr);

  try {
    const data = await api(`/api/availability?date=${dateStr}&service=${encodeURIComponent(state.service.id)}`);
    renderSlots(data.slots);
  } catch (err) {
    $('#slotGrid').innerHTML = '';
    $('#slotEmpty').hidden = false;
    $('#slotEmpty').textContent = err.message;
  }
}

function renderSlots(slots) {
  const grid = $('#slotGrid');
  const empty = $('#slotEmpty');

  if (!state.date) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'Select a date above.';
    $('#slotCount').textContent = '';
    return;
  }

  $('#slotCount').textContent = slots.length
    ? `${slots.length} slot${slots.length === 1 ? '' : 's'} · finishes by ${slots[slots.length - 1].end}`
    : '';

  if (!slots.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'No slots left that day for this service. Try another date.';
    return;
  }

  empty.hidden = true;

  // On a phone the times sit below the fold, so the tap looks like it did
  // nothing. Bring them up.
  if (window.matchMedia('(max-width: 1100px)').matches) {
    requestAnimationFrame(() => $('#slotHeading')?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' }));
  }

  grid.innerHTML = slots
    .map((s) => `
      <button type="button" class="slot" data-start="${s.start}" data-end="${s.end}"
              aria-pressed="${state.slot?.start === s.start}">
        ${s.start}<small>ends ${s.end}</small>
      </button>`)
    .join('');

  $$('#slotGrid .slot').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.slot = { start: btn.dataset.start, end: btn.dataset.end };
      $$('#slotGrid .slot').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      updateSummary();
      unlockTabs();
      goto(3);
    }),
  );
}

/* --------------------------------------------------------------- forms */

function bindDetails() {
  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const box = $('#detailsError');

    const problems = [];
    if (name.length < 2) problems.push('your full name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push('a valid email address');
    if (!/^[+()\d\s-]{7,20}$/.test(phone)) problems.push('a valid phone number');

    if (problems.length) {
      box.textContent = `Please enter ${problems.join(', ')}.`;
      box.hidden = false;
      return;
    }
    box.hidden = true;
    state.details = { name, email, phone, notes: form.notes.value.trim() };
    unlockTabs();
    goto(4);
  });
}

function renderPayCopy() {
  const s = state.service;
  const quoted = Boolean(s?.priceOnRequest);
  const cardRadio = $('input[name="payment"][value="card"]');
  const cardOption = cardRadio?.closest('.pay-option');
  const note = $('#payNote');

  // A consultation has no price yet, so there is nothing to pay online.
  // Offering a card option here would be a dead end.
  if (quoted) {
    if (cardOption) cardOption.hidden = true;
    const cash = $('input[name="payment"][value="cash"]');
    if (cash) cash.checked = true;
    state.payment = 'cash';
    $('#cashCopy').textContent = 'Nothing to pay. We agree the price at your consultation.';
    note.className = 'notice';
    note.innerHTML = '<p>Extensions are quoted once we have seen your hair and matched your colour. Your consultation is free and there is nothing to pay today.</p>';
    updateSummary();
    return;
  }

  if (cardOption) cardOption.hidden = false;
  const deposit = s ? (s.deposit > 0 ? Math.min(s.deposit, s.price) : s.price) : 0;
  $('#cashCopy').textContent = s
    ? `Nothing taken now. ${money(s.price)} paid in the studio on the day.`
    : 'Nothing taken now — you pay in the studio on the day.';
  $('#cardCopy').textContent = !s
    ? 'Pay by card.'
    : s.deposit > 0
      ? `${money(s.deposit)} deposit secures the slot. ${money(s.price - s.deposit)} on the day.`
      : `Pay the full ${money(deposit)} now and there is nothing to settle on the day.`;

  if (state.site.cardMode === 'demo') {
    note.className = 'notice notice-warn';
    note.innerHTML = '<p><strong>Draft mode.</strong> Card runs through a simulated checkout — no money moves. A Stripe key switches it to live payments with no other change.</p>';
  } else {
    note.className = 'notice';
    note.innerHTML = '<p>Card payments are handled by Stripe. Card details never touch this site.</p>';
  }
}

function bindPayment() {
  $$('input[name="payment"]').forEach((radio) =>
    radio.addEventListener('change', () => { state.payment = radio.value; updateSummary(); }),
  );
  $('#confirmBtn').addEventListener('click', submitBooking);
}

/* -------------------------------------------------- inspiration photos */
/*
 * Clients already send Chrissy a screenshot of the look they want, over
 * Instagram, separately from the booking — so she has to match the picture to
 * the appointment from memory. Attaching it here puts them in the same place.
 *
 * Uploaded AFTER the booking exists, on purpose. A photo that fails to send
 * must never cost someone their slot, so the appointment is made first and the
 * pictures follow. If they fail, the booking still stands and she is told.
 */
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Same file, same pick — used to skip a duplicate without reading the bytes. */
const photoKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

function bindPhotos() {
  const input = $('#fPhotos');
  if (!input) return;

  input.addEventListener('change', () => {
    const err = $('#photoError');
    err.hidden = true;

    // Each pick ADDS to what is already chosen. The iOS picker hands back one
    // trip at a time, so someone adding a second photo comes back through here
    // a second time; replacing the list would silently drop their first one.
    const existing = state.photos || [];
    const seen = new Set(existing.map(photoKey));
    const picked = [...input.files];

    const tooBig = picked.find((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig) {
      flashMsg(err, `"${tooBig.name}" is over 4MB. Try a screenshot of it instead.`);
    }

    const fresh = picked
      .filter((f) => f.size <= MAX_PHOTO_BYTES)
      .filter((f) => !seen.has(photoKey(f)));

    const room = MAX_PHOTOS - existing.length;
    if (fresh.length > room) {
      flashMsg(err, `${MAX_PHOTOS} photos is the limit — the rest were not added.`);
    }

    state.photos = existing.concat(fresh.slice(0, Math.max(room, 0)));

    // Clear the native input so picking the SAME file again still fires
    // change — otherwise a photo removed by mistake could not be put back.
    input.value = '';
    renderThumbs();
  });
}

function flashMsg(el, text) {
  el.textContent = text;
  el.hidden = false;
}

function renderThumbs() {
  const box = $('#photoThumbs');
  if (!box) return;
  // Revoke the previous batch before losing the references, or every re-pick
  // leaks the last one's blobs for the life of the page.
  (state.thumbUrls || []).forEach((u) => URL.revokeObjectURL(u));
  state.thumbUrls = [];

  box.innerHTML = (state.photos || [])
    .map((file, i) => {
      const url = URL.createObjectURL(file);
      state.thumbUrls.push(url);
      return `
        <figure class="thumb">
          <img src="${url}" alt="" loading="lazy">
          <button type="button" class="thumb-x" data-drop="${i}" aria-label="Remove this photo"><span aria-hidden="true">×</span></button>
        </figure>`;
    })
    .join('');

  $$('#photoThumbs [data-drop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.photos.splice(Number(btn.dataset.drop), 1);
      renderThumbs();
    });
  });
}

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    // readAsDataURL gives "data:image/jpeg;base64,…" — the server wants only
    // the payload, and decides the type by reading the bytes regardless.
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });

async function uploadPhotos(ref, token) {
  if (!state.photos?.length || !token) return;
  const photos = await Promise.all(state.photos.map(fileToBase64));
  await api(`/api/bookings/${encodeURIComponent(ref)}/photos`, {
    method: 'POST',
    body: JSON.stringify({ token, photos }),
  });
}

async function submitBooking() {
  if (state.submitting) return;
  if (!state.service || !state.date || !state.slot || !state.details) { goto(1); return; }

  const btn = $('#confirmBtn');
  const errBox = $('#bookError');
  errBox.hidden = true;
  state.submitting = true;
  btn.disabled = true;
  btn.textContent = 'Confirming…';

  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: state.service.id,
        date: state.date,
        start: state.slot.start,
        payment: state.payment,
        // Tells her notification that pictures are on their way; they upload
        // a moment later, once the slot is safely hers.
        photoCount: (state.photos || []).length,
        ...state.details,
      }),
    });
    sessionStorage.setItem('hbc_last_ref', result.booking.ref);

    // The slot is hers now. Photos are a bonus on top of a booking that has
    // already succeeded, so a failure here is reported and then stepped over
    // rather than being allowed to look like a failed booking.
    if (state.photos?.length) {
      btn.textContent = 'Sending photos…';
      try {
        await uploadPhotos(result.booking.ref, result.uploadToken);
      } catch (err) {
        sessionStorage.setItem('hbc_photo_warning', err.message || 'Your photos did not send.');
      }
    }

    if (result.next === 'checkout' && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    // .html on purpose. The extensionless form only resolves under Node, and
    // the client site is published as flat files — so a real client would have
    // booked successfully and landed on a 404.
    window.location.href = `./confirmed.html?ref=${encodeURIComponent(result.booking.ref)}`;
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
    if (/taken|no longer|closed|passed/i.test(err.message)) {
      state.slot = null;
      await loadMonth();
      if (state.date) await selectDate(state.date);
      goto(2);
    }
  } finally {
    state.submitting = false;
    btn.disabled = false;
    btn.textContent = 'Confirm booking';
  }
}

/* ------------------------------------------------------------- summary */

function updateSummary() {
  const s = state.service;
  $('#sumService').textContent = s ? s.name : '—';
  $('#sumDate').textContent = state.date ? prettyDate(state.date) : '—';
  $('#sumTime').textContent = state.slot ? `${state.slot.start}–${state.slot.end}` : '—';
  $('#sumDuration').textContent = s ? duration(s.duration) : '—';
  const quoted = Boolean(s?.priceOnRequest);
  $('#sumTotal').textContent = s ? (quoted ? 'On request' : money(s.price)) : '—';

  const payingByCard = s && !quoted && state.payment === 'card';
  const deposit = payingByCard ? (s.deposit > 0 ? Math.min(s.deposit, s.price) : s.price) : 0;
  $('#sumDueNow').textContent = quoted ? 'Nothing' : deposit ? money(deposit) : 'Nothing now';
  const later = s && !quoted ? s.price - deposit : 0;
  $('#sumDueLater').textContent = s ? (quoted ? 'Quoted on the day' : later ? money(later) : 'Nothing') : '—';

  const bar = $('#mobileSummary');
  const show = Boolean(s);
  bar.dataset.shown = String(show);
  document.body.dataset.summary = String(show);
  if (!show) return;
  $('#msService').textContent = s.name;
  $('#msWhen').textContent = state.slot && state.date
    ? `${prettyDate(state.date)} · ${state.slot.start}`
    : state.date ? `${prettyDate(state.date)} · pick a time` : 'Choose a date and time';
  $('#msTotal').firstChild.nodeValue = quoted ? 'Quote' : money(s.price);
  $('#msDue').textContent = quoted ? 'free consultation' : deposit ? `${money(deposit)} now` : 'nothing now';
}

/* ----------------------------------------------------------- live feed */

function connectLive() {
  const dot = $('#liveDot');
  let source;
  try {
    source = new EventSource(`${state.apiBase}/api/stream`);
  } catch {
    return;
  }
  source.addEventListener('hello', () => { dot.dataset.state = 'live'; dot.textContent = 'Live availability'; });

  const refresh = async () => {
    if (state.service && state.month) await loadMonth();
    if (state.date) {
      const previous = state.slot?.start;
      await selectDate(state.date);
      if (previous) {
        const btn = $(`#slotGrid .slot[data-start="${previous}"]`);
        if (btn) { btn.click(); goto(state.step); }
        else if (state.step >= 3) { state.slot = null; updateSummary(); goto(2); }
      }
    }
  };
  source.addEventListener('bookings-changed', refresh);
  source.addEventListener('availability-changed', refresh);
  source.onerror = () => { dot.dataset.state = 'offline'; dot.textContent = 'Reconnecting'; };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.service && state.month) loadMonth();
  });
}

/* ---------------------------------------------------------------- chrome */

function bindChrome() {
  bindNav();
  bindCalendarChrome();
  bindNewsletter();
}

/** The header menu. Absent only if the header markup changes underneath us. */
function bindNav() {
  const nav = $('#primaryNav');
  const toggle = $('#navToggle');
  if (!nav || !toggle) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('#primaryNav a').forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  });
}

/**
 * Month arrows and step tabs. Split out from the nav so a change to the header
 * can never silently take the calendar's controls with it — they used to sit
 * behind the same early return.
 */
function bindCalendarChrome() {
  $('#prevMonth')?.addEventListener('click', () => shiftMonth(-1));
  $('#nextMonth')?.addEventListener('click', () => shiftMonth(1));
  $$('.step-tab').forEach((t) => t.addEventListener('click', () => goto(Number(t.dataset.step))));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(Number(b.dataset.goto))));
}

function bindNewsletter() {
  // No backend on a static host, so say so honestly rather than pretending.
  $('#newsletterForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#nlEmail').value.trim();
    const note = $('#newsletterNote');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      note.textContent = 'Please enter a valid email address.';
      return;
    }
    note.textContent = state.live
      ? 'Thank you — you are on the list.'
      : 'Sign-up is not connected yet. Follow on Instagram for new availability.';
    if (state.live) $('#nlEmail').value = '';
  });
}

/**
 * Her opening hours, in a sentence, from the same source the calendar uses.
 * Written out because "when is she open" is the question the calendar answers
 * one month at a time, and someone deciding whether to bother wants it now.
 */
function renderOpeningHours() {
  const el = $('#bookHoursNote');
  const hours = state.site?.workingHours;
  if (!el || !hours) return;

  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const open = [1, 2, 3, 4, 5, 6, 0].filter((d) => hours[d]?.open);
  if (!open.length) { el.textContent = ''; return; }

  // Collapse consecutive days that share the same hours: "Monday to Friday
  // 10:00-19:00" rather than five identical lines.
  const runs = [];
  for (const d of open) {
    const h = hours[d];
    const last = runs[runs.length - 1];
    if (last && last.start === h.start && last.end === h.end && last.days[last.days.length - 1] === (d + 6) % 7) {
      last.days.push(d);
    } else {
      runs.push({ days: [d], start: h.start, end: h.end });
    }
  }

  el.textContent = runs
    .map((r) => {
      const span = r.days.length > 1
        ? `${NAMES[r.days[0]]} to ${NAMES[r.days[r.days.length - 1]]}`
        : NAMES[r.days[0]];
      return `${span} ${r.start}–${r.end}`;
    })
    .join(' · ');
}

/* ------------------------------------------------------------------ init */

/**
 * Say something while the booking service wakes up.
 *
 * A free hosting tier stops the API after a spell with no traffic and starts
 * it again on the next request, which takes the better part of a minute. For
 * that minute the booking area is hidden and the page is a heading and
 * nothing else — so the first client of the day gets a blank screen and
 * leaves, and nothing anywhere records that it happened.
 *
 * Four seconds is long enough not to flash on a warm service, short enough to
 * arrive before anyone concludes the page is broken.
 */
function wakingNotice() {
  const box = $('#bookingStatic');
  const dot = $('#liveDot');
  const dotWas = dot?.textContent;
  let touchedDot = false;

  const timer = setTimeout(() => {
    if (dot) { dot.textContent = 'Waking up'; touchedDot = true; }
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<strong>Just a moment.</strong> The booking service is starting up — '
      + 'the calendar will appear shortly. This only happens on the first visit for a while.';
  }, 4000);

  return () => {
    clearTimeout(timer);
    if (box) { box.hidden = true; box.innerHTML = ''; }
    // Put the label back rather than leaving "Waking up" sitting there. The
    // live feed relabels it to "Live availability" when the stream connects,
    // and if that never happens this must not be the last word on screen.
    if (touchedDot && dot) dot.textContent = dotWas;
  };
}

/** Never leave the page waiting forever on a host that is not answering. */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The booking service did not respond.')), ms)),
  ]);
}

async function init() {
  state.apiBase = resolveApiBase();
  const doneWaking = wakingNotice();

  // Try the live API first; fall back to the bundled snapshot on a static host.
  try {
    // Generous, because a sleeping free-tier instance genuinely takes this
    // long to start. Shorter and a cold start would be misread as an outage
    // and drop a perfectly good service into enquiry mode.
    state.site = await withTimeout(api('/api/site'), 60000);
    state.live = true;
  } catch {
    try {
      const res = await fetch(`${state.apiBase}/data/site.json`);
      state.site = await res.json();
      state.live = false;
    } catch {
      doneWaking();
      document.body.insertAdjacentHTML('afterbegin',
        '<div class="notice notice-error" style="margin:24px">Could not load the site content. Please refresh.</div>');
      return;
    }
  }
  doneWaking();

  renderStatic();
  bindChrome();

  // The booking flow lives on its own page now, so the home page has none of
  // this. Everything below is skipped rather than crashed through.
  const onBookingPage = Boolean($('#bookingLive'));
  renderOpeningHours();
  if (!onBookingPage) return;

  if (state.live) {
    $('#bookingLive').hidden = false;
    $('#bookingStatic').hidden = true;
    put('#cancelPolicy', 'textContent',
      `Free to move or cancel up to ${state.site.rules.cancellationHours} hours before. Inside that window the deposit is retained.`);
    buildServiceSelect();
    renderServiceCards('#bookServiceGrid', true);
    bindDetails();
    bindPayment();
    bindPhotos();
    updateSummary();
    unlockTabs();
    connectLive();
  } else {
    enterStaticMode('This page is published as static files, so it cannot hold a slot.');
  }
}

init();
