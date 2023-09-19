class Scope {
  private _span: any;
  private _finishSpanOnClose: any;

  constructor(span, finishSpanOnClose) {
    this._span = span;
    this._finishSpanOnClose = finishSpanOnClose;
    this.close();
  }

  span() {
    return this._span;
  }

  close() {
    if (this._finishSpanOnClose) {
      this._span.finish();
    }
  }
}

export default Scope;
