/**
 * Client-facing booking flow.
 *
 * "Live" here means two things:
 *  1. availability is always fetched from the server, never cached client-side
 *  2. an EventSource connection pushes a refresh the instant anyone books,
 *     or the instant Chrissy changes her hours in the admin dashboard
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  site: null,
  step: 1,
  service: null,
  month: null,       // 'YYYY-MM'
  date: null,        // 'YYYY-MM-DD'
  slot: null,        // { start, end }
  details: null,
  payment: 'cash',
  monthCache: null,
  submitting: false,
};

const money = (n) => (n === 0 ? 'Free' : `£${Number(n).toLocaleString('en-GB')}`);

function duration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function prettyDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${DOW_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][0]}${MONTHS[d.getUTCMonth()].slice(1).toLowerCase()}`;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------ page render */

function renderStatic() {
  const { brand, services, reviews, gallery, faqs, workingHours } = state.site;

  document.title = `${brand.name.replace(/\b\w/g, (c) => c.toUpperCase())} — ${brand.tagline.toLowerCase()}, ${brand.location.split(',')[0].toLowerCase()}`;
  $('#heroLocation').textContent = brand.location;
  $('#heroIntro').textContent = brand.intro;
  $('#igLink').href = brand.instagram;

  $('#methodStrip').innerHTML = brand.methods.map((m) => `<span>${m}</span>`).join('');
  $('#statMethods').textContent = brand.methods.length;
  $('#statOpen').textContent = Object.values(workingHours).filter((h) => h.open).length;

  // Price list
  $('#serviceList').innerHTML = services
    .map(
      (s) => `
      <div class="service-row">
        <div>
          <div class="name">${esc(s.name)}</div>
          <p class="blurb">${esc(s.blurb)}</p>
          <div class="facts">
            <span>${esc(s.category)}</span>
            <span>${duration(s.duration)}</span>
            ${s.deposit ? `<span>£${s.deposit} deposit</span>` : '<span>No deposit</span>'}
          </div>
        </div>
        <div class="price">
          <div class="amount">${money(s.price)}</div>
          ${s.price ? '<span class="from">Fitting from</span>' : '<span class="from">No charge</span>'}
        </div>
      </div>`,
    )
    .join('');

  // Gallery — a real photo if the file exists, the placeholder panel if not.
  $('#galleryGrid').innerHTML = gallery
    .map(
      (g) => `
      <figure class="photo-card" style="margin:0">
        <div class="photo photo-fallback" data-src="/images/${esc(g.file)}">
          <span class="tag">${esc(g.label)}</span>
        </div>
        <figcaption class="meta">
          <p class="body-sm muted" style="margin:0">${esc(g.caption)}</p>
        </figcaption>
      </figure>`,
    )
    .join('');
  loadPhotos();

  // Reviews
  $('#reviewGrid').innerHTML = reviews
    .map(
      (r) => `
      <blockquote class="review">
        <div class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}</div>
        <p class="text" style="margin:0">“${esc(r.text)}”</p>
        <footer class="who">${esc(r.name)} · ${esc(r.service)}</footer>
      </blockquote>`,
    )
    .join('');

  // FAQ
  $('#faqList').innerHTML = faqs
    .map((f) => `<details><summary>${esc(f.q)}</summary><div class="answer"><p>${esc(f.a)}</p></div></details>`)
    .join('');

  // Footer
  $('#footNotice').textContent = brand.notice;
  $('#footServices').innerHTML = services.slice(0, 6).map((s) => `<li><a href="#services">${esc(s.name)}</a></li>`).join('');
  $('#footStudio').innerHTML = [
    ...brand.addressLines.map((l) => `<li>${esc(l)}</li>`),
    brand.email ? `<li><a href="mailto:${esc(brand.email)}">${esc(brand.email)}</a></li>` : '',
    `<li><a href="${esc(brand.instagram)}" target="_blank" rel="noopener">${esc(brand.handle)}</a></li>`,
  ].join('');
  $('#footHours').innerHTML = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => {
      const h = workingHours[String(d)];
      return `<li>${DOW_LONG[d]} — ${h?.open ? `${h.start}–${h.end}` : 'Closed'}</li>`;
    })
    .join('');
  $('#footCopy').textContent = `© ${new Date().getFullYear()} ${brand.name}. ${brand.location}.`;

  $('#cancelPolicy').textContent =
    `Free to move or cancel up to ${state.site.rules.cancellationHours} hours before your appointment. Inside that window the deposit is retained.`;

  renderServicePicker();
  renderPayCopy();
}

