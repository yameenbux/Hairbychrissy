/**
 * Studio dashboard.
 * Chrissy sets her working week, blocks time off, edits her price list and
 * manages bookings. Every save pushes down the live event stream, so a client
 * with the booking page open sees the change without refreshing.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const state = {
  data: null, view: 'today', draftHours: null, draftServices: null,
  day: null,               // the date the run sheet is showing
  editing: null,           // booking id whose move/note panel is open
  alerts: null,            // notification channels, devices and log
  knownRefs: null,         // bookings already seen — null until the first load
  unseen: 0,               // count shown in the tab title
  baseTitle: document.title,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `£${Number(n || 0).toLocaleString('en-GB')}`;

function shortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function duration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/**
 * Site root, derived from this script's own URL rather than assumed to be "/".
 * Keeps the dashboard working when the app is mounted at a subpath — behind a
 * reverse proxy, or on a project-scoped host.
 */
const BASE = new URL('../', import.meta.url).href.replace(/\/$/, '');

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login')) {
    showLogin();
    throw new Error('Session expired — please sign in again.');
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    // Some replies are a refusal *with* something to say — the overrides she
    // is about to make, for instance. Throwing away the body loses them.
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function flash(el, message, kind = 'ok') {
  el.className = `notice notice-${kind}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._t);
  // Confirmations can fade; problems stay put until she does something about
  // them. An error that disappears after four seconds is an error she misses.
  if (kind === 'ok') el._t = setTimeout(() => { el.hidden = true; }, 5000);
}

/* ------------------------------------------------------------------ auth */

function showLogin() {
  $('#loginView').hidden = false;
  $('#app').hidden = true;
  $('#adminNav').hidden = true;
  $('#adminNavToggle').hidden = true;
  closeNav();
}

/* ------------------------------------------------------------ mobile nav */

/**
 * The dashboard nav collapses to a sheet on narrow screens. Without this it
 * was simply unreachable on a phone — no hours, no services, no alerts, no way
 * to sign out.
 */
function closeNav() {
  $('#adminNav').classList.remove('open');
  $('#adminNavToggle').setAttribute('aria-expanded', 'false');
}

$('#adminNavToggle').addEventListener('click', () => {
  const open = $('#adminNav').classList.toggle('open');
  $('#adminNavToggle').setAttribute('aria-expanded', String(open));
});

// Tapping a section closes the sheet, so the content is visible immediately.
$$('#adminNav a').forEach((a) => a.addEventListener('click', closeNav));

// Escape closes it, and so does growing past the breakpoint.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeNav();
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeNav();
});

async function showApp() {
  $('#loginView').hidden = true;
  $('#app').hidden = false;
  $('#adminNav').hidden = false;
  $('#adminNavToggle').hidden = false;
  // Same base the API calls use, so the export works under a subpath too.
  $('#bookingsExport').href = `${BASE}/api/admin/bookings.csv`;
  await refresh();
  await loadAlerts().catch(() => {});
  setView(state.view);
  connectLive();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginError');
  err.hidden = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
    $('#pw').value = '';
    await showApp();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

/* -------------------------------------------------------------- routing */

function setView(view) {
  state.view = view;
  if (view === 'alerts') loadAlerts().catch(() => {});
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  $$('#adminNav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('#adminNav a[data-view]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    setView(a.dataset.view);
  }),
);

/* ------------------------------------------------------------ data load */

async function refresh() {
  state.data = await api('/api/admin/state');
  state.draftHours = structuredClone(state.data.workingHours);
  state.draftServices = structuredClone(state.data.services);
  renderToday();
  renderBookings();
  renderHours();
  renderBlocked();
  renderServices();
  renderSettings();
  detectNewBookings();
}

/* -------------------------------------------------- new-booking alerting */

/**
 * Work out what arrived since the last refresh by diffing booking references.
 * Done here rather than pushed down the event stream on purpose: /api/stream is
 * public, so it must never carry a client's name, number or appointment.
 */
function detectNewBookings() {
  const refs = new Set(state.data.bookings.map((b) => b.ref));

  // First load after signing in: learn what already exists without alerting.
  if (state.knownRefs === null) {
    state.knownRefs = refs;
    return;
  }

  const fresh = state.data.bookings.filter((b) => !state.knownRefs.has(b.ref));
  state.knownRefs = refs;
  if (!fresh.length) return;

  for (const booking of fresh) raiseAlert(booking);
}

function raiseAlert(booking) {
  const title = `New booking — ${booking.clientName}`;
  const body = [
    booking.serviceName,
    `${shortDate(booking.date)} at ${booking.start}`,
    booking.payment === 'cash' ? `Cash · ${money(booking.total)} on the day` : `Card · ${money(booking.balanceDue)} on the day`,
    booking.client.phone,
  ].join('\n');

  showBanner(title, body);
  chime();
  bumpTitle();

  // A desktop notification as well, for when the dashboard is behind something.
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, icon: './icon-192.png', tag: `hbc-${booking.ref}` });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {
      /* some browsers only allow this via the service worker — the banner covers it */
    }
  }
}

function showBanner(title, body) {
  const banner = $('#alertBanner');
  $('#alertTitle').textContent = title;
  $('#alertBody').textContent = body;
  banner.hidden = false;
}

function bumpTitle() {
  state.unseen += 1;
  document.title = `(${state.unseen}) ${state.baseTitle}`;
}

function clearTitle() {
  state.unseen = 0;
  document.title = state.baseTitle;
}

/** A short two-tone chime, synthesised so there is no audio file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    state.audio = state.audio || new Ctx();
    const ctx = state.audio;
    if (ctx.state === 'suspended') ctx.resume();

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  } catch {
    /* audio blocked until the page is interacted with — the banner still shows */
  }
}

/* --------------------------------------------------------------- today */

function liveBookings() {
  return state.data.bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'expired');
}

function renderToday() {
  const { today } = state.data;
  const d = new Date(`${today}T00:00:00Z`);
  $('#todayHeading').textContent = `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

  const live = liveBookings();
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);

  const todays = live.filter((b) => b.date === today);
  const week = live.filter((b) => b.date >= today && b.date < in7);
  const month = live.filter((b) => b.date >= today && b.date < in30);

  $('#kpiToday').textContent = todays.length;
  $('#kpiWeek').textContent = week.length;
  $('#kpiRevenue').textContent = money(month.reduce((sum, b) => sum + b.total, 0));
  $('#kpiOwed').textContent = money(month.reduce((sum, b) => sum + b.balanceDue, 0));

  const upcoming = live.filter((b) => b.date > today).slice(0, 8);
  $('#upcomingList').innerHTML = upcoming.length
    ? upcoming.map(apptRow).join('')
    : '<div class="empty">Nothing booked beyond today.</div>';
  bindApptActions('#upcomingList');

  renderDay();
}

