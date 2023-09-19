const { createCoverageMap } = require('istanbul-lib-coverage');

const { addHook, channel, AsyncResource } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';
const log = require('../../dd-trace/src/log');

const {

  getCoveredFilenamesFromCoverage,

  resetCoverage,

  mergeCoverage,

  getTestSuitePath,

  fromCoverageMapToCoverage,

  getCallSites,

} = require('../../dd-trace/src/plugins/util/test');

const testStartCh = dc.channel('ci:mocha:test:start');
const errorCh = dc.channel('ci:mocha:test:error');
const skipCh = dc.channel('ci:mocha:test:skip');
const testFinishCh = dc.channel('ci:mocha:test:finish');
const parameterizedTestCh = dc.channel('ci:mocha:test:parameterize');

const itrConfigurationCh = dc.channel('ci:mocha:itr-configuration');
const skippableSuitesCh = dc.channel('ci:mocha:test-suite:skippable');

const testSessionStartCh = dc.channel('ci:mocha:session:start');
const testSessionFinishCh = dc.channel('ci:mocha:session:finish');

const testSuiteStartCh = dc.channel('ci:mocha:test-suite:start');
const testSuiteFinishCh = dc.channel('ci:mocha:test-suite:finish');
const testSuiteErrorCh = dc.channel('ci:mocha:test-suite:error');
const testSuiteCodeCoverageCh = dc.channel('ci:mocha:test-suite:code-coverage');

const itrSkippedSuitesCh = dc.channel('ci:mocha:itr:skipped-suites');

// TODO: remove when root hooks and fixtures are implemented
const patched = new WeakSet();

const testToAr = new WeakMap();
const originalFns = new WeakMap();
const testFileToSuiteAr = new Map();
const testToStartLine = new WeakMap();

// `isWorker` is true if it's a Mocha worker
let isWorker = false;

// We'll preserve the original coverage here
const originalCoverageMap = createCoverageMap();

let suitesToSkip = [];
let frameworkVersion;
let isSuitesSkipped = false;
let skippedSuites = [];

function getSuitesByTestFile(root: { file: string | number; suites: any[] }) {
  const suitesByTestFile = {};
  function getSuites(suite: { file: string | number; suites: any[] }) {
    if (suite.file) {

      if (suitesByTestFile[suite.file]) {

        suitesByTestFile[suite.file].push(suite);
      } else {

        suitesByTestFile[suite.file] = [suite];
      }
    }
    suite.suites.forEach((suite) => {
      getSuites(suite);
    });
  }
  getSuites(root);

  const numSuitesByTestFile = Object.keys(suitesByTestFile).reduce((acc, testFile) => {

    acc[testFile] = suitesByTestFile[testFile].length;
    return acc;
  }, {});

  return { suitesByTestFile, numSuitesByTestFile };
}

function getTestStatus(test: { isPending: () => any; isFailed: () => any; timedOut: any }) {
  if (test.isPending()) {
    return 'skip';
  }
  if (test.isFailed() || test.timedOut) {
    return 'fail';
  }
  return 'pass';
}

function isRetry(test: { _currentRetry: number }) {
  return test._currentRetry !== undefined && test._currentRetry !== 0;
}

function getTestAsyncResource(test: { fn: { asyncResource: any } }) {
  if (!test.fn) {
    return testToAr.get(test);
  }
  if (!test.fn.asyncResource) {
    return testToAr.get(test.fn);
  }
  const originalFn = originalFns.get(test.fn);
  return testToAr.get(originalFn);
}

function getFilteredSuites(originalSuites: any[]) {
  return originalSuites.reduce(
    (acc: { skippedSuites: { add: (arg0: any) => void }; suitesToRun: any[] }, suite: { file: any }) => {
      const testPath = getTestSuitePath(suite.file, Deno.cwd());

      const shouldSkip = suitesToSkip.includes(testPath);
      if (shouldSkip) {
        acc.skippedSuites.add(testPath);
      } else {
        acc.suitesToRun.push(suite);
      }
      return acc;

    },
    { suitesToRun: [], skippedSuites: new Set() },
  );
}

