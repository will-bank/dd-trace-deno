/* eslint-disable no-console */

// https://en.wikipedia.org/wiki/Syslog#Severity_level
const mapping = {
  error: 3,
  warn: 4,
  info: 6,
  debug: 7,
};

class ConsoleLogger {
  private _level: any;
  constructor(options = {}) {

    this._level = mapping[options.level] || mapping['error'];
  }


  debug(message) {
    this._log('debug', message);
  }


  info(message) {
    this._log('info', message);
  }


  warn(message) {
    this._log('warn', message);
  }


  error(message) {
    this._log('error', message);
  }


  _log(level: string, message) {

    if (mapping[level] > this._level) return;


    console[level](message);
  }
}

export { ConsoleLogger };
