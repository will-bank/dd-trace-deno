import Module from 'node:module';
import shimmer from '../../../../../datadog-shimmer.ts';
import iastLog from './iast-log.ts';
import { isNotLibraryFile, isPrivateModule } from './filter.ts';
import { csiMethods } from './csi-methods.ts';
import { getName } from '../telemetry/verbosity.ts';
import { getRewriteFunction } from './rewriter-telemetry.ts';

let rewriter;
let getPrepareStackTrace;

let getRewriterOriginalPathAndLineFromSourceMap = function (path, line, column) {
  return { path, line, column };
};

function isFlagPresent(flag: string) {
  return Deno.env.get('NODE_OPTIONS')?.includes(flag) ||
    process.execArgv?.some((arg: { includes: (arg0: any) => any }) => arg.includes(flag));
}

function getGetOriginalPathAndLineFromSourceMapFunction(
  chainSourceMap,
  getOriginalPathAndLineFromSourceMap: (arg0: any, arg1: any, arg2: any) => any,
) {
  if (chainSourceMap) {

    return function (path, line, column) {
      // if --enable-source-maps is present stacktraces of the rewritten files contain the original path, file and
      // column because the sourcemap chaining is done during the rewriting process so we can skip it
      if (isPrivateModule(path) && isNotLibraryFile(path)) {
        return { path, line, column };
      } else {
        return getOriginalPathAndLineFromSourceMap(path, line, column);
      }
    };
  } else {
    return getOriginalPathAndLineFromSourceMap;
  }
}

function getRewriter(telemetryVerbosity) {

  if (!rewriter) {
    try {
      const iastRewriter = await import('@datadog/native-iast-rewriter');
      const Rewriter = iastRewriter.Rewriter;
      getPrepareStackTrace = iastRewriter.getPrepareStackTrace;

      const chainSourceMap = isFlagPresent('--enable-source-maps');
      const getOriginalPathAndLineFromSourceMap = iastRewriter.getOriginalPathAndLineFromSourceMap;
      if (getOriginalPathAndLineFromSourceMap) {
        getRewriterOriginalPathAndLineFromSourceMap = getGetOriginalPathAndLineFromSourceMapFunction(
          chainSourceMap,
          getOriginalPathAndLineFromSourceMap,
        );
      }

      rewriter = new Rewriter({ csiMethods, telemetryVerbosity: getName(telemetryVerbosity), chainSourceMap });
    } catch (e) {
      iastLog.error('Unable to initialize TaintTracking Rewriter')
        .errorAndPublish(e);
    }
  }

  return rewriter;
}

let originalPrepareStackTrace = Error.prepareStackTrace;
function getPrepareStackTraceAccessor() {

  let actual = getPrepareStackTrace(originalPrepareStackTrace);
  return {
    configurable: true,
    get() {
      return actual;
    },

    set(value) {

      actual = getPrepareStackTrace(value);
      originalPrepareStackTrace = value;
    },
  };
}

function getCompileMethodFn(compileMethod: { apply: (arg0: any, arg1: any[]) => any }) {

  const rewriteFn = getRewriteFunction(rewriter);

  return function (content, filename) {
    try {
      if (isPrivateModule(filename) && isNotLibraryFile(filename)) {
        const rewritten = rewriteFn(content, filename);
        if (rewritten && rewritten.content) {
          return compileMethod.apply(this, [rewritten.content, filename]);
        }
      }
    } catch (e) {
      iastLog.error(`Error rewriting ${filename}`)
        .errorAndPublish(e);
    }
    return compileMethod.apply(this, [content, filename]);
  };
}

function enableRewriter(telemetryVerbosity) {
  try {
    const rewriter = getRewriter(telemetryVerbosity);
    if (rewriter) {

      const pstDescriptor = Object.getOwnPropertyDescriptor(global.Error, 'prepareStackTrace');
      if (!pstDescriptor || pstDescriptor.configurable) {

        Object.defineProperty(global.Error, 'prepareStackTrace', getPrepareStackTraceAccessor());
      }
      shimmer.wrap(
        Module.prototype,
        '_compile',
        (compileMethod: { apply: (arg0: any, arg1: any[]) => any }) => getCompileMethodFn(compileMethod),
      );
    }
  } catch (e) {
    iastLog.error('Error enabling TaintTracking Rewriter')
      .errorAndPublish(e);
  }
}

function disableRewriter() {
  shimmer.unwrap(Module.prototype, '_compile');

  Error.prepareStackTrace = originalPrepareStackTrace;
}

function getOriginalPathAndLineFromSourceMap({ path, line, column }) {
  return getRewriterOriginalPathAndLineFromSourceMap(path, line, column);
}

export { disableRewriter, enableRewriter, getOriginalPathAndLineFromSourceMap };