function mochaHook(Runner: { prototype: any }) {
  if (patched.has(Runner)) return Runner;

  patched.add(Runner);

  shimmer.wrap(Runner.prototype, 'run', (run: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function () {
      if (!testStartCh.hasSubscribers || isWorker) {
        return run.apply(this, arguments);
      }

      const { suitesByTestFile, numSuitesByTestFile } = getSuitesByTestFile(this.suite);

      const testRunAsyncResource = new AsyncResource('bound-anonymous-fn');

      this.once(
        'end',
        testRunAsyncResource.bind(function () {
          let status = 'pass';
          if (this.stats) {
            status = this.stats.failures === 0 ? 'pass' : 'fail';
          } else if (this.failures !== 0) {
            status = 'fail';
          }
          testFileToSuiteAr.clear();

          let testCodeCoverageLinesTotal;

          if (global.__coverage__) {
            try {
              testCodeCoverageLinesTotal = originalCoverageMap.getCoverageSummary().lines.pct;
            } catch (e) {
              // ignore errors
            }
            // restore the original coverage

            global.__coverage__ = fromCoverageMapToCoverage(originalCoverageMap);
          }

          testSessionFinishCh.publish({
            status,
            isSuitesSkipped,
            testCodeCoverageLinesTotal,
            numSkippedSuites: skippedSuites.length,
          });
        }),
      );

      this.once(
        'start',
        testRunAsyncResource.bind(function () {
          const processArgv = Deno.args.join(' ');
          const command = `mocha ${processArgv}`;

          testSessionStartCh.publish({ command, frameworkVersion });
          if (skippedSuites.length) {

            itrSkippedSuitesCh.publish({ skippedSuites, frameworkVersion });
          }
        }),
      );

      this.on('suite', function (suite: { root: any; tests: string | any[]; file: any }) {
        if (suite.root || !suite.tests.length) {
          return;
        }
        let asyncResource = testFileToSuiteAr.get(suite.file);
        if (!asyncResource) {
          asyncResource = new AsyncResource('bound-anonymous-fn');
          testFileToSuiteAr.set(suite.file, asyncResource);
          asyncResource.runInAsyncScope(() => {
            testSuiteStartCh.publish(suite);
          });
        }
      });

      this.on('suite end', function (suite: { root: any; file: string | number }) {
        if (suite.root) {
          return;
        }

        const suitesInTestFile = suitesByTestFile[suite.file];


        const isLastSuite = --numSuitesByTestFile[suite.file] === 0;
        if (!isLastSuite) {
          return;
        }

        let status = 'pass';
        if (suitesInTestFile.every((suite: { pending: any }) => suite.pending)) {
          status = 'skip';
        } else {
          // has to check every test in the test file
          suitesInTestFile.forEach((suite: { eachTest: (arg0: (test: any) => void) => void }) => {
            suite.eachTest((test: { state: string; timedOut: any }) => {
              if (test.state === 'failed' || test.timedOut) {
                status = 'fail';
              }
            });
          });
        }


        if (global.__coverage__) {

          const coverageFiles = getCoveredFilenamesFromCoverage(global.__coverage__);

          testSuiteCodeCoverageCh.publish({
            coverageFiles,
            suiteFile: suite.file,
          });
          // We need to reset coverage to get a code coverage per suite
          // Before that, we preserve the original coverage

          mergeCoverage(global.__coverage__, originalCoverageMap);

          resetCoverage(global.__coverage__);
        }

        const asyncResource = testFileToSuiteAr.get(suite.file);
        asyncResource.runInAsyncScope(() => {
          testSuiteFinishCh.publish(status);
        });
      });

      this.on('test', (test: { fn: any }) => {

        if (isRetry(test)) {
          return;
        }
        const testStartLine = testToStartLine.get(test);
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        testToAr.set(test.fn, asyncResource);
        asyncResource.runInAsyncScope(() => {
          testStartCh.publish({ test, testStartLine });
        });
      });

      this.on('test end', (test: { parent: { _afterEach: string | any[] } }) => {

        const asyncResource = getTestAsyncResource(test);

        const status = getTestStatus(test);

        // if there are afterEach to be run, we don't finish the test yet
        if (asyncResource && !test.parent._afterEach.length) {
          asyncResource.runInAsyncScope(() => {
            testFinishCh.publish(status);
          });
        }
      });

      // If the hook passes, 'hook end' will be emitted. Otherwise, 'fail' will be emitted
      this.on(
        'hook end',
        (
          hook: {
            ctx: { currentTest: any };
            parent: { _afterEach: { includes: (arg0: any) => any; indexOf: (arg0: any) => number; length: number } };
          },
        ) => {
          const test = hook.ctx.currentTest;
          if (test && hook.parent._afterEach.includes(hook)) { // only if it's an afterEach
            const isLastAfterEach = hook.parent._afterEach.indexOf(hook) === hook.parent._afterEach.length - 1;
            if (isLastAfterEach) {
              const status = getTestStatus(test);
              const asyncResource = getTestAsyncResource(test);
              asyncResource.runInAsyncScope(() => {
                testFinishCh.publish(status);
              });
            }
          }
        },
      );

      this.on(
        'fail',
        (
          testOrHook: {
            file: any;
            type: string;
            ctx: { currentTest: any };
            fullTitle: () => any;
            parent: { fullTitle: () => any };
          },
          err: { message: string; stack: string },
        ) => {
          const testFile = testOrHook.file;
          let test = testOrHook;
          const isHook = testOrHook.type === 'hook';
          if (isHook && testOrHook.ctx) {
            test = testOrHook.ctx.currentTest;
          }
          let testAsyncResource;
          if (test) {

            testAsyncResource = getTestAsyncResource(test);
          }
          if (testAsyncResource) {
            testAsyncResource.runInAsyncScope(() => {
              if (isHook) {
                err.message = `${testOrHook.fullTitle()}: ${err.message}`;
                errorCh.publish(err);
                // if it's a hook and it has failed, 'test end' will not be called
                testFinishCh.publish('fail');
              } else {
                errorCh.publish(err);
              }
            });
          }
          const testSuiteAsyncResource = testFileToSuiteAr.get(testFile);

          if (testSuiteAsyncResource) {
            // we propagate the error to the suite
            const testSuiteError = new Error(
              `"${testOrHook.parent.fullTitle()}" failed with message "${err.message}"`,
            );
            testSuiteError.stack = err.stack;
            testSuiteAsyncResource.runInAsyncScope(() => {
              testSuiteErrorCh.publish(testSuiteError);
            });
          }
        },
      );

      this.on('pending', (test: { fn: any }) => {
        const asyncResource = getTestAsyncResource(test);
        if (asyncResource) {
          asyncResource.runInAsyncScope(() => {
            skipCh.publish(test);
          });
        } else {
          // if there is no async resource, the test has been skipped through `test.skip`
          // or the parent suite is skipped
          const skippedTestAsyncResource = new AsyncResource('bound-anonymous-fn');
          if (test.fn) {
            testToAr.set(test.fn, skippedTestAsyncResource);
          } else {
            testToAr.set(test, skippedTestAsyncResource);
          }
          skippedTestAsyncResource.runInAsyncScope(() => {
            skipCh.publish(test);
          });
        }
      });

      return run.apply(this, arguments);
    });

  return Runner;
}

function mochaEachHook(mochaEach: { apply: (arg0: any, arg1: IArguments) => { [x: string]: any; it: any } }) {
  if (patched.has(mochaEach)) return mochaEach;

  patched.add(mochaEach);

  return shimmer.wrap(mochaEach, function () {

    const [params] = arguments;
    const { it, ...rest } = mochaEach.apply(this, arguments);
    return {

      it: function (name) {
        parameterizedTestCh.publish({ name, params });
        it.apply(this, arguments);
      },
      ...rest,
    };
  });
}

addHook({
  name: 'mocha',
  versions: ['>=5.2.0'],
  file: 'lib/mocha.js',

}, (Mocha: { prototype: any }, mochaVersion) => {
  frameworkVersion = mochaVersion;
  const mochaRunAsyncResource = new AsyncResource('bound-anonymous-fn');
  /**
   * Get ITR configuration and skippable suites
   * If ITR is disabled, `onDone` is called immediately on the subscriber
   */
  shimmer.wrap(Mocha.prototype, 'run', (run: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function () {
      if (this.options.parallel) {
        log.warn(`Unable to initialize CI Visibility because Mocha is running in parallel mode.`);
        return run.apply(this, arguments);
      }

      if (!itrConfigurationCh.hasSubscribers || this.isWorker) {
        if (this.isWorker) {
          isWorker = true;
        }
        return run.apply(this, arguments);
      }
      this.options.delay = true;

      const runner = run.apply(this, arguments);


      const onReceivedSkippableSuites = ({ err, skippableSuites }) => {
        if (err) {
          suitesToSkip = [];
        } else {
          suitesToSkip = skippableSuites;
        }
        // We remove the suites that we skip through ITR
        const filteredSuites = getFilteredSuites(runner.suite.suites);
        const { suitesToRun } = filteredSuites;

        isSuitesSkipped = suitesToRun.length !== runner.suite.suites.length;
        runner.suite.suites = suitesToRun;


        skippedSuites = Array.from(filteredSuites.skippedSuites);


        global.run();
      };


      const onReceivedConfiguration = ({ err }) => {
        if (err) {

          return global.run();
        }
        if (!skippableSuitesCh.hasSubscribers) {

          return global.run();
        }

        skippableSuitesCh.publish({
          onDone: mochaRunAsyncResource.bind(onReceivedSkippableSuites),
        });
      };

      mochaRunAsyncResource.runInAsyncScope(() => {
        itrConfigurationCh.publish({
          onDone: mochaRunAsyncResource.bind(onReceivedConfiguration),
        });
      });
      return runner;
    });
  return Mocha;
});

addHook({
  name: 'mocha',
  versions: ['>=5.2.0'],
  file: 'lib/suite.js',
}, (Suite: { prototype: any }) => {
  shimmer.wrap(
    Suite.prototype,
    'addTest',
    (addTest: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (test: { file: any }) {
        const callSites = getCallSites();
        let startLine;
        const testCallSite = callSites.find((site: { getFileName: () => any }) => site.getFileName() === test.file);
        if (testCallSite) {
          startLine = testCallSite.getLineNumber();
          testToStartLine.set(test, startLine);
        }
        return addTest.apply(this, arguments);
      },
  );
  return Suite;
});

addHook({
  name: 'mocha',
  versions: ['>=5.2.0'],
  file: 'lib/runner.js',
}, mochaHook);

addHook({
  name: 'mocha',
  versions: ['>=5.2.0'],
  file: 'lib/cli/run-helpers.js',

}, (run) => {
  shimmer.wrap(run, 'runMocha', (runMocha: { apply: (arg0: any, arg1: IArguments) => any }) =>
    async function () {
      if (!testStartCh.hasSubscribers) {

        return runMocha.apply(this, arguments);
      }

      const mocha = arguments[0];
      /**
       * This attaches `run` to the global context, which we'll call after
       * our configuration and skippable suites requests
       */
      if (!mocha.options.parallel) {
        mocha.options.delay = true;
      }

      return runMocha.apply(this, arguments);
    });
  return run;
});

addHook({
  name: 'mocha',
  versions: ['>=5.2.0'],
  file: 'lib/runnable.js',
}, (Runnable: { prototype: any }) => {
  shimmer.wrap(Runnable.prototype, 'run', (run: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function () {
      if (!testStartCh.hasSubscribers) {
        return run.apply(this, arguments);
      }
      const isBeforeEach = this.parent._beforeEach.includes(this);
      const isAfterEach = this.parent._afterEach.includes(this);

      const isTestHook = isBeforeEach || isAfterEach;

      // we restore the original user defined function
      if (this.fn.asyncResource) {
        const originalFn = originalFns.get(this.fn);
        this.fn = originalFn;
      }

      if (isTestHook || this.type === 'test') {
        const test = isTestHook ? this.ctx.currentTest : this;
        const asyncResource = getTestAsyncResource(test);

        if (asyncResource) {
          // we bind the test fn to the correct async resource
          const newFn = asyncResource.bind(this.fn);

          // we store the original function, not to lose it
          originalFns.set(newFn, this.fn);
          this.fn = newFn;

          // Temporarily keep functionality when .asyncResource is removed from node
          // in https://github.com/nodejs/node/pull/46432
          if (!this.fn.asyncResource) {
            this.fn.asyncResource = asyncResource;
          }
        }
      }

      return run.apply(this, arguments);
    });
  return Runnable;
});

addHook({
  name: 'mocha-each',
  versions: ['>=2.0.1'],
}, mochaEachHook);
