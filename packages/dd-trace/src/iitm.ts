import * as importInTheMiddle from 'https://esm.sh/import-in-the-middle@1.4.2';
import dc from 'node:diagnostics_channel';

const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart');

importInTheMiddle.addHook((name, namespace) => {
  if (moduleLoadStartChannel.hasSubscribers) {
    moduleLoadStartChannel.publish({
      filename: name,
      module: namespace,
    });
  }
});

export const addHook = importInTheMiddle.addHook;
export const removeHook = importInTheMiddle.removeHook;

export default importInTheMiddle.default;