/** Swap in real photographs where the file has actually been added. */
function loadPhotos() {
  $$('[data-src]').forEach((el) => {
    const src = el.dataset.src;
    const probe = new Image();
    probe.onload = () => {
      el.style.backgroundImage = `url("${src}")`;
      el.classList.remove('photo-fallback');
    };
    probe.src = src;
  });
  const hero = new Image();
  hero.onload = () => {
    const el = $('#heroPhoto');
    el.style.backgroundImage = 'url("/images/hero.jpg")';
    el.classList.remove('photo-fallback');
  };
  hero.src = '/images/hero.jpg';
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------------------------------------- stepping */

function goto(step) {
  state.step = step;
  $$('.step-tab').forEach((t) => t.setAttribute('aria-selected', String(Number(t.dataset.step) === step)));
  $$('.step-panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
  unlockTabs();
  const anchor = document.getElementById('book');
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function unlockTabs() {
  const reach = { 1: true, 2: !!state.service, 3: !!state.slot, 4: !!state.details };
  $$('.step-tab').forEach((t) => { t.disabled = !reach[t.dataset.step]; });
}

/* ------------------------------------------------------- step 1: service */

function renderServicePicker() {
  $('#servicePicker').innerHTML = state.site.services
    .map(
      (s) => `
      <button class="service-pick" type="button" data-id="${esc(s.id)}" aria-pressed="${state.service?.id === s.id}">
        <span>
          <span class="n">${esc(s.name)}</span>
          <span class="d">${esc(s.category)} · ${duration(s.duration)}${s.deposit ? ` · £${s.deposit} deposit` : ''}</span>
        </span>
        <span class="p">${money(s.price)}</span>
      </button>`,
    )
    .join('');

  $$('#servicePicker .service-pick').forEach((btn) => {
    btn.addEventListener('click', () => selectService(btn.dataset.id));
  });
}

function selectService(id) {
  const service = state.site.services.find((s) => s.id === id);
  if (!service) return;
  const changed = state.service?.id !== id;
  state.service = service;
  if (changed) {
    state.date = null;
    state.slot = null;
    state.details = null;
  }
  renderServicePicker();
  updateSummary();
  renderPayCopy();

  state.month = state.month || state.site.today.slice(0, 7);
  loadMonth({ autoAdvance: 3 });
  renderSlots([]);
  goto(2);
}

/* ---------------------------------------------------- step 2: date + time */

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
  paintCalendarSkeleton();

  try {
    const data = await api(`/api/month?month=${state.month}&service=${encodeURIComponent(state.service.id)}`);
    state.monthCache = data;

    // Landing on a month with nothing bookable (late in the month, or a long
    // service that no longer fits) is a dead end — skip ahead to the first
    // month that actually has slots rather than making the client hunt.
    const bookable = data.days.some((d) => !d.reason && d.count > 0);
    if (!bookable && autoAdvance > 0) {
      updateMonthNav();
      if (!$('#nextMonth').disabled) {
        shiftMonth(1, { autoAdvance: autoAdvance - 1 });
        return;
      }
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
  // Horizon: allow browsing up to the last month that contains a bookable date.
  const horizonDate = new Date(`${state.site.today}T00:00:00Z`);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + state.site.rules.horizonDays);
  const last = `${horizonDate.getUTCFullYear()}-${String(horizonDate.getUTCMonth() + 1).padStart(2, '0')}`;
  $('#nextMonth').disabled = state.month >= last;
}

function paintCalendarSkeleton() {
  const head = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
  const cells = Array.from({ length: 35 }, () => '<div class="cal-cell skeleton"></div>').join('');
  $('#calGrid').innerHTML = head + cells;
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
        : d.reason === 'past' ? ''
        : d.reason === 'horizon' ? ''
        : d.count > 0 ? `${d.count} free` : 'Full';
      const cls = ['cal-cell', d.date === state.site.today ? 'is-today' : ''].filter(Boolean).join(' ');
      return `
        <button type="button" class="${cls}" data-date="${d.date}"
                ${bookable ? '' : 'disabled'}
                aria-pressed="${state.date === d.date}"
                aria-label="${prettyDate(d.date)}${bookable ? `, ${d.count} slots available` : ', unavailable'}">
          <span class="n">${d.day}</span>
          <span class="${bookable ? 'free' : 'none'}">${label}</span>
        </button>`;
    })
    .join('');

  $('#calGrid').innerHTML = head + blanks + cells;
  $$('#calGrid .cal-cell[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => selectDate(btn.dataset.date));
  });
}

