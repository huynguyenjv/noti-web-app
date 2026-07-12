const PLATFORMS = ['WEB', 'ANDROID', 'IOS'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Build the body for the notification service POST /api/v1/devices. userId is accepted here (test
// mode) because this demo has no IAM/JWT; in production userId comes from the JWT instead.
function buildDeviceRegistration({ userId, token, platform = 'WEB' } = {}) {
  if (!isNonEmptyString(userId)) throw new Error('userId is required');
  if (!isNonEmptyString(token)) throw new Error('token is required');
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`platform must be one of: ${PLATFORMS.join(', ')}`);
  }
  return { platform, token, userId };
}

module.exports = { buildDeviceRegistration, PLATFORMS };