/* ------------------------------------------------------------ run sheet */

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/**
 * One day, in order, with the gaps between appointments spelled out.
 *
 * The gaps are the point. When a client rings asking "have you got anything
 * Thursday", the answer is in the spaces, not the appointments — and reading
 * it off a list of start times is how people end up promising a slot that is
 * twenty minutes long.
 */
function renderDay() {
  const day = state.day || state.data.today;
  $('#dayPick').value = day;

  const list = state.data.bookings
    .filter((b) => b.date === day)
    .sort((a, b) => a.start.localeCompare(b.start));

  const live = list.filter((b) => !isDead(b));
  const mins = live.reduce((sum, b) => sum + b.duration, 0);
  const owed = live.reduce((sum, b) => sum + b.balanceDue, 0);

  const hours = state.data.workingHours[String(new Date(`${day}T00:00:00Z`).getUTCDay())];
  const closed = !hours || !hours.open;
  const blocked = state.data.blockedDates.find((b) => b.date === day);

  const bits = [];
  if (blocked) bits.push(`Marked as time off${blocked.reason ? ` — ${blocked.reason}` : ''}`);
  else if (closed) bits.push('Normally closed');
  else bits.push(`Open ${hours.start}–${hours.end}`);
  bits.push(live.length === 1 ? '1 appointment' : `${live.length} appointments`);
  if (mins) bits.push(duration(mins) + ' in the chair');
  if (owed) bits.push(`${money(owed)} to collect`);
  $('#daySummary').textContent = bits.join(' · ');

  // A closed or blocked-out day has nothing to lay out. An open day with an
  // empty diary very much does — the whole point is seeing what is free.
  if (closed || blocked) {
    $('#dayList').innerHTML = `<div class="empty">${
      blocked ? 'You have this day marked as time off' : 'You are normally closed'
    } on ${shortDate(day)}.${list.length ? ' There are still appointments in the diary below.' : ''}</div>${
      list.length ? list.map(apptRow).join('') : ''
    }`;
    if (list.length) bindApptActions('#dayList');
    return;
  }

  /*
   * Gaps are measured between the things that actually occupy the day, and her
   * break is one of them. Measuring only against appointments would report an
   * empty Tuesday as "9h free" and offer her lunch to a client — which is the
   * one number on this screen she would act on without checking.
   *
   * Cancellations are not occupied: a cancelled two o'clock shows as free.
   */
  const blocks = list
    .filter((b) => !isDead(b))
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end), booking: b }));

  const bStart = toMin(hours?.breakStart);
  const bEnd = toMin(hours?.breakEnd);
  if (!closed && bStart != null && bEnd != null && bEnd > bStart) {
    blocks.push({ start: bStart, end: bEnd, brk: true });
  }
  blocks.sort((a, b) => a.start - b.start);

  const open = closed ? null : toMin(hours.start);
  const shut = closed ? null : toMin(hours.end);

  const rows = [];
  let cursor = open;
  for (const blk of blocks) {
    if (cursor != null && blk.start - cursor >= 15) rows.push(gapRow(cursor, blk.start, day));
    rows.push(blk.brk ? breakRow(blk.start, blk.end) : apptRow(blk.booking));
    cursor = cursor == null ? blk.end : Math.max(cursor, blk.end);
  }
  if (shut != null && cursor != null && shut - cursor >= 15) rows.push(gapRow(cursor, shut, day));

  // Cancelled and expired rows are still worth seeing — she wants to know a
  // client dropped out — but they belong under the day, not inside it.
  const dead = list.filter(isDead);
  if (dead.length) {
    rows.push('<p class="label label-muted" style="margin:24px 0 8px">Cancelled that day</p>');
    rows.push(...dead.map(apptRow));
  }

  $('#dayList').innerHTML = rows.join('');
  bindApptActions('#dayList');
  bindGapActions('#dayList');
}

