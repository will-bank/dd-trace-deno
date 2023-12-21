import log from '../../log/index.ts';
import * as telemetryLogs from './telemetry/log/index.ts';
import { calculateDDBasePath } from '../../util.ts';

const ddBasePath = calculateDDBasePath(new URL('.', import.meta.url).pathname);
const EOL = '\n';
const STACK_FRAME_LINE_REGEX = /^\s*at\s/gm;

function sanitize(logEntry: { message: any; level?: any; stack_trace?: any }, stack: string) {
  if (!stack) return logEntry;

  let stackLines = stack.split(EOL);


  const firstIndex = stackLines.findIndex((l: string) => l.match(STACK_FRAME_LINE_REGEX));


  const isDDCode = firstIndex > -1 && stackLines[firstIndex].includes(ddBasePath);
  stackLines = stackLines

    .filter((line: { includes: (arg0: any) => any }, index: number) =>
      (isDDCode && index < firstIndex) || line.includes(ddBasePath)
    )
    .map((line: string) => line.replace(ddBasePath, ''));

  logEntry.stack_trace = stackLines.join(EOL);

  if (!isDDCode) {
    logEntry.message = 'omitted';
  }

  return logEntry;
}

function getTelemetryLog(data: { (): any; (): any; message: any; stack: any }, level) {
  try {
    data = typeof data === 'function' ? data() : data;

    let message;
    if (typeof data !== 'object' || !data) {
      message = String(data);
    } else {

      message = String(data.message || data);
    }

    let logEntry = {
      message,
      level,
    };

    if (data.stack) {

      logEntry = sanitize(logEntry, data.stack);

      if (logEntry.stack_trace === '') {
        return;
      }
    }

    return logEntry;
  } catch (e) {
    log.error(e);
  }
}

const iastLog = {

  debug(data) {
    log.debug(data);
    return this;
  },


  info(data) {
    log.info(data);
    return this;
  },


  warn(data) {
    log.warn(data);
    return this;
  },


  error(data) {
    log.error(data);
    return this;
  },


  publish(data: { (): any; (): any; message: any; stack: any }, level) {
    if (telemetryLogs.isLevelEnabled(level)) {
      const telemetryLog = getTelemetryLog(data, level);
      telemetryLogs.publish(telemetryLog);
    }
    return this;
  },


  debugAndPublish(data) {
    this.debug(data);
    return this.publish(data, 'DEBUG');
  },


  infoAndPublish(data) {
    this.info(data);
    return this.publish(data, 'DEBUG');
  },


  warnAndPublish(data) {
    this.warn(data);
    return this.publish(data, 'WARN');
  },


  errorAndPublish(data) {
    this.error(data);
    return this.publish(data, 'ERROR');
  },
};

export default iastLog;
