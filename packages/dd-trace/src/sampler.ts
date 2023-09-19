class Sampler {
  private _rate: any;

  constructor(rate) {
    this._rate = rate;
  }

  rate() {
    return this._rate;
  }

  isSampled() {
    return this._rate === 1 || Math.random() < this._rate;
  }
}

export default Sampler;
