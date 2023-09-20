'use strict';

import dc from 'npm:dd-trace@4.13.1/packages/diagnostics_channel/index.js';
import path from 'node:path';
import semver from 'npm:semver@7.5.4';
import Hook from './hook.ts';
import requirePackageJson from '../../../dd-trace/src/require-package-json.ts';
import log from '../../../dd-trace/src/log/index.ts';

const DD_TRACE_DISABLED_INSTRUMENTATIONS = Deno.env.get('DD_TRACE_DISABLED_INSTRUMENTATIONS') || '';

import * as hooks from './hooks.ts';
import * as instrumentations from './instrumentations.ts';
const names = Object.keys(hooks);
const pathSepExpr = new RegExp(`\\${path.sep}`, 'g');
const disabledInstrumentations = new Set(
  DD_TRACE_DISABLED_INSTRUMENTATIONS ? DD_TRACE_DISABLED_INSTRUMENTATIONS.split(',') : [],
);

const loadChannel = dc.channel('dd-trace:instrumentation:load');

// Globals
if (!disabledInstrumentations.has('fetch')) {
  await import('../fetch.ts');
}

// TODO: make this more efficient

for (const packageName of names) {
  if (disabledInstrumentations.has(packageName)) continue;


  new Hook([packageName], (moduleExports, moduleName: string, moduleBaseDir, moduleVersion) => {
    moduleName = moduleName.replace(pathSepExpr, '/');

    // This executes the integration file thus adding its entries to `instrumentations`
    hooks[packageName]();

    if (!instrumentations[packageName]) {
      return moduleExports;
    }

    for (const { name, file, versions, hook } of instrumentations[packageName]) {
      const fullFilename = filename(name, file);

      if (moduleName === fullFilename) {
        const version = moduleVersion || getVersion(moduleBaseDir);

        if (matchVersion(version, versions)) {
          try {
            loadChannel.publish({ name, version, file });

            moduleExports = hook(moduleExports, version);
          } catch (e) {
            log.error(e);
          }
        }
      }
    }

    return moduleExports;
  });
}

function matchVersion(version, ranges: any[]) {
  return !version || (ranges && ranges.some((range) => semver.satisfies(semver.coerce(version), range)));
}

function getVersion(moduleBaseDir) {
  if (moduleBaseDir) {

    return requirePackageJson(moduleBaseDir, module).version;
  }
}

function filename(name, file) {
  return [name, file].filter((val) => val).join('/');
}

export {
  filename,
  pathSepExpr,
  loadChannel,
  matchVersion,
};
