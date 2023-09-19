const { addHook, channel, AsyncResource } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const testStartCh = dc.channel('ci:playwright:test:start');
const testFinishCh = dc.channel('ci:playwright:test:finish');

const testSessionStartCh = dc.channel('ci:playwright:session:start');
const testSessionFinishCh = dc.channel('ci:playwright:session:finish');

const testSuiteStartCh = dc.channel('ci:playwright:test-suite:start');
const testSuiteFinishCh = dc.channel('ci:playwright:test-suite:finish');

const testToAr = new WeakMap();
const testSuiteToAr = new Map();
const testSuiteToTestStatuses = new Map();

let startedSuites: any[] = [];

const STATUS_TO_TEST_STATUS = {
  passed: 'pass',
  failed: 'fail',
  timedOut: 'fail',
  skipped: 'skip',
};

let remainingTestsByFile = {};

function getTestsBySuiteFromTestGroups(testGroups: any[]) {
  return testGroups.reduce((acc: { [x: string]: any }, { requireFile, tests }) => {
    if (acc[requireFile]) {
      acc[requireFile] = acc[requireFile].concat(tests);
    } else {
      acc[requireFile] = tests;
    }
    return acc;
  }, {});
}

function getTestsBySuiteFromTestsById(testsById: { values: () => any }) {
  const testsByTestSuite = {};
  for (const { test } of testsById.values()) {
    const { _requireFile } = test;
    if (test._type === 'beforeAll' || test._type === 'afterAll') {
      continue;
    }

    if (testsByTestSuite[_requireFile]) {

      testsByTestSuite[_requireFile].push(test);
    } else {

      testsByTestSuite[_requireFile] = [test];
    }
  }
  return testsByTestSuite;
}

function getPlaywrightConfig(
  playwrightRunner: { _configLoader: { fullConfig: () => any }; _loader: { fullConfig: () => any }; _config: any },
) {
  try {
    return playwrightRunner._configLoader.fullConfig();
  } catch (e) {
    try {
      return playwrightRunner._loader.fullConfig();
    } catch (e) {
      return playwrightRunner._config || {};
    }
  }
}

function getRootDir(playwrightRunner: { _configDir: any; _config: { config: { rootDir: any } } }) {

  const config = getPlaywrightConfig(playwrightRunner);
  if (config.rootDir) {
    return config.rootDir;
  }
  if (playwrightRunner._configDir) {
    return playwrightRunner._configDir;
  }
  if (playwrightRunner._config && playwrightRunner._config.config) {
    return playwrightRunner._config.config.rootDir;
  }
  return Deno.cwd();
}

function testBeginHandler(test: { _requireFile: any; title: any; _type: any; location: { line: any } }) {
  const { _requireFile: testSuiteAbsolutePath, title: testName, _type, location: { line: testSourceLine } } = test;

  if (_type === 'beforeAll' || _type === 'afterAll') {
    return;
  }


  const isNewTestSuite = !startedSuites.includes(testSuiteAbsolutePath);

  if (isNewTestSuite) {
    startedSuites.push(testSuiteAbsolutePath);
    const testSuiteAsyncResource = new AsyncResource('bound-anonymous-fn');
    testSuiteToAr.set(testSuiteAbsolutePath, testSuiteAsyncResource);
    testSuiteAsyncResource.runInAsyncScope(() => {
      testSuiteStartCh.publish(testSuiteAbsolutePath);
    });
  }

  const testAsyncResource = new AsyncResource('bound-anonymous-fn');
  testToAr.set(test, testAsyncResource);
  testAsyncResource.runInAsyncScope(() => {
    testStartCh.publish({ testName, testSuiteAbsolutePath, testSourceLine });
  });
}

function testEndHandler(test: { _requireFile: any; results: any; _type: any }, testStatus: string, error: undefined) {
  const { _requireFile: testSuiteAbsolutePath, results, _type } = test;

  if (_type === 'beforeAll' || _type === 'afterAll') {
    return;
  }

  const testResult = results[results.length - 1];
  const testAsyncResource = testToAr.get(test);
  testAsyncResource.runInAsyncScope(() => {
    testFinishCh.publish({ testStatus, steps: testResult.steps, error });
  });

  if (!testSuiteToTestStatuses.has(testSuiteAbsolutePath)) {
    testSuiteToTestStatuses.set(testSuiteAbsolutePath, [testStatus]);
  } else {
    testSuiteToTestStatuses.get(testSuiteAbsolutePath).push(testStatus);
  }


  remainingTestsByFile[testSuiteAbsolutePath] = remainingTestsByFile[testSuiteAbsolutePath]
    .filter((currentTest: { _requireFile: any; results: any; _type: any }) => currentTest !== test);


  if (!remainingTestsByFile[testSuiteAbsolutePath].length) {
    const testStatuses = testSuiteToTestStatuses.get(testSuiteAbsolutePath);

    let testSuiteStatus = 'pass';
    if (testStatuses.some((status: string) => status === 'fail')) {
      testSuiteStatus = 'fail';
    } else if (testStatuses.every((status: string) => status === 'skip')) {
      testSuiteStatus = 'skip';
    }

    const testSuiteAsyncResource = testSuiteToAr.get(testSuiteAbsolutePath);
    testSuiteAsyncResource.runInAsyncScope(() => {
      testSuiteFinishCh.publish(testSuiteStatus);
    });
  }
}

