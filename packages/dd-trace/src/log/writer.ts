import { storage } from '../../../datadog-core/index.ts';
import { debugChannel, errorChannel, getChannelLogLevel, infoChannel, warnChannel } from './channels.ts';

const defaultLogger = {

  debug: (msg) => console.debug(msg), /* eslint-disable-line no-console */

  info: (msg) => console.info(msg), /* eslint-disable-line no-console */

  warn: (msg) => console.warn(msg), /* eslint-disable-line no-console */

  error: (msg) => console.error(msg), /* eslint-disable-line no-console */
};

let enabled = false;
let logger = defaultLogger;
let logLevel = getChannelLogLevel();

function withNoop(fn: { (): any; (): any; (): any; (): any; (): void }) {
  const store = storage.getStore();

  storage.enterWith({ noop: true });
  fn();
  storage.enterWith(store);
}

function unsubscribeAll() {
  if (debugChannel.hasSubscribers) {
    debugChannel.unsubscribe(onDebug);
  }
  if (infoChannel.hasSubscribers) {
    infoChannel.unsubscribe(onInfo);
  }
  if (warnChannel.hasSubscribers) {
    warnChannel.unsubscribe(onWarn);
  }
  if (errorChannel.hasSubscribers) {
    errorChannel.unsubscribe(onError);
  }
}

function toggleSubscription(enable: boolean) {
  unsubscribeAll();

  if (enable) {
    if (debugChannel.logLevel >= logLevel) {
      debugChannel.subscribe(onDebug);
    }
    if (infoChannel.logLevel >= logLevel) {
      infoChannel.subscribe(onInfo);
    }
    if (warnChannel.logLevel >= logLevel) {
      warnChannel.subscribe(onWarn);
    }
    if (errorChannel.logLevel >= logLevel) {
      errorChannel.subscribe(onError);
    }
  }
}

function toggle(enable: boolean, level) {
  if (level !== undefined) {
    logLevel = getChannelLogLevel(level);
  }
  enabled = enable;
  toggleSubscription(enabled);
}

function use(newLogger: { debug: any; error: any }) {
  if (newLogger && newLogger.debug instanceof Function && newLogger.error instanceof Function) {

    logger = newLogger;
  }
}

function reset() {

  logger = defaultLogger;
  enabled = false;
  logLevel = getChannelLogLevel();
  toggleSubscription(false);
}

function onError(err: string | Error) {
  if (enabled) error(err);
}

function onWarn(message) {
  if (enabled) warn(message);
}

function onInfo(message) {
  if (enabled) info(message);
}

function onDebug(message) {
  if (enabled) debug(message);
}

function error(err: string | Error) {
  if (typeof err !== 'object' || !err) {
    err = String(err);
  } else if (!err.stack) {
    err = String(err.message || err);
  }

  if (typeof err === 'string') {
    err = new Error(err);
  }

  withNoop(() => logger.error(err));
}

function warn(message) {
  if (!logger.warn) return debug(message);
  withNoop(() => logger.warn(message));
}

function info(message) {
  if (!logger.info) return debug(message);
  withNoop(() => logger.info(message));
}

function debug(message) {
  withNoop(() => logger.debug(message));
}

export { debug, error, info, reset, toggle, use, warn };
