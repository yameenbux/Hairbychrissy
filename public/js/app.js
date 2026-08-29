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

function resolveApiBase() {
  if (window.HBC_API) return String(window.HBC_API).replace(/\/$/, '');
  const meta = document.querySelector('meta[name="hbc-api"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');
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

function renderStatic() {
  const { brand, services, reviews, faqs } = state.site;

  $('#heroLocation').textContent = brand.location.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  $('#heroIntro').textContent = brand.intro;
  $('#navInstagram').href = brand.instagram;
  if (brand.strapline) $('#strapline').textContent = brand.strapline;

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

  if (brand.signoff) $('#signoff').textContent = brand.signoff;

  renderServiceCards('#serviceGrid', false);

  $('#reviewGrid').innerHTML = reviews
    .map(
      (r) => `
      <blockquote class="review reveal">
        <span class="mark" aria-hidden="true">”</span>
        <p>${esc(r.text)}</p>
        <footer>${esc(r.name)} — ${esc(r.service)}</footer>
      </blockquote>`,
    )
    .join('');

  $('#faqList').innerHTML = faqs
    .map((f) => `<details><summary>${esc(f.q)}</summary><div class="answer"><p>${esc(f.a)}</p></div></details>`)
    .join('');

  $('#footStudio').innerHTML = [
    ...brand.addressLines.map((l) => `<li>${esc(l)}</li>`),
    brand.email ? `<li><a href="mailto:${esc(brand.email)}">${esc(brand.email)}</a></li>` : '',
    `<li><a href="${esc(brand.instagram)}" target="_blank" rel="noopener">${esc(brand.handle)}</a></li>`,
    brand.website ? `<li><a href="${esc(brand.website)}" target="_blank" rel="noopener">${esc(brand.websiteLabel || brand.website)}</a></li>` : '',
  ].join('');

  $('#legalCopy').textContent = `© ${new Date().getFullYear()} ${brand.name}. London.`;
  $('#legalNotice').textContent = brand.notice;

  loadImagery();
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

  const heroEl = $('#heroMedia');
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

function selectService(id) {
  const service = state.site.services.find((s) => s.id === id);
  if (!service) return;
  const changed = state.service?.id !== id;
  state.service = service;
  if (changed) { state.date = null; state.slot = null; state.details = null; }
  renderServiceCards('#bookServiceGrid', true);
  updateSummary();
  renderPayCopy();
  state.month = state.month || state.site.today.slice(0, 7);
  loadMonth({ autoAdvance: 3 });
  renderSlots([]);
  goto(2);
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
  if (window.matchMedia('(max-width: 860px)').matches) {
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
        ...state.details,
      }),
    });
    sessionStorage.setItem('hbc_last_ref', result.booking.ref);
    if (result.next === 'checkout' && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    window.location.href = `./confirmed?ref=${encodeURIComponent(result.booking.ref)}`;
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
  const nav = $('#primaryNav');
  const toggle = $('#navToggle');
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

  $('#prevMonth')?.addEventListener('click', () => shiftMonth(-1));
  $('#nextMonth')?.addEventListener('click', () => shiftMonth(1));
  $$('.step-tab').forEach((t) => t.addEventListener('click', () => goto(Number(t.dataset.step))));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(Number(b.dataset.goto))));

  // No backend on a static host, so say so honestly rather than pretending.
  $('#newsletterForm').addEventListener('submit', (e) => {
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

/* ------------------------------------------------------------------ init */

async function init() {
  state.apiBase = resolveApiBase();

  // Try the live API first; fall back to the bundled snapshot on a static host.
  try {
    state.site = await api('/api/site');
    state.live = true;
  } catch {
    try {
      const res = await fetch(`${state.apiBase}/data/site.json`);
      state.site = await res.json();
      state.live = false;
    } catch {
      document.body.insertAdjacentHTML('afterbegin',
        '<div class="notice notice-error" style="margin:24px">Could not load the site content. Please refresh.</div>');
      return;
    }
  }

  renderStatic();
  bindChrome();

  if (state.live) {
    $('#bookingLive').hidden = false;
    $('#bookingStatic').hidden = true;
    $('#cancelPolicy').textContent =
      `Free to move or cancel up to ${state.site.rules.cancellationHours} hours before. Inside that window the deposit is retained.`;
    renderServiceCards('#bookServiceGrid', true);
    bindDetails();
    bindPayment();
    updateSummary();
    unlockTabs();
    connectLive();
  } else {
    enterStaticMode('This page is published as static files, so it cannot hold a slot.');
  }
}

init();