function dispatcherRunWrapper(run: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    remainingTestsByFile = getTestsBySuiteFromTestsById(this._testById);
    return run.apply(this, arguments);
  };
}

function dispatcherRunWrapperNew(run: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    remainingTestsByFile = getTestsBySuiteFromTestGroups(arguments[0]);
    return run.apply(this, arguments);
  };
}

function dispatcherHook(dispatcherExport: { Dispatcher: { prototype: any } }) {
  shimmer.wrap(dispatcherExport.Dispatcher.prototype, 'run', dispatcherRunWrapper);
  shimmer.wrap(
    dispatcherExport.Dispatcher.prototype,
    '_createWorker',
    (createWorker: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function () {
        const dispatcher = this;
        const worker = createWorker.apply(this, arguments);


        worker.process.on('message', ({ method, params }) => {
          if (method === 'testBegin') {
            const { test } = dispatcher._testById.get(params.testId);
            testBeginHandler(test);
          } else if (method === 'testEnd') {
            const { test } = dispatcher._testById.get(params.testId);

            const { results } = test;
            const testResult = results[results.length - 1];


            testEndHandler(test, STATUS_TO_TEST_STATUS[testResult.status], testResult.error);
          }
        });

        return worker;
      },
  );
  return dispatcherExport;
}

function dispatcherHookNew(
  dispatcherExport: { Dispatcher: { prototype: any } },
  runWrapper: { (run: any): () => any; (run: any): () => any },
) {
  shimmer.wrap(dispatcherExport.Dispatcher.prototype, 'run', runWrapper);
  shimmer.wrap(
    dispatcherExport.Dispatcher.prototype,
    '_createWorker',
    (createWorker: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function () {
        const dispatcher = this;
        const worker = createWorker.apply(this, arguments);


        worker.on('testBegin', ({ testId }) => {
          const { test } = dispatcher._testById.get(testId);
          testBeginHandler(test);
        });

        worker.on('testEnd', ({ testId, status, errors }) => {
          const { test } = dispatcher._testById.get(testId);


          testEndHandler(test, STATUS_TO_TEST_STATUS[status], errors && errors[0]);
        });

        return worker;
      },
  );
  return dispatcherExport;
}

function runnerHook(runnerExport: { Runner: { prototype: any } }, playwrightVersion) {
  shimmer.wrap(
    runnerExport.Runner.prototype,
    'runAllTests',
    (runAllTests: { apply: (arg0: any, arg1: IArguments) => any }) =>
      async function () {
        const testSessionAsyncResource = new AsyncResource('bound-anonymous-fn');
        const rootDir = getRootDir(this);

        const processArgv = Deno.args.join(' ');
        const command = `playwright ${processArgv}`;
        testSessionAsyncResource.runInAsyncScope(() => {
          testSessionStartCh.publish({ command, frameworkVersion: playwrightVersion, rootDir });
        });


        const runAllTestsReturn = await runAllTests.apply(this, arguments);


        Object.values(remainingTestsByFile).forEach((tests: any[]) => {
          // `tests` should normally be empty, but if it isn't,
          // there were tests that did not go through `testBegin` or `testEnd`,
          // because they were skipped
          tests.forEach((test) => {
            testBeginHandler(test);

            testEndHandler(test, 'skip');
          });
        });

        const sessionStatus = runAllTestsReturn.status || runAllTestsReturn;


        let onDone;

        const flushWait = new Promise((resolve) => {
          onDone = resolve;
        });
        testSessionAsyncResource.runInAsyncScope(() => {

          testSessionFinishCh.publish({ status: STATUS_TO_TEST_STATUS[sessionStatus], onDone });
        });
        await flushWait;

        startedSuites = [];
        remainingTestsByFile = {};

        return runAllTestsReturn;
      },
  );

  return runnerExport;
}

addHook({
  name: '@playwright/test',
  file: 'lib/runner.js',
  versions: ['>=1.18.0 <=1.30.0'],
}, runnerHook);

addHook({
  name: '@playwright/test',
  file: 'lib/dispatcher.js',
  versions: ['>=1.18.0  <1.30.0'],
}, dispatcherHook);

addHook({
  name: '@playwright/test',
  file: 'lib/dispatcher.js',
  versions: ['>=1.30.0 <1.31.0'],
}, (dispatcher: { Dispatcher: { prototype: any } }) => dispatcherHookNew(dispatcher, dispatcherRunWrapper));

addHook({
  name: '@playwright/test',
  file: 'lib/runner/dispatcher.js',
  versions: ['>=1.31.0'],
}, (dispatcher: { Dispatcher: { prototype: any } }) => dispatcherHookNew(dispatcher, dispatcherRunWrapperNew));

addHook({
  name: '@playwright/test',
  file: 'lib/runner/runner.js',
  versions: ['>=1.31.0'],
}, runnerHook);