async function selectDate(dateStr) {
  state.date = dateStr;
  state.slot = null;
  updateSummary();
  if (state.monthCache) paintCalendar(state.monthCache);

  $('#slotHeading').textContent = prettyDate(dateStr);
  $('#slotEmpty').hidden = true;
  $('#slotGrid').innerHTML = Array.from({ length: 6 }, () => '<div class="slot skeleton"></div>').join('');

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
    empty.textContent = 'Select a date on the calendar above.';
    $('#slotCount').textContent = '';
    return;
  }

  $('#slotCount').textContent = slots.length ? `${slots.length} slot${slots.length === 1 ? '' : 's'} · finishes by ${slots[slots.length - 1].end}` : '';

  if (!slots.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'No slots left on that day for this service. Try another date.';
    return;
  }

  empty.hidden = true;
  grid.innerHTML = slots
    .map(
      (s) => `
      <button type="button" class="slot" data-start="${s.start}" data-end="${s.end}"
              aria-pressed="${state.slot?.start === s.start}">
        ${s.start}<small>ends ${s.end}</small>
      </button>`,
    )
    .join('');

  $$('#slotGrid .slot').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.slot = { start: btn.dataset.start, end: btn.dataset.end };
      $$('#slotGrid .slot').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      updateSummary();
      unlockTabs();
      goto(3);
    });
  });
}

/* ---------------------------------------------------- step 3: the details */

function bindDetails() {
  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();

    const problems = [];
    if (name.length < 2) problems.push('your full name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push('a valid email address');
    if (!/^[+()\d\s-]{7,20}$/.test(phone)) problems.push('a valid phone number');

    if (problems.length) {
      showError(`Please enter ${problems.join(', ')}.`, form);
      return;
    }

    state.details = { name, email, phone, notes: form.notes.value.trim() };
    unlockTabs();
    goto(4);
  });
}

function showError(message, near) {
  let box = near?.querySelector('.notice-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'notice notice-error';
    box.style.marginTop = 'var(--md)';
    near.appendChild(box);
  }
  box.textContent = message;
  box.hidden = false;
}

/* --------------------------------------------------- step 4: the payment */

function renderPayCopy() {
  const s = state.service;
  const deposit = s ? Math.min(s.deposit, s.price) : 0;

  $('#cashCopy').textContent = s
    ? `Nothing taken now. Your slot is held and you pay ${money(s.price)} in the studio on the day.`
    : 'Nothing taken now. You pay the full amount in the studio on the day.';

  $('#cardCopy').textContent = deposit
    ? `A ${money(deposit)} deposit secures the slot now. ${money(s.price - deposit)} balance on the day.`
    : 'No deposit is required for this service — card is still available for the balance on the day.';

  const note = $('#payNote');
  if (state.site.cardMode === 'demo') {
    note.className = 'notice notice-warn';
    note.innerHTML =
      '<strong>Draft mode.</strong> Card payments run through a simulated checkout — no real money moves. Adding a Stripe key switches this to live card payments with no other changes.';
  } else {
    note.className = 'notice';
    note.textContent = 'Card payments are handled by Stripe. Card details never touch this site.';
  }
}

