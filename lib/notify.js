// Build the body for the notification service ingest API (POST /api/v1/notification). Mirrors the
// server-side NotificationRequest validation so bad input fails fast (400) instead of a 400 round-trip.
const RECIPIENT_RE = /^[A-Za-z0-9._@:+-]{1,100}$/;
const TEMPLATE_RE = /^[a-z0-9_-]{1,100}$/;
const TYPE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const EVENTREF_RE = /^[A-Za-z0-9._:-]{1,255}$/;
const LOCALE_RE = /^[a-z]{2}(_[A-Z]{2})?$/;
const VALID_CHANNELS = ['EMAIL', 'SMS', 'ZALO_ZNS', 'PUSH', 'INAPP'];
const VALID_PRIORITIES = ['HIGH', 'BULK'];

function buildNotificationRequest({
  recipientId,
  channels = ['PUSH'],
  templateCode = 'booking_confirmed',
  type = 'BOOKING_CONFIRMED',
  locale = 'vi',
  priority = 'HIGH',
  eventRef,
  data,
} = {}) {
  if (typeof recipientId !== 'string' || !RECIPIENT_RE.test(recipientId)) {
    throw new Error('recipientId is required and must match [A-Za-z0-9._@:+-]{1,100}');
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error('channels must be a non-empty array');
  }
  for (const c of channels) {
    if (!VALID_CHANNELS.includes(c)) throw new Error(`invalid channel: ${c}`);
  }
  if (!TEMPLATE_RE.test(templateCode)) {
    throw new Error('templateCode must match [a-z0-9_-]{1,100}');
  }
  if (!TYPE_RE.test(type)) {
    throw new Error('type must match [A-Z][A-Z0-9_]{0,63}');
  }
  if (!LOCALE_RE.test(locale)) {
    throw new Error('locale must match [a-z]{2}(_[A-Z]{2})? e.g. vi or vi_VN');
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error('priority must be HIGH or BULK');
  }
  const ref = eventRef || `web-${Date.now()}`;
  if (!EVENTREF_RE.test(ref)) {
    throw new Error('eventRef must match [A-Za-z0-9._:-]{1,255}');
  }
  const body = { type, recipientId, channels, templateCode, locale, priority, eventRef: ref };
  if (data !== undefined) body.data = data;
  return body;
}

module.exports = { buildNotificationRequest, VALID_CHANNELS, VALID_PRIORITIES };
