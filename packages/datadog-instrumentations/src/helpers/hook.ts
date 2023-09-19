'use strict';

import path from 'node:path';
import iitm from '../../../dd-trace/src/iitm.ts';
import ritm from '../../../dd-trace/src/ritm.ts';

/**
 * This is called for every package/internal-module that dd-trace supports instrumentation for
 * In practice, `modules` is always an array with a single entry.
 *
 * @param {string[]} modules list of modules to hook into
 * @param {Function} onrequire callback to be executed upon encountering module
 */
export default class Hook {
  constructor(
    modules: any[],
    onrequire: {
      (moduleExports: any, moduleName: any, moduleBaseDir: any, moduleVersion: any): any;
      (moduleExports: any): any;
      (moduleExports: any, moduleName: any, _: any): any;
      (arg0: any, arg1: any, arg2: any, arg3: any): any;
    },
  ) {
    if (!(this instanceof Hook)) return new Hook(modules, onrequire);

    this._patched = Object.create(null);

    const safeHook = (moduleExports: { default: any }, moduleName, moduleBaseDir, moduleVersion: undefined) => {
      const parts = [moduleBaseDir, moduleName].filter((v) => v);
      const filename = path.join(...parts);

      if (this._patched[filename]) return moduleExports;

      this._patched[filename] = true;

      return onrequire(moduleExports, moduleName, moduleBaseDir, moduleVersion);
    };

    this._ritmHook = new ritm(modules, {}, safeHook);
    this._iitmHook = iitm(modules, {}, (moduleExports: { default: any }, moduleName, moduleBaseDir) => {
      // TODO: Move this logic to import-in-the-middle and only do it for CommonJS
      // modules and not ESM. In the meantime, all the modules we instrument are
      // CommonJS modules for which the default export is always moved to
      // `default` anyway.
      if (moduleExports && moduleExports.default) {
        moduleExports.default = safeHook(moduleExports.default, moduleName, moduleBaseDir);
        return moduleExports;
      } else {
        return safeHook(moduleExports, moduleName, moduleBaseDir);
      }
    });
  }

  unhook() {
    this._ritmHook.unhook();
    this._iitmHook.unhook();
    this._patched = Object.create(null);
  }
}
