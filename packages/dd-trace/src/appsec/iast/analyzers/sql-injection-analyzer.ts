import InjectionAnalyzer from './injection-analyzer.ts';
import { SQL_INJECTION } from '../vulnerabilities.ts';
import { getRanges } from '../taint-tracking/operations.ts';
import { storage } from '../../../../../datadog-core/index.ts';
import { getIastContext } from '../iast-context.ts';
import { addVulnerability } from '../vulnerability-reporter.ts';
import { getNodeModulesPaths } from '../path-line.ts';

const EXCLUDED_PATHS = getNodeModulesPaths('mysql', 'mysql2', 'sequelize', 'pg-pool');

class SqlInjectionAnalyzer extends InjectionAnalyzer {
  constructor() {
    super(SQL_INJECTION);
  }

  onConfigure() {

    this.addSub('apm:mysql:query:start', ({ sql }) => this.analyze(sql, 'MYSQL'));

    this.addSub('apm:mysql2:query:start', ({ sql }) => this.analyze(sql, 'MYSQL'));

    this.addSub('apm:pg:query:start', ({ query }) => this.analyze(query.text, 'POSTGRES'));


    this.addSub(
      'datadog:sequelize:query:start',

      ({ sql, dialect }) => this.getStoreAndAnalyze(sql, dialect.toUpperCase()),
    );

    this.addSub('datadog:sequelize:query:finish', () => this.returnToParentStore());


    this.addSub('datadog:pg:pool:query:start', ({ query }) => this.getStoreAndAnalyze(query.text, 'POSTGRES'));

    this.addSub('datadog:pg:pool:query:finish', () => this.returnToParentStore());


    this.addSub('datadog:mysql:pool:query:start', ({ sql }) => this.getStoreAndAnalyze(sql, 'MYSQL'));

    this.addSub('datadog:mysql:pool:query:finish', () => this.returnToParentStore());
  }


  getStoreAndAnalyze(query, dialect: string) {
    const parentStore = storage.getStore();
    if (parentStore) {
      this.analyze(query, dialect, parentStore);

      storage.enterWith({ ...parentStore, sqlAnalyzed: true, sqlParentStore: parentStore });
    }
  }

  returnToParentStore() {
    const store = storage.getStore();
    if (store && store.sqlParentStore) {
      storage.enterWith(store.sqlParentStore);
    }
  }


  _getEvidence(
    value,
    iastContext: { rootSpan: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } } },
    dialect: string,
  ) {
    const ranges = getRanges(iastContext, value);
    return { value, ranges, dialect };
  }


  analyze(value, dialect: string, store = storage.getStore()) {
    if (!(store && store.sqlAnalyzed)) {
      const iastContext = getIastContext(store);

      if (this._isInvalidContext(store, iastContext)) return;
      this._reportIfVulnerable(value, iastContext, dialect);
    }
  }


  _reportIfVulnerable(
    value,
    context: { rootSpan: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } } },
    dialect: string,
  ) {

    if (this._isVulnerable(value, context) && this._checkOCE(context)) {
      this._report(value, context, dialect);
      return true;
    }
    return false;
  }


  _report(
    value,
    context: { rootSpan: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } } },
    dialect: string,
  ) {
    const evidence = this._getEvidence(value, context, dialect);

    const location = this._getLocation();

    if (!this._isExcluded(location)) {
      const spanId = context && context.rootSpan && context.rootSpan.context().toSpanId();

      const vulnerability = this._createVulnerability(this._type, evidence, spanId, location);
      addVulnerability(context, vulnerability);
    }
  }

  _getExcludedPaths() {
    return EXCLUDED_PATHS;
  }
}

export default new SqlInjectionAnalyzer();