function breakRow(fromMin, toMinutes_) {
  return `
    <div class="gap is-break">
      <span class="g-time">${toHHMM(fromMin)}–${toHHMM(toMinutes_)}</span>
      <span class="g-len">Your break</span>
    </div>`;
}

function gapRow(fromMin, toMinutes_, day) {
  const len = toMinutes_ - fromMin;
  return `
    <div class="gap" data-date="${esc(day)}" data-start="${toHHMM(fromMin)}">
      <span class="g-time">${toHHMM(fromMin)}–${toHHMM(toMinutes_)}</span>
      <span class="g-len">${duration(len)} free</span>
      <button class="btn btn-sm btn-outline" type="button" data-action="fill">Book this</button>
    </div>`;
}

function bindGapActions(scope) {
  $$(`${scope} .gap [data-action='fill']`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const gap = btn.closest('.gap');
      openNewBooking({ date: gap.dataset.date, start: gap.dataset.start });
    });
  });
}

function shiftDay(n) {
  state.day = addDays(state.day || state.data.today, n);
  renderDay();
}

$('#dayPrev').addEventListener('click', () => shiftDay(-1));
$('#dayNext').addEventListener('click', () => shiftDay(1));
$('#dayToday').addEventListener('click', () => { state.day = state.data.today; renderDay(); });
$('#dayPick').addEventListener('change', (e) => {
  if (e.target.value) { state.day = e.target.value; renderDay(); }
});

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ bookings */

const isDead = (b) => b.status === 'cancelled' || b.status === 'expired';
const isClosed = (b) => b.status === 'completed' || b.status === 'no-show';

function apptRow(b) {
  const cls =
    isDead(b) ? 'is-cancelled'
      : b.status === 'no-show' ? 'is-noshow'
      : b.status === 'completed' ? 'is-done'
      : b.status === 'pending-payment' ? 'is-pending'
      : 'is-confirmed';

  const payPill =
    b.payment === 'cash'
      ? '<span class="pill pill-cash">Cash</span>'
      : '<span class="pill pill-card">Card</span>';

  const statusPill =
    b.status === 'cancelled' ? '<span class="pill pill-off">Cancelled</span>'
      : b.status === 'expired' ? '<span class="pill pill-off">Expired unpaid</span>'
      : b.status === 'no-show' ? '<span class="pill pill-off">Did not turn up</span>'
      : b.status === 'completed' ? '<span class="pill pill-ok">Done</span>'
      : b.status === 'pending-payment' ? '<span class="pill pill-warn">Awaiting deposit</span>'
      : '<span class="pill pill-ok">Confirmed</span>';

  const owed =
    b.priceOnRequest && b.balanceDue === 0 && b.total === 0
      ? '<span class="pill">To be quoted</span>'
      : b.balanceDue > 0
        ? `<span class="pill pill-warn">${money(b.balanceDue)} on the day</span>`
        : '<span class="pill pill-ok">Paid in full</span>';

  // Where it came from matters when the details look thin: a booking she took
  // over the phone may have no email, and that is not a data problem.
  const sourcePill = b.source === 'manual' ? '<span class="pill">Added by you</span>' : '';
  const movedPill = b.rescheduledFrom
    ? `<span class="pill">Moved from ${esc(shortDate(b.rescheduledFrom.date))} ${esc(b.rescheduledFrom.start)}</span>`
    : '';

  const active = !isDead(b) && !isClosed(b);
  const past = b.date < state.data.today;

  const contact = [b.client.phone, b.client.email || null, b.ref].filter(Boolean).map(esc).join(' · ');

  return `
    <div class="appt ${cls}" data-id="${esc(b.id)}" data-date="${esc(b.date)}">
      <div class="when">
        <div class="time">${esc(b.start)}</div>
        <div class="day">${esc(shortDate(b.date))}</div>
      </div>
      <div>
        <div class="who">${esc(b.clientName)}</div>
        <div class="what">${esc(b.serviceName)} · ${duration(b.duration)} · ends ${esc(b.end)} · ${b.priceOnRequest ? 'price on request' : money(b.total)}</div>
        <div class="what muted">${contact}</div>
        <div class="tags">${statusPill}${payPill}${owed}${sourcePill}${movedPill}</div>
      </div>
      <div class="actions">
        ${b.balanceDue > 0 && !isDead(b) ? '<button class="btn btn-sm btn-outline" data-action="mark-paid">Mark paid</button>' : ''}
        ${active && past ? '<button class="btn btn-sm btn-outline" data-action="complete">Done</button>' : ''}
        ${active && past ? '<button class="btn btn-sm btn-outline" data-action="no-show">No show</button>' : ''}
        ${active && !past ? '<button class="btn btn-sm btn-outline" data-action="move">Move</button>' : ''}
        <button class="btn btn-sm btn-outline" data-action="note">${b.adminNote ? 'Edit note' : 'Note'}</button>
        ${active && !past ? '<button class="btn btn-sm btn-danger" data-action="cancel">Cancel</button>' : ''}
        ${!active ? '<button class="btn btn-sm btn-outline" data-action="reopen">Reopen</button>' : ''}
      </div>
      ${b.client.notes ? `<div class="notes"><strong>They asked for:</strong> ${esc(b.client.notes)}</div>` : ''}
      ${b.adminNote ? `<div class="notes note-private"><strong>Your note:</strong> ${esc(b.adminNote)}</div>` : ''}
      <div class="appt-panel" hidden></div>
    </div>`;
}

