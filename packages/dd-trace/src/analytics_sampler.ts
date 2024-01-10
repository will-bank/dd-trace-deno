import * as tags from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/ext/tags.js';

export function sample(
  span: {
    context: () => { (): any; new (): any; _name: string | number };
    setTag: (arg0: any, arg1: boolean) => void;
  },
  measured: { [x: string]: any },
  measuredByDefault,
) {
  if (typeof measured === 'object') {
    this.sample(span, measured[span.context()._name], measuredByDefault);
  } else if (measured !== undefined) {
    span.setTag(tags.MEASURED, !!measured);
  } else if (measuredByDefault) {
    span.setTag(tags.MEASURED, true);
  }
}
