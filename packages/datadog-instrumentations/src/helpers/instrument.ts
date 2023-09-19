'use strict';

import dc from 'npm:dd-trace/packages/diagnostics_channel/index.js';
import instrumentations from './instrumentations.ts';
import { AsyncResource } from 'node:async_hooks';

const channelMap = {};
export function channel(name: string | number) {
  const maybe = channelMap[name];
  if (maybe) return maybe;
  const ch = dc.channel(name);
  channelMap[name] = ch;
  return ch;
};

/**
 * @param {string} args.name module name
 * @param {string[]} args.versions array of semver range strings
 * @param {string} args.file path to file within package to instrument?
 * @param Function hook
 */
export function addHook({ name, versions, file }: { name: string; versions?: string; file?: string; }, hook) {
  if (!instrumentations[name]) {
    instrumentations[name] = [];
  }

  instrumentations[name].push({ name, versions, file, hook });
}

export { AsyncResource };

// export default class extends AsyncResource {
//   static bind(fn: { name: any }, type, thisArg) {
//     type = type || fn.name;
//     return (new exports.AsyncResource(type || 'bound-anonymous-fn')).bind(fn, thisArg);
//   }

//   bind(fn: string | any[], thisArg) {
//     let bound;
//     if (thisArg === undefined) {
//       const resource = this;
//       bound = function (...args) {
//         args.unshift(fn, this);
//         return Reflect.apply(resource.runInAsyncScope, resource, args);
//       };
//     } else {
//       bound = this.runInAsyncScope.bind(this, fn, thisArg);
//     }
//     Object.defineProperties(bound, {
//       'length': {
//         configurable: true,
//         enumerable: false,
//         value: fn.length,
//         writable: false,
//       },
//       'asyncResource': {
//         configurable: true,
//         enumerable: true,
//         value: this,
//         writable: true,
//       },
//     });
//     return bound;
//   }
// };