/** The move-this-appointment panel, opened inside the row it belongs to. */
function movePanel(b) {
  return `
    <div class="panel-form">
      <div class="row">
        <div class="field grow">
          <label>Move to</label>
          <input class="input" type="date" data-f="date" value="${esc(b.date)}">
        </div>
        <div class="field grow">
          <label>Start at</label>
          <input class="input" type="time" step="300" data-f="start" value="${esc(b.start)}">
        </div>
      </div>
      <div class="warnbox" data-warn hidden></div>
      <div class="row">
        <button class="btn btn-sm" type="button" data-do="move-save">Move it</button>
        <button class="btn btn-sm btn-outline" type="button" data-do="close">Cancel</button>
      </div>
      <p class="msg" data-msg hidden></p>
    </div>`;
}

function notePanel(b) {
  return `
    <div class="panel-form">
      <div class="field">
        <label>Your note — the client never sees this</label>
        <textarea class="textarea" rows="3" data-f="note" placeholder="Colour formula, hair ordered, who referred them">${esc(b.adminNote || '')}</textarea>
      </div>
      <div class="row">
        <button class="btn btn-sm" type="button" data-do="note-save">Save note</button>
        <button class="btn btn-sm btn-outline" type="button" data-do="close">Cancel</button>
      </div>
      <p class="msg" data-msg hidden></p>
    </div>`;
}

