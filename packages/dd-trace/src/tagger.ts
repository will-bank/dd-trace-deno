import log from './log/index.ts';

function add(
  carrier?: Record<string, string>,
  keyValuePairs?: string | string[] | Record<string, string>,
) {
  if (!carrier || !keyValuePairs) return;

  if (Array.isArray(keyValuePairs)) {
    keyValuePairs.forEach((tags) => add(carrier, tags));
    return;
  }

  try {
    if (typeof keyValuePairs === 'string') {
      const segments = keyValuePairs.split(',');
      for (const segment of segments) {
        const separatorIndex = segment.indexOf(':');
        if (separatorIndex === -1) continue;

        const key = segment.slice(0, separatorIndex);
        const value = segment.slice(separatorIndex + 1);

        carrier[key.trim()] = value.trim();
      }
    } else {
      Object.assign(carrier, keyValuePairs);
    }
  } catch (e) {
    log.error(e);
  }
}

export { add };
