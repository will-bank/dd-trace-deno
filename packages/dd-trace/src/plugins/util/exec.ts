import cp from 'node:child_process';
import log from '../../log/index.ts';

const sanitizedExec = (cmd, flags, options = { stdio: 'pipe' }) => {
  try {
    return cp.execFileSync(cmd, flags, options).toString().replace(/(\r\n|\n|\r)/gm, '');
  } catch (e) {
    log.error(e);
    return '';
  }
};

export { sanitizedExec };