function bindApptActions(scope) {
  $$(`${scope} .appt > .actions [data-action]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.appt');
      const id = row.dataset.id;
      const action = btn.dataset.action;
      const booking = state.data.bookings.find((b) => b.id === id);

      if (action === 'move' || action === 'note') {
        const panel = row.querySelector('.appt-panel');
        const already = !panel.hidden && panel.dataset.kind === action;
        panel.innerHTML = already ? '' : action === 'move' ? movePanel(booking) : notePanel(booking);
        panel.dataset.kind = already ? '' : action;
        panel.hidden = already;
        if (!already) bindPanel(panel, booking);
        return;
      }

      const confirms = {
        cancel: 'Cancel this appointment? The slot goes back on sale straight away.',
        'no-show': `Mark ${booking.clientName} as not having turned up?`,
      };
      if (confirms[action] && !confirm(confirms[action])) return;

      btn.disabled = true;
      try {
        await api(`/api/admin/bookings/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
        await refresh();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

function bindPanel(panel, booking) {
  const msg = panel.querySelector('[data-msg]');
  const close = () => { panel.hidden = true; panel.innerHTML = ''; panel.dataset.kind = ''; };
  panel.querySelector("[data-do='close']").addEventListener('click', close);

  const save = panel.querySelector("[data-do='move-save']");
  if (save) {
    save.addEventListener('click', async () => {
      const date = panel.querySelector("[data-f='date']").value;
      const start = panel.querySelector("[data-f='start']").value;
      const warn = panel.querySelector('[data-warn]');
      // The second press is the confirmation: she has now seen the warnings.
      const override = save.dataset.confirmed === 'true';
      save.disabled = true;
      try {
        await api(`/api/admin/bookings/${encodeURIComponent(booking.id)}/reschedule`, {
          method: 'POST',
          body: JSON.stringify({ date, start, override }),
        });
        await refresh();
      } catch (err) {
        save.disabled = false;
        const warnings = err.data?.warnings;
        if (warnings?.length) {
          warn.innerHTML = `<p>${warnings.map(esc).join('</p><p>')}</p>`;
          warn.hidden = false;
          save.textContent = 'Move it anyway';
          save.dataset.confirmed = 'true';
        } else {
          flash(msg, err.message, 'error');
        }
      }
    });
  }

  const noteSave = panel.querySelector("[data-do='note-save']");
  if (noteSave) {
    noteSave.addEventListener('click', async () => {
      noteSave.disabled = true;
      try {
        await api(`/api/admin/bookings/${encodeURIComponent(booking.id)}/note`, {
          method: 'POST',
          body: JSON.stringify({ note: panel.querySelector("[data-f='note']").value }),
        });
        await refresh();
      } catch (err) {
        noteSave.disabled = false;
        flash(msg, err.message, 'error');
      }
    });
  }
}

function renderBookings() {
  const filter = $('#bookingFilter').value;
  const query = $('#bookingSearch').value.trim().toLowerCase();
  const { today } = state.data;

  let list = state.data.bookings;

  if (filter === 'upcoming') list = list.filter((b) => b.date >= today && !isDead(b) && !isClosed(b));
  else if (filter === 'today') list = list.filter((b) => b.date === today);
  else if (filter === 'unpaid') list = list.filter((b) => b.balanceDue > 0 && !isDead(b));
  else if (filter === 'past') list = list.filter((b) => b.date < today && !isDead(b));
  else if (filter === 'done') list = list.filter((b) => b.status === 'completed');
  else if (filter === 'no-show') list = list.filter((b) => b.status === 'no-show');
  else if (filter === 'cancelled') list = list.filter(isDead);

  if (query) {
    list = list.filter((b) =>
      [b.clientName, b.ref, b.client.phone, b.client.email, b.serviceName, b.adminNote]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }

  // Past views read backwards: the most recent appointment is the one she is
  // most likely to be looking for, not one from eight months ago.
  const backwards = filter === 'past' || filter === 'done' || filter === 'no-show' || filter === 'cancelled';
  if (backwards) list = [...list].reverse();

  const owing = list.reduce((sum, b) => (isDead(b) ? sum : sum + b.balanceDue), 0);
  $('#bookingCount').textContent =
    `${list.length} ${list.length === 1 ? 'appointment' : 'appointments'}${owing ? ` · ${money(owing)} outstanding` : ''}`;

  $('#bookingList').innerHTML = list.length
    ? list.map(apptRow).join('')
    : '<div class="empty">No bookings match that view.</div>';
  bindApptActions('#bookingList');
}

$('#bookingFilter').addEventListener('change', renderBookings);
$('#bookingSearch').addEventListener('input', renderBookings);

/* -------------------------------------------------------- new booking */

/**
 * A booking she takes herself.
 *
 * The server will refuse a clash outright and merely warn about anything
 * else — working outside her hours, inside her notice period, on a day she
 * had blocked. Those are her decisions to make, so the first press shows her
 * what she is overriding and the second one goes ahead.
 */
function openNewBooking(prefill = {}) {
  setView('new');
  const form = $('#newBookingForm');
  form.reset();
  $('#nbWarnings').hidden = true;
  $('#nbMsg').hidden = true;
  $('#nbSubmit').textContent = 'Book it in';
  $('#nbSubmit').dataset.confirmed = '';
  $('#nbSubmit').disabled = false;

  $('#nbService').innerHTML = state.data.services
    .map((sv) => `<option value="${esc(sv.id)}">${esc(sv.name)} — ${sv.priceOnRequest ? 'on request' : money(sv.price)}</option>`)
    .join('');

  $('#nbDate').value = prefill.date || state.day || state.data.today;
  if (prefill.start) $('#nbStart').value = prefill.start;
  syncDuration();
  $('#nbName').focus();
}

function syncDuration() {
  const svc = state.data.services.find((sv) => sv.id === $('#nbService').value);
  if (svc) {
    $('#nbDuration').value = svc.duration;
    $('#nbDurationHint').textContent = `${svc.name} normally takes ${duration(svc.duration)}. Change it if this one is different.`;
  }
}

$('#nbService').addEventListener('change', syncDuration);
$('#newBookingBtn').addEventListener('click', () => openNewBooking());
$('#bookingsAdd').addEventListener('click', () => openNewBooking());
$('#nbCancel').addEventListener('click', () => setView('today'));

$('#newBookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#nbSubmit');
  const msg = $('#nbMsg');
  const warnBox = $('#nbWarnings');

  const payload = {
    serviceId: $('#nbService').value,
    date: $('#nbDate').value,
    start: $('#nbStart').value,
    duration: Number($('#nbDuration').value) || undefined,
    name: $('#nbName').value.trim(),
    phone: $('#nbPhone').value.trim(),
    email: $('#nbEmail').value.trim(),
    notes: $('#nbNotes').value.trim(),
    adminNote: $('#nbAdminNote').value.trim(),
    paid: $('#nbPaid').checked,
    override: btn.dataset.confirmed === 'true',
  };

  btn.disabled = true;
  try {
    const res = await api('/api/admin/bookings', { method: 'POST', body: JSON.stringify(payload) });
    state.day = payload.date;
    await refresh();
    setView('today');
    showBanner('Booked in', `${payload.name} — ${shortDate(payload.date)} at ${res.booking.start}`);
  } catch (err) {
    btn.disabled = false;
    const warnings = err.data?.warnings;
    if (warnings?.length) {
      warnBox.innerHTML = `<p class="warn-head">This is outside your usual setup:</p><p>${warnings.map(esc).join('</p><p>')}</p>`;
      warnBox.hidden = false;
      btn.textContent = 'Book it in anyway';
      btn.dataset.confirmed = 'true';
      warnBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      warnBox.hidden = true;
      flash(msg, err.message, 'error');
    }
  }
});

/* --------------------------------------------------------------- hours */

function renderHours() {
  const h = state.draftHours;
  $('#hoursRows').innerHTML = DAY_ORDER.map((d) => {
    const day = h[String(d)] || { open: false, start: '09:00', end: '18:00', breakStart: '', breakEnd: '' };
    return `
      <div class="hours-row ${day.open ? '' : 'is-closed'}" data-day="${d}">
        <div class="dayname">${DAY_NAMES[d]}</div>
        <label class="toggle">
          <input type="checkbox" data-f="open" ${day.open ? 'checked' : ''}>
          <span class="track" aria-hidden="true"></span>
          <span class="state">${day.open ? 'Open' : 'Closed'}</span>
        </label>
        <div class="time-fields field"><label>Start</label><input class="input" type="time" data-f="start" value="${esc(day.start || '09:00')}"></div>
        <div class="time-fields field"><label>Finish</label><input class="input" type="time" data-f="end" value="${esc(day.end || '18:00')}"></div>
        <div class="time-fields field"><label>Break from</label><input class="input" type="time" data-f="breakStart" value="${esc(day.breakStart || '')}"></div>
        <div class="time-fields field"><label>Break to</label><input class="input" type="time" data-f="breakEnd" value="${esc(day.breakEnd || '')}"></div>
      </div>`;
  }).join('');

  $$('#hoursRows [data-f]').forEach((input) => {
    input.addEventListener('change', () => {
      const row = input.closest('.hours-row');
      const day = row.dataset.day;
      const field = input.dataset.f;
      state.draftHours[day][field] = field === 'open' ? input.checked : input.value;
      if (field === 'open') {
        row.classList.toggle('is-closed', !input.checked);
        row.querySelector('.toggle .state').textContent = input.checked ? 'Open' : 'Closed';
      }
    });
  });
}

$('#hoursForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#hoursMsg');
  try {
    await api('/api/admin/hours', { method: 'PUT', body: JSON.stringify({ workingHours: state.draftHours }) });
    await refresh();
    flash(msg, 'Saved. Your client calendar has already updated.', 'ok');
  } catch (err) {
    flash(msg, err.message, 'error');
  }
});

