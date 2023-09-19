import fs from 'node:fs';
import path from 'node:path';

export function findRoot() {
  // return require.main && require.main.filename ? path.dirname(require.main.filename) : Deno.cwd();
  return path.dirname(Deno.mainModule);
}

function findPkg() {
  const cwd = findRoot();
  const directory = path.resolve(cwd);
  const res = path.parse(directory);

  if (!res) return {};

  const { root } = res;

  const filePath = findUp('package.json', root, directory);

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

export function findUp(name: string, root, directory) {
  while (true) {
    const current = path.resolve(directory, name);

    if (fs.existsSync(current)) return current;

    if (directory === root) return;

    directory = path.dirname(directory);
  }
}

const pkg = findPkg();

export default pkg;
