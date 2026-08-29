/**
 * Availability engine.
 *
 * A slot is offered only when ALL of these hold:
 *   - the weekday is marked open in Chrissy's working hours
 *   - the date is not blocked off (holiday, personal day)
 *   - the whole appointment fits inside opening hours
 *   - it does not overlap her lunch/break window
 *   - it does not overlap an existing booking, once the clean-down buffer
 *     is applied to both sides
 *   - it is far enough ahead of "now" to respect the lead time
 *   - it is inside the booking horizon
 */
import { read } from './store.js';
import { toMinutes, weekdayOf, nowIn, daysBetween, toHHMM } from './time.js';

export function getService(serviceId) {
  return read().services.find((s) => s.id === serviceId) || null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** Bookings that still hold a slot on the given date. */
export function activeBookingsOn(dateStr) {
  return read().bookings.filter(
    (b) => b.date === dateStr && b.status !== 'cancelled' && b.status !== 'expired',
  );
}

export function isBlocked(dateStr) {
  return read().blockedDates.some((b) => b.date === dateStr);
}

/**
 * Why a date can't be booked at all, or null if it can.
 * Returned to the client so the calendar can explain itself.
 */
export function dateClosedReason(dateStr) {
  const db = read();
  const { rules } = db;
  const now = nowIn(rules.timezone);
  const delta = daysBetween(now.date, dateStr);

  if (delta < 0) return 'past';
  if (delta > rules.horizonDays) return 'horizon';
  if (isBlocked(dateStr)) return 'blocked';
  const hours = db.workingHours[String(weekdayOf(dateStr))];
  if (!hours || !hours.open) return 'closed';
  return null;
}

/**
 * All bookable start times on a date for a given service.
 * Returns [{ start: '09:00', end: '13:00', startMin, endMin }].
 */
export function slotsFor(dateStr, serviceId) {
  const db = read();
  const service = getService(serviceId);
  if (!service) return [];

  const reason = dateClosedReason(dateStr);
  if (reason) return [];

  const { rules } = db;
  const hours = db.workingHours[String(weekdayOf(dateStr))];
  const open = toMinutes(hours.start);
  const close = toMinutes(hours.end);
  if (open == null || close == null || close <= open) return [];

  const breakStart = toMinutes(hours.breakStart);
  const breakEnd = toMinutes(hours.breakEnd);
  const hasBreak = breakStart != null && breakEnd != null && breakEnd > breakStart;

  const now = nowIn(rules.timezone);
  const isToday = dateStr === now.date;
  const earliest = isToday ? now.minutes + rules.leadTimeHours * 60 : -Infinity;
  // A lead time longer than a day also pushes tomorrow (and beyond) forward.
  const daysAhead = daysBetween(now.date, dateStr);
  const leadCutoff = now.minutes + rules.leadTimeHours * 60 - daysAhead * 1440;

  const taken = activeBookingsOn(dateStr).map((b) => ({
    start: b.startMin - rules.bufferMins,
    end: b.endMin + rules.bufferMins,
  }));

  const out = [];
  for (let start = open; start + service.duration <= close; start += rules.slotInterval) {
    const end = start + service.duration;
    if (start < leadCutoff) continue;
    if (isToday && start < earliest) continue;
    if (hasBreak && overlaps(start, end, breakStart, breakEnd)) continue;
    if (taken.some((t) => overlaps(start, end, t.start, t.end))) continue;
    out.push({ start: toHHMM(start), end: toHHMM(end), startMin: start, endMin: end });
  }
  return out;
}

/**
 * Per-day summary for a whole month, used to paint the calendar grid.
 * month is 'YYYY-MM'.
 */
export function monthSummary(month, serviceId) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const reason = dateClosedReason(dateStr);
    const slots = reason ? [] : slotsFor(dateStr, serviceId);
    days.push({
      date: dateStr,
      day,
      weekday: weekdayOf(dateStr),
      reason,
      count: slots.length,
      first: slots[0]?.start || null,
    });
  }
  return { month, days };
}

/**
 * Final server-side check before a booking is written. The client's slot list
 * may be seconds out of date, so this is the only check that actually counts.
 */
export function validateSlot(dateStr, startTime, serviceId) {
  const service = getService(serviceId);
  if (!service) return { ok: false, error: 'That service is no longer offered.' };

  const reason = dateClosedReason(dateStr);
  if (reason === 'past') return { ok: false, error: 'That date has already passed.' };
  if (reason === 'horizon') return { ok: false, error: 'That date is too far ahead to book yet.' };
  if (reason === 'blocked') return { ok: false, error: 'Chrissy is not taking appointments on that date.' };
  if (reason === 'closed') return { ok: false, error: 'The studio is closed on that day.' };

  const match = slotsFor(dateStr, serviceId).find((s) => s.start === startTime);
  if (!match) return { ok: false, error: 'That time has just been taken. Please pick another slot.' };

  return { ok: true, service, startMin: match.startMin, endMin: match.endMin };
}
