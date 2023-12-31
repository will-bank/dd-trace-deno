import log from '../../log/index.ts';

const TRACE_PREFIX = '{"traces":[[';
const TRACE_SUFFIX = ']]}\n';
const TRACE_FORMAT_OVERHEAD = TRACE_PREFIX.length + TRACE_SUFFIX.length;
const MAX_SIZE = 64 * 1024; // 64kb

class LogExporter {
  export(spans) {
    log.debug(() => `Adding trace to queue: ${JSON.stringify(spans)}`);

    let size = TRACE_FORMAT_OVERHEAD;
    let queue: string[] = [];

    for (const span of spans) {
      const spanStr = JSON.stringify(span);
      if (spanStr.length + TRACE_FORMAT_OVERHEAD > MAX_SIZE) {
        log.debug('Span too large to send to logs, dropping');
        continue;
      }
      if (spanStr.length + size > MAX_SIZE) {
        this._printSpans(queue);
        queue = [];
        size = TRACE_FORMAT_OVERHEAD;
      }
      size += spanStr.length + 1; // includes length of ',' character
      queue.push(spanStr);
    }
    if (queue.length > 0) {
      this._printSpans(queue);
    }
  }

  _printSpans(queue: string[]) {
    let logLine = TRACE_PREFIX;
    let firstTrace = true;
    for (const spanStr of queue) {
      if (firstTrace) {
        firstTrace = false;
        logLine += spanStr;
      } else {
        logLine += ',' + spanStr;
      }
    }
    logLine += TRACE_SUFFIX;
    Deno.stdout.writeSync(new TextEncoder().encode(logLine));
  }
}

export default LogExporter;
