import log from './log/index.ts';

function add(
  carrier: { [x: string]: string },
  keyValuePairs: { forEach: (arg0: (tags: any) => void) => any; split: (arg0: string) => any },
) {
  if (!carrier || !keyValuePairs) return;

  if (Array.isArray(keyValuePairs)) {
    return keyValuePairs.forEach((tags) => add(carrier, tags));
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
