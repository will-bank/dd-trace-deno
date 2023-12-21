class Scheduler {
  private _timer: any;
  private _callback: any;
  private _interval: any;
  constructor(callback: (cb: any) => void, interval: number) {
    this._timer = null;
    this._callback = callback;
    this._interval = interval;
  }

  start() {
    if (this._timer) return;

    this.runAfterDelay(0);
  }

  runAfterDelay(interval = this._interval) {
    this._timer = setTimeout(this._callback, interval, () => this.runAfterDelay());

    Deno.unrefTimer(this._timer);
  }

  stop() {
    clearTimeout(this._timer);

    this._timer = null;
  }
}

export default Scheduler;