$('#hoursReset').addEventListener('click', () => {
  state.draftHours = structuredClone(state.data.workingHours);
  renderHours();
});

/* ------------------------------------------------------------ time off */

function renderBlocked() {
  const list = state.data.blockedDates;
  $('#blockedList').innerHTML = list.length
    ? list
        .map(
          (b) => `
        <div class="blocked-row">
          <div>
            <div class="d">${esc(shortDate(b.date))} ${new Date(`${b.date}T00:00:00Z`).getUTCFullYear()}</div>
            <div class="r">${esc(b.reason)}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-unblock="${esc(b.date)}">Unblock</button>
        </div>`,
        )
        .join('')
    : '<div class="empty">No dates blocked. Your working week applies as set.</div>';

  $$('#blockedList [data-unblock]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await api(`/api/admin/blocked-dates?date=${encodeURIComponent(btn.dataset.unblock)}`, { method: 'DELETE' });
      await refresh();
    }),
  );
}

$('#blockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#blockError');
  err.hidden = true;
  try {
    await api('/api/admin/blocked-dates', {
      method: 'POST',
      body: JSON.stringify({ date: $('#bFrom').value, until: $('#bTo').value, reason: $('#bReason').value }),
    });
    $('#bFrom').value = '';
    $('#bTo').value = '';
    $('#bReason').value = '';
    await refresh();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

/* ------------------------------------------------------------ services */

function renderServices() {
  $('#serviceRows').innerHTML = state.draftServices
    .map(
      (s, i) => `
      <div class="svc-row" data-i="${i}">
        <div class="field"><label>Service name</label><input class="input" data-f="name" value="${esc(s.name)}"></div>
        <div class="field"><label>Category</label><input class="input" data-f="category" value="${esc(s.category)}"></div>
        <div class="field"><label>Minutes</label><input class="input" data-f="duration" type="number" min="15" max="600" step="15" value="${s.duration}"></div>
        <div class="field"><label>Price £</label><input class="input" data-f="price" type="number" min="0" step="5" value="${s.price}"></div>
        <div class="field"><label>Deposit £</label><input class="input" data-f="deposit" type="number" min="0" step="5" value="${s.deposit}"></div>
        <button class="svc-remove" type="button" data-remove="${i}" title="Remove this service" aria-label="Remove ${esc(s.name)}">×</button>
      </div>`,
    )
    .join('');

  $$('#serviceRows [data-f]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.closest('.svc-row').dataset.i);
      const f = input.dataset.f;
      state.draftServices[i][f] = ['duration', 'price', 'deposit'].includes(f) ? Number(input.value) : input.value;
    }),
  );

  $$('#serviceRows [data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (state.draftServices.length === 1) {
        flash($('#servicesMsg'), 'Keep at least one service on the list.', 'error');
        return;
      }
      state.draftServices.splice(Number(btn.dataset.remove), 1);
      renderServices();
    }),
  );
}

$('#serviceAdd').addEventListener('click', () => {
  state.draftServices.push({ id: '', name: 'New service', category: 'EXTENSIONS', duration: 60, price: 0, deposit: 0, blurb: '' });
  renderServices();
});

$('#servicesReset').addEventListener('click', () => {
  state.draftServices = structuredClone(state.data.services);
  renderServices();
});

$('#servicesSave').addEventListener('click', async () => {
  const msg = $('#servicesMsg');
  try {
    await api('/api/admin/services', { method: 'PUT', body: JSON.stringify({ services: state.draftServices }) });
    await refresh();
    flash(msg, 'Price list saved and live on the client site.', 'ok');
  } catch (err) {
    flash(msg, err.message, 'error');
  }
});

/* -------------------------------------------------------------- alerts */

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function loadAlerts() {
  state.alerts = await api('/api/admin/notifications');
  renderAlerts();
  await refreshPushState();
}

