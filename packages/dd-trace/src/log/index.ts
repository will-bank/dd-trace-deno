import { debugChannel, errorChannel, infoChannel, warnChannel } from './channels.ts';
import * as logWriter from './writer.ts';

type MessageData = string | (() => string);

const memoize = (func: { (code: any, message: any): boolean; apply?: any }) => {
  const cache = {};
  const memoized = function (key: string | number) {
    if (!cache[key]) {
      cache[key] = func.apply(this, arguments);
    }

    return cache[key];
  };

  return memoized;
};

function processMsg(msg: MessageData) {
  return typeof msg === 'function' ? msg() : msg;
}

const log = {
  use(logger) {
    logWriter.use(logger);
    return this;
  },

  toggle(enabled, logLevel) {
    logWriter.toggle(enabled, logLevel);
    return this;
  },

  reset() {
    logWriter.reset();
    this._deprecate = memoize((code, message) => {
      errorChannel.publish(message);
      return true;
    });

    return this;
  },

  debug(message: MessageData) {
    if (debugChannel.hasSubscribers) {
      debugChannel.publish(processMsg(message));
    }
    return this;
  },

  info(message: MessageData) {
    if (infoChannel.hasSubscribers) {
      infoChannel.publish(processMsg(message));
    }
    return this;
  },

  warn(message: MessageData) {
    if (warnChannel.hasSubscribers) {
      warnChannel.publish(processMsg(message));
    }
    return this;
  },

  error(err: MessageData) {
    if (errorChannel.hasSubscribers) {
      errorChannel.publish(processMsg(err));
    }
    return this;
  },

  deprecate(code, message) {
    return this._deprecate(code, message);
  },
};

log.reset();

export default log;
