import log from './log/index.ts';
import { format } from './format.ts';
import SpanSampler from './span_sampler.ts';
import GitMetadataTagger from './git_metadata_tagger.ts';

import { SpanStatsProcessor } from './span_stats.ts';

const startedSpans = new WeakSet();
const finishedSpans = new WeakSet();

class SpanProcessor {
  private _exporter: any;
  private _prioritySampler: any;
  private _config: any;
  private _killAll: boolean;
  private _stats: SpanStatsProcessor;
  private _spanSampler: SpanSampler;
  private _gitMetadataTagger: any;
  constructor(
    exporter,
    prioritySampler: PrioritySampler,
    config: {
      experimental?: { exporter: any; enableGetRumData: any };
      service?: any;
      version?: any;
      env?: any;
      tags?: any;
      spanComputePeerService?: any;
      peerServiceMapping?: any;
      logInjection?: boolean;
      debug?: any;
      sampler?: any;
      traceId128BitGenerationEnabled?: any;
      reportHostname?: any;
      stats?: any;
      hostname?: any;
      port?: any;
      url?: any;
    },
  ) {
    this._exporter = exporter;
    this._prioritySampler = prioritySampler;
    this._config = config;
    this._killAll = false;

    this._stats = new SpanStatsProcessor(config);
    this._spanSampler = new SpanSampler(config.sampler);
    this._gitMetadataTagger = new GitMetadataTagger(config);
  }

  process(span: { context: () => any }) {
    const spanContext = span.context();
    const active: any[] = [];
    const formatted = [];
    const trace = spanContext._trace;
    const { flushMinSpans } = this._config;
    const { started, finished } = trace;

    if (trace.record === false) return;
    if (started.length === finished.length || finished.length >= flushMinSpans) {
      this._prioritySampler.sample(spanContext);
      this._spanSampler.sample(spanContext);
      this._gitMetadataTagger.tagGitMetadata(spanContext);

      for (const span of started) {
        if (span._duration !== undefined) {
          const formattedSpan = format(span);
          this._stats.onSpanFinished(formattedSpan);
          formatted.push(formattedSpan);
        } else {
          active.push(span);
        }
      }

      if (formatted.length !== 0 && trace.isRecording !== false) {
        this._exporter.export(formatted);
      }

      this._erase(trace, active);
    }

    if (this._killAll) {
      started.map((startedSpan: { _finished: any; finish: () => void }) => {
        if (!startedSpan._finished) {
          startedSpan.finish();
        }
      });
    }
  }

  killAll() {
    this._killAll = true;
  }

  _erase(trace: { finished: any[]; started: any }, active: any[]) {
    if (Deno.env.get('DD_TRACE_EXPERIMENTAL_STATE_TRACKING') === 'true') {
      const started = new Set();
      const startedIds = new Set();
      const finished = new Set();
      const finishedIds = new Set();

      for (const span of trace.finished) {
        const context = span.context();
        const id = context.toSpanId();

        if (finished.has(span)) {
          log.error(`Span was already finished in the same trace: ${span}`);
        } else {
          finished.add(span);

          if (finishedIds.has(id)) {
            log.error(`Another span with the same ID was already finished in the same trace: ${span}`);
          } else {
            finishedIds.add(id);
          }

          if (context._trace !== trace) {
            log.error(`A span was finished in the wrong trace: ${span}.`);
          }

          if (finishedSpans.has(span)) {
            log.error(`Span was already finished in a different trace: ${span}`);
          } else {
            finishedSpans.add(span);
          }
        }
      }

      for (const span of trace.started) {
        const context = span.context();
        const id = context.toSpanId();

        if (started.has(span)) {
          log.error(`Span was already started in the same trace: ${span}`);
        } else {
          started.add(span);

          if (startedIds.has(id)) {
            log.error(`Another span with the same ID was already started in the same trace: ${span}`);
          } else {
            startedIds.add(id);
          }

          if (context._trace !== trace) {
            log.error(`A span was started in the wrong trace: ${span}.`);
          }

          if (startedSpans.has(span)) {
            log.error(`Span was already started in a different trace: ${span}`);
          } else {
            startedSpans.add(span);
          }
        }

        if (!finished.has(span)) {
          log.error(`Span started in one trace but was finished in another trace: ${span}`);
        }
      }

      for (const span of trace.finished) {
        if (!started.has(span)) {
          log.error(`Span finished in one trace but was started in another trace: ${span}`);
        }
      }
    }

    trace.started = active;
    trace.finished = [];
  }
}

export default SpanProcessor;
