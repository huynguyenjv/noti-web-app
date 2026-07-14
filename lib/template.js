// Build the body for the notification service template API (POST /api/v1/templates). Mirrors the
// server-side TemplateRequest validation so bad input fails fast.
const CODE_RE = /^[a-z0-9_-]{1,100}$/;
const LOCALE_RE = /^[a-z]{2}(_[A-Z]{2})?$/;
const PROVIDER_RE = /^[A-Za-z0-9._:-]{0,255}$/;
const VALID_CHANNELS = ['EMAIL', 'SMS', 'ZALO_ZNS', 'PUSH', 'INAPP'];
const LIFECYCLE_ACTIONS = ['submit', 'approve', 'select', 'deprecate'];

function buildTemplateRequest({ code, channel, locale, subject, body, providerTemplateRef } = {}) {
  if (!CODE_RE.test(code || '')) throw new Error('code must match [a-z0-9_-]{1,100}');
  if (!VALID_CHANNELS.includes(channel)) throw new Error(`channel must be one of: ${VALID_CHANNELS.join(', ')}`);
  if (locale && !LOCALE_RE.test(locale)) throw new Error('locale must match [a-z]{2}(_[A-Z]{2})?');
  if (typeof body !== 'string' || !body.trim()) throw new Error('body is required');
  if (body.length > 20000) throw new Error('body too long (max 20000)');
  if (subject && subject.length > 255) throw new Error('subject too long (max 255)');
  if (channel === 'EMAIL' && !(subject && subject.trim())) {
    throw new Error('EMAIL template needs a subject');
  }
  if (channel === 'ZALO_ZNS' && !(providerTemplateRef && providerTemplateRef.trim())) {
    throw new Error('ZALO_ZNS template needs a providerTemplateRef');
  }
  if (providerTemplateRef && !PROVIDER_RE.test(providerTemplateRef)) {
    throw new Error('providerTemplateRef must match [A-Za-z0-9._:-]{0,255}');
  }
  const req = { code, channel, body };
  if (locale) req.locale = locale;
  if (subject) req.subject = subject;
  if (providerTemplateRef) req.providerTemplateRef = providerTemplateRef;
  return req;
}

module.exports = { buildTemplateRequest, VALID_CHANNELS, LIFECYCLE_ACTIONS };
