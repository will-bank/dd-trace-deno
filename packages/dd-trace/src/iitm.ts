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

// if (semver.satisfies(process.versions.node, '>=14.13.1')) {
//   const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart');
//   addHook((name, namespace) => {
//     if (moduleLoadStartChannel.hasSubscribers) {
//       moduleLoadStartChannel.publish({
//         filename: name,
//         module: namespace,
//       });
//     }
//   });
//   export default await import('import-in-the-middle@1.4.2');
// } else {
//   logger.warn(
//     'ESM is not fully supported by this version of Node.js, ' +
//       'so dd-trace will not intercept ESM loading.',
//   );
//   export default () => ({
//     unhook: () => {},
//   });
//   module.exports.addHook = () => {};
//   module.exports.removeHook = () => {};
// }
