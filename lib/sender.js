function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function buildMessage({ target, notification, data } = {}) {
  if (!target || !['token', 'topic'].includes(target.type)) {
    throw new Error('Invalid target: type must be "token" or "topic"');
  }
  if (!isNonEmptyString(target.value)) {
    throw new Error('Invalid target: value is required');
  }
  if (!notification || !isNonEmptyString(notification.title)) {
    throw new Error('notification.title is required');
  }
  if (!isNonEmptyString(notification.body)) {
    throw new Error('notification.body is required');
  }

  const message = {
    notification: { title: notification.title, body: notification.body },
  };
  if (target.type === 'token') message.token = target.value;
  else message.topic = target.value;

  if (data !== undefined) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('data must be an object of string keys to string values');
    }
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') {
        throw new Error(`data value for "${k}" must be a string`);
      }
    }
    if (Object.keys(data).length > 0) message.data = data;
  }

  return message;
}

module.exports = { buildMessage };
