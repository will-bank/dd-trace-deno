import dc from 'npm:dd-trace@4.13.1/packages/diagnostics_channel/index.js';
import logCollector from './log-collector.ts';
import { sendData } from '../../../../telemetry/send-data.ts';
import log from '../../../../log/index.ts';

const telemetryStartChannel = dc.channel('datadog:telemetry:start');
const telemetryStopChannel = dc.channel('datadog:telemetry:stop');

let config, application, host, interval;

function publish(log: { level: any }) {
  if (log && isLevelEnabled(log.level)) {
    logCollector.add(log);
  }
}

function sendLogs() {
  try {
    const logs = logCollector.drain();
    if (logs) {

      sendData(config, application, host, 'logs', logs);
    }
  } catch (e) {
    log.error(e);
  }
}

function isLevelEnabled(level: string) {

  return isLogCollectionEnabled(config) && level !== 'DEBUG';
}

function isLogCollectionEnabled(config: { telemetry: { logCollection: any } }) {
  return config && config.telemetry && config.telemetry.logCollection;
}

function onTelemetryStart(msg: { config: any; application: any; host: any; heartbeatInterval: number }) {
  if (!msg || !isLogCollectionEnabled(msg.config)) {
    log.info(
      'IAST telemetry logs start event received but log collection is not enabled or configuration is incorrect',
    );
    return false;
  }

  log.info('IAST telemetry logs starting');

  config = msg.config;
  application = msg.application;
  host = msg.host;

  if (msg.heartbeatInterval) {
    interval = setInterval(sendLogs, msg.heartbeatInterval);

    interval.unref();
  }

  return true;
}

function onTelemetryStop() {
  stop();
}

function start() {
  telemetryStartChannel.subscribe(onTelemetryStart);
  telemetryStopChannel.subscribe(onTelemetryStop);
}

function stop() {

  if (!isLogCollectionEnabled(config)) return;

  log.info('IAST telemetry logs stopping');

  config = null;
  application = null;
  host = null;

  if (telemetryStartChannel.hasSubscribers) {
    telemetryStartChannel.unsubscribe(onTelemetryStart);
  }

  if (telemetryStopChannel.hasSubscribers) {
    telemetryStopChannel.unsubscribe(onTelemetryStop);
  }


  clearInterval(interval);
}

export { isLevelEnabled, publish, start, stop };
