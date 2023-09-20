import { DDSketch } from 'npm:@datadog/sketches-js@2.1.0';

class Histogram {
  private _min: any;
  private _max: any;
  private _sum: number;
  private _count: number;
  private _histogram: any;
  constructor() {
    this.reset();
  }


  get min() {
    return this._min;
  }

  get max() {
    return this._max;
  }

  get avg() {
    return this._count === 0 ? 0 : this._sum / this._count;
  }

  get sum() {
    return this._sum;
  }

  get count() {
    return this._count;
  }

  get median() {
    return this.percentile(50);
  }

  get p95() {
    return this.percentile(95);
  }

  percentile(percentile: number) {
    return this._histogram.getValueAtQuantile(percentile / 100) || 0;
  }

  record(value: number) {
    if (this._count === 0) {
      this._min = this._max = value;
    } else {
      this._min = Math.min(this._min, value);
      this._max = Math.max(this._max, value);
    }

    this._count++;
    this._sum += value;

    this._histogram.accept(value);
  }

  reset() {
    this._min = 0;
    this._max = 0;
    this._sum = 0;
    this._count = 0;

    this._histogram = new DDSketch();
  }
}

export default Histogram;
