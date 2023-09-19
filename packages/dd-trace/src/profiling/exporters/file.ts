import fs from 'node:fs';
import { promisify } from 'node:util';
const writeFile = promisify(fs.writeFile);

function formatDateTime(
  t: {
    getUTCFullYear: () => any;
    getUTCMonth: () => number;
    getUTCDate: () => any;
    getUTCHours: () => any;
    getUTCMinutes: () => any;
    getUTCSeconds: () => any;
  },
) {

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`;
}

class FileExporter {
  private _pprofPrefix: any;

  constructor({ pprofPrefix } = {}) {
    this._pprofPrefix = pprofPrefix || '';
  }


  export({ profiles, end }) {
    const types = Object.keys(profiles);
    const dateStr = formatDateTime(end);
    const tasks = types.map((type) => {
      return writeFile(`${this._pprofPrefix}${type}_${dateStr}.pprof`, profiles[type]);
    });


    return Promise.all(tasks);
  }
}

export { FileExporter };
