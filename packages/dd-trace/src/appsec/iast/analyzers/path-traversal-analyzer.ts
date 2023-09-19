import path from 'node:path';

import InjectionAnalyzer from './injection-analyzer.ts';
import { getIastContext } from '../iast-context.ts';
import { storage } from '../../../../../datadog-core/index.ts';
import { PATH_TRAVERSAL } from '../vulnerabilities.ts';

const ignoredOperations = ['dir.close', 'close'];

class PathTraversalAnalyzer extends InjectionAnalyzer {
  exclusionList: any[];
  internalExclusionList: string[];
  constructor() {
    super(PATH_TRAVERSAL);

    this.exclusionList = [
      path.join('node_modules', 'send') + path.sep,
    ];

    this.internalExclusionList = [
      'node:fs',
      'node:internal/fs',
      'node:internal\\fs',
      'fs.js',
      'internal/fs',
      'internal\\fs',
    ];
  }

  onConfigure() {

    this.addSub(
      'apm:fs:operation:start',
      (
        obj: {
          operation: any;
          dest: any;
          existingPath: any;
          file: any;
          newPath: any;
          oldPath: any;
          path: any;
          prefix: any;
          src: any;
          target: any;
        },
      ) => {

        if (ignoredOperations.includes(obj.operation)) return;

        const pathArguments: any[] = [];
        if (obj.dest) {
          pathArguments.push(obj.dest);
        }
        if (obj.existingPath) {
          pathArguments.push(obj.existingPath);
        }
        if (obj.file) {
          pathArguments.push(obj.file);
        }
        if (obj.newPath) {
          pathArguments.push(obj.newPath);
        }
        if (obj.oldPath) {
          pathArguments.push(obj.oldPath);
        }
        if (obj.path) {
          pathArguments.push(obj.path);
        }
        if (obj.prefix) {
          pathArguments.push(obj.prefix);
        }
        if (obj.src) {
          pathArguments.push(obj.src);
        }
        if (obj.target) {
          pathArguments.push(obj.target);
        }
        this.analyze(pathArguments);
      },
    );
  }

  _isExcluded(location: { path: { includes: (arg0: string) => unknown }; isInternal: any }) {
    let ret = true;
    if (location && location.path) {
      // Exclude from reporting those vulnerabilities which location is from an internal fs call
      if (location.isInternal) {
        ret = this.internalExclusionList.some((elem) => location.path.includes(elem));
      } else {
        ret = this.exclusionList.some((elem) => location.path.includes(elem));
      }
    }
    return ret;
  }

  analyze(value: any[]) {
    const iastContext = getIastContext(storage.getStore());
    if (!iastContext) {
      return;
    }

    if (value && value.constructor === Array) {
      for (const val of value) {

        if (this._isVulnerable(val, iastContext) && this._checkOCE(iastContext)) {

          this._report(val, iastContext);
          // no support several evidences in the same vulnerability, just report the 1st one
          break;
        }
      }
    }
  }
}

export default new PathTraversalAnalyzer();