function bindPayment() {
  $$('input[name="payment"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.payment = radio.value;
      updateSummary();
    });
  });

  $('#confirmBtn').addEventListener('click', submitBooking);
}

async function submitBooking() {
  if (state.submitting) return;
  if (!state.service || !state.date || !state.slot || !state.details) {
    goto(1);
    return;
  }

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
    window.location.href = `/confirmed?ref=${encodeURIComponent(result.booking.ref)}`;
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
    // A 409 means someone else took the slot — refresh so the client sees truth.
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

/* -------------------------------------------------------------- summary */

function updateSummary() {
  const s = state.service;
  $('#sumService').textContent = s ? s.name : '—';
  $('#sumDate').textContent = state.date ? prettyDate(state.date) : '—';
  $('#sumTime').textContent = state.slot ? `${state.slot.start}–${state.slot.end}` : '—';
  $('#sumDuration').textContent = s ? duration(s.duration) : '—';
  $('#sumTotal').textContent = s ? money(s.price) : '—';

  const deposit = s && state.payment === 'card' ? Math.min(s.deposit, s.price) : 0;
  // money() renders 0 as "Free", which is right for a price but wrong for an
  // amount payable, so the two due lines get their own wording.
  $('#sumDueNow').textContent = deposit ? money(deposit) : 'Nothing now';
  const later = s ? s.price - deposit : null;
  $('#sumDueLater').textContent = s ? (later ? money(later) : 'Nothing') : '—';
}

/* ------------------------------------------------------------ live feed */

function connectLive() {
  const dot = $('#liveDot');
  let source;

  const open = () => {
    source = new EventSource('/api/stream');

    source.addEventListener('hello', () => {
      dot.dataset.state = 'live';
      dot.textContent = 'Live availability';
    });

    const refresh = async () => {
      // Repaint whatever the client is currently looking at.
      if (state.service && state.month) await loadMonth();
      if (state.date) {
        const previous = state.slot?.start;
        await selectDate(state.date);
        // If their chosen slot survived the change, keep it selected.
        if (previous) {
          const btn = $(`#slotGrid .slot[data-start="${previous}"]`);
          if (btn) {
            btn.click();
            goto(state.step);
          } else if (state.step >= 3) {
            state.slot = null;
            updateSummary();
            goto(2);
          }
        }
      }
    };

    source.addEventListener('bookings-changed', refresh);
    source.addEventListener('availability-changed', refresh);

    source.onerror = () => {
      dot.dataset.state = 'offline';
      dot.textContent = 'Reconnecting…';
      // EventSource retries on its own; this only reflects the state visually.
    };
  };

  open();

  // A tab returning to the foreground may have missed events while hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.service && state.month) loadMonth();
  });
}

/* ------------------------------------------------------------------ init */

function bindChrome() {
  $('#navToggle').addEventListener('click', () => {
    const nav = $('#navlinks');
    const open = nav.classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', String(open));
  });
  $$('#navlinks a').forEach((a) => a.addEventListener('click', () => $('#navlinks').classList.remove('open')));

  $('#prevMonth').addEventListener('click', () => shiftMonth(-1));
  $('#nextMonth').addEventListener('click', () => shiftMonth(1));

  $$('.step-tab').forEach((t) => t.addEventListener('click', () => goto(Number(t.dataset.step))));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(Number(b.dataset.goto))));
}

async function init() {
  try {
    state.site = await api('/api/site');
  } catch {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="notice notice-error" style="margin:24px">Could not reach the booking service. Please refresh.</div>',
    );
    return;
  }

  state.month = state.site.today.slice(0, 7);
  renderStatic();
  bindChrome();
  bindDetails();
  bindPayment();
  updateSummary();
  unlockTabs();
  connectLive();

  const cancelled = new URLSearchParams(location.search).get('cancelled');
  if (cancelled) {
    const note = document.createElement('div');
    note.className = 'notice notice-warn';
    note.style.margin = 'var(--md) 0';
    note.textContent = `Payment for ${cancelled} was not completed, so that slot has been released. You are welcome to book again.`;
    $('#book').querySelector('.section-head').appendChild(note);
  }
}

init();
