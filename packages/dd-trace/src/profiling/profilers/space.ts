import { oomExportStrategies } from '../constants.ts';

function strategiesToCallbackMode(strategies: { includes: (arg0: string) => any }, callbackMode: { Async: any }) {
  return strategies.includes(oomExportStrategies.ASYNC_CALLBACK) ? callbackMode.Async : 0;
}

class NativeSpaceProfiler {
  type: string;
  private _samplingInterval: any;
  private _stackDepth: any;
  private _pprof: any;
  private _oomMonitoring: any;
  private _mapper: any;
  constructor(options = {}) {
    this.type = 'space';

    this._samplingInterval = options.samplingInterval || 512 * 1024;

    this._stackDepth = options.stackDepth || 64;
    this._pprof = undefined;

    this._oomMonitoring = options.oomMonitoring || {};
  }


  start({ mapper, nearOOMCallback } = {}) {
    this._mapper = mapper;
    this._pprof = await import('@datadog/pprof');
    this._pprof.heap.start(this._samplingInterval, this._stackDepth);
    if (this._oomMonitoring.enabled) {
      const strategies = this._oomMonitoring.exportStrategies;
      this._pprof.heap.monitorOutOfMemory(
        this._oomMonitoring.heapLimitExtensionSize,
        this._oomMonitoring.maxHeapExtensionCount,
        strategies.includes(oomExportStrategies.LOGS),
        strategies.includes(oomExportStrategies.PROCESS) ? this._oomMonitoring.exportCommand : [],

        (profile) => nearOOMCallback(this.type, this._pprof.encodeSync(profile)),
        strategiesToCallbackMode(strategies, this._pprof.heap.CallbackMode),
      );
    }
  }

  profile() {
    return this._pprof.heap.profile(undefined, this._mapper);
  }


  encode(profile) {
    return this._pprof.encode(profile);
  }

  stop() {
    this._pprof.heap.stop();
  }
}

export default NativeSpaceProfiler;
