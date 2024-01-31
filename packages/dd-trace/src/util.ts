import { SEP } from 'https://deno.land/std@0.204.0/path/separator.ts';

export function isTrue(str: string | boolean) {
  if (typeof str === 'boolean') {
    return str;
  }

  str = String(str).toLowerCase();
  return str === 'true' || str === '1';
}

export function isFalse(str: string | boolean) {
  if (typeof str === 'boolean') {
    return !str;
  }

  str = String(str).toLowerCase();
  return str === 'false' || str === '0';
}

export function isError(value: { message: any }) {
  if (value instanceof Error) {
    return true;
  }
  if (value && value.message) {
    return true;
  }
  return false;
}

// Matches a glob pattern to a given subject string
export function globMatch(pattern: string | any[], subject: string | any[]) {
  let px = 0; // [p]attern inde[x]
  let sx = 0; // [s]ubject inde[x]
  let nextPx = 0;
  let nextSx = 0;
  while (px < pattern.length || sx < subject.length) {
    if (px < pattern.length) {
      const c = pattern[px];
      switch (c) {
        default: // ordinary character
          if (sx < subject.length && subject[sx] === c) {
            px++;
            sx++;
            continue;
          }
          break;
        case '?':
          if (sx < subject.length) {
            px++;
            sx++;
            continue;
          }
          break;
        case '*':
          nextPx = px;
          nextSx = sx + 1;
          px++;
          continue;
      }
    }
    if (nextSx > 0 && nextSx <= subject.length) {
      px = nextPx;
      sx = nextSx;
      continue;
    }
    return false;
  }
  return true;
}

export function calculateDDBasePath(dirname: string) {
  const dirSteps = dirname.split(SEP);
  const packagesIndex = dirSteps.lastIndexOf('packages');
  return dirSteps.slice(0, packagesIndex + 1).join(SEP) + SEP;
}
