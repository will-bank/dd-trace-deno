import { isAbsolute } from 'https://deno.land/std@0.204.0/path/is_absolute.ts';
import { join } from 'https://deno.land/std@0.204.0/path/join.ts';
import { relative } from 'https://deno.land/std@0.204.0/path/relative.ts';
import { SEP } from 'https://deno.land/std@0.204.0/path/separator.ts';
import { calculateDDBasePath } from '../../util.ts';

export { calculateDDBasePath };

const EXCLUDED_PATHS = [
  join(SEP, 'node_modules', 'diagnostics_channel'),
];
const EXCLUDED_PATH_PREFIXES = [
  'node:diagnostics_channel',
  'diagnostics_channel',
  'node:child_process',
  'child_process',
  'node:async_hooks',
  'async_hooks',
];

function getCallSiteInfo() {
  const previousPrepareStackTrace = Error.prepareStackTrace;

  const previousStackTraceLimit = Error.stackTraceLimit;
  let callsiteList;

  Error.stackTraceLimit = 100;

  Error.prepareStackTrace = function (_, callsites) {
    callsiteList = callsites;
  };
  const e = new Error();
  e.stack;

  Error.prepareStackTrace = previousPrepareStackTrace;

  Error.stackTraceLimit = previousStackTraceLimit;
  return callsiteList;
}

export function getFirstNonDDPathAndLineFromCallsites(callsites: string | any[], externallyExcludedPaths) {
  if (callsites) {
    for (let i = 0; i < callsites.length; i++) {
      const callsite = callsites[i];
      const filepath = callsite.getFileName();
      if (!isExcluded(callsite, externallyExcludedPaths) && filepath.indexOf(pathLine.ddBasePath) === -1) {
        return {
          path: relative(Deno.cwd(), filepath),
          line: callsite.getLineNumber(),
          column: callsite.getColumnNumber(),
          isInternal: !isAbsolute(filepath),
        };
      }
    }
  }
  return null;
}

function isExcluded(callsite: { isNative: () => any; getFileName: () => any }, externallyExcludedPaths) {
  if (callsite.isNative()) return true;
  const filename = callsite.getFileName();
  if (!filename) {
    return true;
  }
  let excludedPaths = EXCLUDED_PATHS;
  if (externallyExcludedPaths) {
    excludedPaths = [...excludedPaths, ...externallyExcludedPaths];
  }

  for (let i = 0; i < excludedPaths.length; i++) {
    if (filename.indexOf(excludedPaths[i]) > -1) {
      return true;
    }
  }

  for (let i = 0; i < EXCLUDED_PATH_PREFIXES.length; i++) {
    if (filename.indexOf(EXCLUDED_PATH_PREFIXES[i]) === 0) {
      return true;
    }
  }

  return false;
}

export function getFirstNonDDPathAndLine(externallyExcludedPaths: void) {
  return getFirstNonDDPathAndLineFromCallsites(getCallSiteInfo(), externallyExcludedPaths);
}

export function getNodeModulesPaths(...paths) {
  const nodeModulesPaths = [];

  paths.forEach((p) => {
    const pathParts = p.split('/');
    nodeModulesPaths.push(join('node_modules', ...pathParts));
  });

  return nodeModulesPaths;
}

export const ddBasePath = calculateDDBasePath(new URL('.', import.meta.url).pathname);
