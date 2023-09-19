'use strict';

import dc from 'node:diagnostics_channel';

import {
  filename,
  loadChannel,
  matchVersion,
} from './register.ts';
import * as hooks from './hooks.ts';
import * as instrumentations from './instrumentations.ts';
import log from '../../../dd-trace/src/log/index.ts';

const CHANNEL = 'dd-trace:bundler:load';

if (!dc.subscribe) {
  dc.subscribe = (channel, cb) => {
    dc.channel(channel).subscribe(cb);
  };
}
if (!dc.unsubscribe) {
  dc.unsubscribe = (channel, cb) => {
    if (dc.channel(channel).hasSubscribers) {
      dc.channel(channel).unsubscribe(cb);
    }
  };
}

dc.subscribe(CHANNEL, (payload: { package: string | number; path: string; version: any; module: any }) => {
  try {
    hooks[payload.package]();
  } catch (err) {
    log.error(`esbuild-wrapped ${payload.package} missing in list of hooks`);
    throw err;
  }

  if (!instrumentations[payload.package]) {
    log.error(`esbuild-wrapped ${payload.package} missing in list of instrumentations`);
    return;
  }

  for (const { name, file, versions, hook } of instrumentations[payload.package]) {
    if (payload.path !== filename(name, file)) continue;
    if (!matchVersion(payload.version, versions)) continue;

    try {
      loadChannel.publish({ name, version: payload.version, file });
      payload.module = hook(payload.module, payload.version);
    } catch (e) {
      log.error(e);
    }
  }
});