function renderAlerts() {
  const a = state.alerts;
  if (!a) return;

  renderDayAhead(a.dayAhead);

  $('#channelList').innerHTML = a.channels
    .map(
      (c) => `
      <div class="channel-row">
        <div>
          <div class="n">${esc(c.label)}</div>
          <div class="d">${esc(c.detail)}</div>
        </div>
        <span class="pill ${c.configured ? 'pill-ok' : ''}">${c.configured ? 'On' : 'Off'}</span>
      </div>`,
    )
    .join('');

  $('#deviceList').innerHTML = a.devices.length
    ? a.devices
        .map(
          (d) => `
        <div class="device-row">
          <div>
            <div class="n">${esc(d.label)}</div>
            <div class="d">${esc(d.host)} · added ${esc(shortDate(d.createdAt.slice(0, 10)))}${d.lastOk ? ` · last alert ${esc(shortDate(d.lastOk.slice(0, 10)))}` : ''}</div>
          </div>
          <button class="btn btn-sm btn-outline" data-forget="${esc(d.id)}">Remove</button>
        </div>`,
        )
        .join('')
    : '<div class="empty">No devices yet. Turn on alerts above.</div>';

  $$('#deviceList [data-forget]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await api('/api/admin/push/unsubscribe', { method: 'POST', body: JSON.stringify({ id: btn.dataset.forget }) });
      await loadAlerts();
    }),
  );

  $('#notifyLog').innerHTML = a.log.length
    ? a.log
        .map((n) => {
          const sent = n.channels.filter((c) => c.status === 'sent');
          const failed = n.channels.filter((c) => c.status === 'failed');
          const cls = sent.length ? 'ok' : 'none';
          const pills = [
            ...sent.map((c) => `<span class="pill pill-ok">${esc(c.name)}</span>`),
            ...failed.map((c) => `<span class="pill pill-off" title="${esc(c.detail)}">${esc(c.name)} failed</span>`),
          ].join('');
          const when = new Date(n.at);
          return `
            <div class="log-row ${cls}">
              <div class="t">${esc(n.title)}</div>
              <div class="b">${esc(n.body)}</div>
              <div class="c">${pills || '<span class="pill">nowhere to send</span>'}</div>
              <div class="d caption" style="margin-top:4px">${esc(when.toLocaleString('en-GB'))}</div>
            </div>`;
        })
        .join('')
    : '<div class="empty">Nothing sent yet. Try the test button above.</div>';
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function refreshPushState() {
  const pill = $('#pushState');
  const copy = $('#pushCopy');
  const enable = $('#pushEnable');
  const disable = $('#pushDisable');
  enable.hidden = true;
  disable.hidden = true;

  // Push is only available in a secure context. Over plain http on a real
  // domain the API is simply absent, which looks like an unsupported browser
  // rather than the deployment problem it actually is.
  if (!window.isSecureContext) {
    pill.textContent = 'Needs HTTPS';
    pill.className = 'pill pill-off';
    copy.textContent =
      'Background alerts need the site to be served over HTTPS. Ask whoever set the site up to put a certificate on it — everything else here works as normal in the meantime.';
    return;
  }

  if (!pushSupported()) {
    pill.textContent = 'Not available';
    pill.className = 'pill';
    copy.textContent =
      'This browser cannot do background alerts. On an iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there and this will work. Dashboard alerts still work whenever the page is open.';
    return;
  }

  if (Notification.permission === 'denied') {
    pill.textContent = 'Blocked';
    pill.className = 'pill pill-off';
    copy.textContent =
      'Notifications are blocked for this site in your browser settings. Allow them for this site, then reload this page.';
    return;
  }

  const sub = await currentSubscription();
  if (sub && Notification.permission === 'granted') {
    pill.textContent = 'On';
    pill.className = 'pill pill-ok';
    copy.textContent =
      'This device will alert you when a booking comes in, even with the site closed. Keep it on for your phone.';
    disable.hidden = false;
    return;
  }

  pill.textContent = 'Off';
  pill.className = 'pill pill-warn';
  copy.textContent =
    'Turn this on and your phone buzzes the moment a client books. You only need to do it once per device.';
  enable.hidden = false;
}

