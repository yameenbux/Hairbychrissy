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

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login')) {
    showLogin();
    throw new Error('Session expired — please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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
}

async function showApp() {
  $('#loginView').hidden = true;
  $('#app').hidden = false;
  $('#adminNav').hidden = false;
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
      const n = new Notification(title, { body, icon: '/icon-192.png', tag: `hbc-${booking.ref}` });
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

  const upcoming = live.filter((b) => b.date >= today).slice(0, 12);
  $('#upcomingList').innerHTML = upcoming.length
    ? upcoming.map(apptRow).join('')
    : '<div class="empty">Nothing booked yet. Slots are open on the client site.</div>';
  bindApptActions('#upcomingList');
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ bookings */

function apptRow(b) {
  const cls =
    b.status === 'cancelled' || b.status === 'expired' ? 'is-cancelled'
      : b.status === 'pending-payment' ? 'is-pending'
      : 'is-confirmed';

  const payPill =
    b.payment === 'cash'
      ? '<span class="pill pill-cash">Cash</span>'
      : '<span class="pill pill-card">Card</span>';

  const statusPill =
    b.status === 'cancelled' ? '<span class="pill pill-off">Cancelled</span>'
      : b.status === 'expired' ? '<span class="pill pill-off">Expired unpaid</span>'
      : b.status === 'pending-payment' ? '<span class="pill pill-warn">Awaiting deposit</span>'
      : '<span class="pill pill-ok">Confirmed</span>';

  const owed =
    b.balanceDue > 0
      ? `<span class="pill">${money(b.balanceDue)} on the day</span>`
      : '<span class="pill pill-ok">Paid in full</span>';

  const active = b.status !== 'cancelled' && b.status !== 'expired';

  return `
    <div class="appt ${cls}" data-id="${esc(b.id)}">
      <div class="when">
        <div class="time">${esc(b.start)}</div>
        <div class="day">${esc(shortDate(b.date))}</div>
      </div>
      <div>
        <div class="who">${esc(b.clientName)}</div>
        <div class="what">${esc(b.serviceName)} · ${duration(b.duration)} · ends ${esc(b.end)} · ${money(b.total)}</div>
        <div class="what muted">${esc(b.client.phone)} · ${esc(b.client.email)} · ${esc(b.ref)}</div>
        <div class="tags">${statusPill}${payPill}${owed}</div>
      </div>
      <div class="actions">
        ${b.balanceDue > 0 && active ? '<button class="btn btn-sm btn-ghost" data-action="mark-paid">Mark paid</button>' : ''}
        ${active ? '<button class="btn btn-sm btn-danger" data-action="cancel">Cancel</button>' : ''}
      </div>
      ${b.client.notes ? `<div class="notes"><strong class="white">Client notes:</strong> ${esc(b.client.notes)}</div>` : ''}
    </div>`;
}

function bindApptActions(scope) {
  $$(`${scope} .appt [data-action]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.appt').dataset.id;
      const action = btn.dataset.action;
      if (action === 'cancel' && !confirm('Cancel this appointment? The slot goes back on sale straight away.')) return;
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

function renderBookings() {
  const filter = $('#bookingFilter').value;
  const query = $('#bookingSearch').value.trim().toLowerCase();
  const { today } = state.data;

  let list = state.data.bookings;
  const dead = (b) => b.status === 'cancelled' || b.status === 'expired';

  if (filter === 'upcoming') list = list.filter((b) => b.date >= today && !dead(b));
  else if (filter === 'today') list = list.filter((b) => b.date === today);
  else if (filter === 'past') list = list.filter((b) => b.date < today && !dead(b));
  else if (filter === 'cancelled') list = list.filter(dead);

  if (query) {
    list = list.filter((b) =>
      [b.clientName, b.ref, b.client.phone, b.client.email, b.serviceName]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }

  $('#bookingList').innerHTML = list.length
    ? list.map(apptRow).join('')
    : '<div class="empty">No bookings match that view.</div>';
  bindApptActions('#bookingList');
}

$('#bookingFilter').addEventListener('change', renderBookings);
$('#bookingSearch').addEventListener('input', renderBookings);

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
          <button class="btn btn-sm btn-ghost" data-unblock="${esc(b.date)}">Unblock</button>
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
          <button class="btn btn-sm btn-ghost" data-forget="${esc(d.id)}">Remove</button>
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

    const reg = await navigator.serviceWorker.register('/sw.js');
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
  const source = new EventSource('/api/stream');
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
