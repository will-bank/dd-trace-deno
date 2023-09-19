'use strict';

const {

  channel,

  addHook,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const childProcessChannel = dc.channel('datadog:child_process:execution:start');
const execMethods = ['exec', 'execFile', 'fork', 'spawn', 'execFileSync', 'execSync', 'spawnSync'];
const names = ['child_process', 'node:child_process'];
names.forEach((name) => {

  addHook({ name }, (childProcess) => {
    shimmer.massWrap(childProcess, execMethods, wrapChildProcessMethod());
    return childProcess;
  });
});

function wrapChildProcessMethod() {
  function wrapMethod(childProcessMethod: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function () {
      if (childProcessChannel.hasSubscribers && arguments.length > 0) {
        const command = arguments[0];
        childProcessChannel.publish({ command });
      }
      return childProcessMethod.apply(this, arguments);
    };
  }
  return wrapMethod;
}