async function enablePush() {
  const msg = $('#pushMsg');
  const btn = $('#pushEnable');
  btn.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      flash(msg, 'You said no to notifications. Allow them for this site and try again.', 'warn');
      await refreshPushState();
      return;
    }

    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.alerts.vapidPublicKey),
      });
    }

    await api('/api/admin/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }),
    });

    await loadAlerts();
    flash(msg, 'Alerts are on for this device. Send yourself a test to be sure.', 'ok');
  } catch (err) {
    flash(msg, explainPushError(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

/** Browser push errors are terse and technical. Say what to actually do. */
function explainPushError(err) {
  const text = `${err.name || ''} ${err.message || ''}`;

  if (/permission|NotAllowed/i.test(text) && Notification.permission === 'denied') {
    return 'Your browser is blocking notifications for this site. Allow them in your browser settings, then reload and try again.';
  }
  if (/Registration failed|AbortError|push service/i.test(text)) {
    return 'Your browser could not reach its notification service — usually a network or firewall block. Try again on another network (mobile data is a good test). Dashboard alerts still work in the meantime.';
  }
  if (/applicationServerKey|InvalidAccessError/i.test(text)) {
    return 'This device was set up against different notification keys. Remove it from the device list below and turn alerts on again.';
  }
  return `Could not turn alerts on: ${err.message}`;
}

async function disablePush() {
  const msg = $('#pushMsg');
  try {
    const sub = await currentSubscription();
    if (sub) {
      await api('/api/admin/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    await loadAlerts();
    flash(msg, 'Alerts are off on this device.', 'ok');
  } catch (err) {
    flash(msg, err.message, 'error');
  }
}

/** A human label so she can tell her phone from her laptop in the device list. */
function deviceLabel() {
  const ua = navigator.userAgent;
  const kind = /iPhone|iPad|iPod/.test(ua) ? 'iPhone or iPad'
    : /Android/.test(ua) ? 'Android phone'
    : /Macintosh/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows PC'
    : 'This device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'browser';
  return `${kind} (${browser})`;
}

/**
 * The morning run-down panel.
 *
 * Whether it is switched on is a server setting, not something she can toggle
 * here, so the panel says plainly what is happening rather than showing her a
 * control that would do nothing.
 */
function renderDayAhead(d) {
  const pill = $('#dayAheadState');
  const copy = $('#dayAheadCopy');
  if (!d) return;

  if (!d.enabled) {
    pill.textContent = 'Off';
    pill.className = 'pill';
    copy.textContent =
      'You are not getting a list of the day ahead each morning. Ask for it to be switched on and say what time you want it — it is the alert most likely to catch an appointment booked weeks ago.';
    return;
  }

  const at = `${String(d.hour).padStart(2, '0')}:00`;
  const sentToday = d.sentFor === d.today;
  pill.textContent = 'On';
  pill.className = 'pill pill-ok';
  copy.textContent = sentToday
    ? `Sent this morning at around ${at}. Everything booked for today went out in one message.`
    : `Goes out each morning at around ${at}, listing everything booked for that day.`;
}

$('#dayAheadBtn').addEventListener('click', async () => {
  const btn = $('#dayAheadBtn');
  const msg = $('#dayAheadMsg');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const { notification } = await api('/api/admin/notifications/day-ahead', { method: 'POST' });
    const sent = notification.channels.filter((c) => c.status === 'sent').map((c) => c.name);
    await loadAlerts();
    flash(
      msg,
      sent.length
        ? `Sent via ${sent.join(', ')}.`
        : 'Nothing is switched on to send to yet. Turn on alerts for this device above.',
      sent.length ? 'ok' : 'warn',
    );
  } catch (err) {
    flash(msg, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Send me today's run-down";
  }
});

$('#pushEnable').addEventListener('click', enablePush);
$('#pushDisable').addEventListener('click', disablePush);

$('#testBtn').addEventListener('click', async () => {
  const btn = $('#testBtn');
  const msg = $('#pushMsg');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const { notification } = await api('/api/admin/notifications/test', { method: 'POST' });
    const sent = notification.channels.filter((c) => c.status === 'sent').map((c) => c.name);
    await loadAlerts();
    flash(
      msg,
      sent.length
        ? `Test sent via ${sent.join(', ')}. It should reach you within a few seconds.`
        : 'Nothing is switched on to send to yet. Turn on alerts for this device above.',
      sent.length ? 'ok' : 'warn',
    );
  } catch (err) {
    flash(msg, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send me a test';
  }
});

$('#alertClose').addEventListener('click', () => {
  $('#alertBanner').hidden = true;
  clearTitle();
});

$('#alertView').addEventListener('click', () => {
  $('#alertBanner').hidden = true;
  clearTitle();
  setView('today');
});

window.addEventListener('focus', clearTitle);

/* ------------------------------------------------------------ settings */

function renderSettings() {
  const r = state.data.rules;
  $('#rSlot').value = r.slotInterval;
  $('#rBuffer').value = r.bufferMins;
  $('#rLead').value = r.leadTimeHours;
  $('#rHorizon').value = r.horizonDays;
  $('#rCancel').value = r.cancellationHours;

  const card = $('#cardModeNote');
  if (state.data.cardMode === 'demo') {
    card.className = 'notice notice-warn';
    card.innerHTML =
      '<strong>Card payments are in draft mode.</strong> Clients can choose card and complete a simulated checkout, but no money moves. Add a Stripe secret key to the server to switch on real card payments — nothing else needs changing. Cash bookings work exactly as they will live.';
  } else {
    card.className = 'notice notice-ok';
    card.innerHTML = '<strong>Card payments are live via Stripe.</strong> Deposits are taken at the point of booking.';
  }

  const pw = $('#passwordNote');
  if (state.data.defaultPassword) {
    pw.className = 'notice notice-error';
    pw.innerHTML =
      '<strong>You are using the default password.</strong> Before this site goes public, set <code>ADMIN_PASSWORD</code> on the server to something only you know.';
  } else {
    pw.className = 'notice notice-ok';
    pw.textContent = 'A custom admin password is set.';
  }
}

$('#rulesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#rulesMsg');
  try {
    await api('/api/admin/rules', {
      method: 'PUT',
      body: JSON.stringify({
        slotInterval: Number($('#rSlot').value),
        bufferMins: Number($('#rBuffer').value),
        leadTimeHours: Number($('#rLead').value),
        horizonDays: Number($('#rHorizon').value),
        cancellationHours: Number($('#rCancel').value),
      }),
    });
    await refresh();
    flash(msg, 'Settings saved.', 'ok');
  } catch (err) {
    flash(msg, err.message, 'error');
  }
});

/* ---------------------------------------------------------- live feed */

function connectLive() {
  const dot = $('#adminLive');
  const source = new EventSource(`${BASE}/api/stream`);
  source.addEventListener('hello', () => {
    dot.dataset.state = 'live';
    dot.textContent = 'Live';
  });
  source.addEventListener('bookings-changed', () => refresh().catch(() => {}));
  source.addEventListener('notification', () => {
    if (state.view === 'alerts') loadAlerts().catch(() => {});
  });
  source.onerror = () => {
    dot.dataset.state = 'offline';
    dot.textContent = 'Reconnecting…';
  };
}

/* ---------------------------------------------------------------- init */

api('/api/admin/session')
  .then((s) => {
    if (s.defaultPassword) {
      $('#loginHint').textContent = 'Draft build: the password is “chrissy” until one is set on the server.';
    }
    return s.authenticated ? showApp() : showLogin();
  })
  .catch(showLogin);
