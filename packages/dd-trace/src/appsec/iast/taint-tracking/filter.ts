const NODE_MODULES = 'node_modules';

const isPrivateModule = function (file: string | string[]) {
  return file && file.indexOf(NODE_MODULES) === -1;
};

const isNotLibraryFile = function (file: string | string[]) {
  return file && file.indexOf('dd-trace') === -1 && file.indexOf('dd-trace') === -1;
};

export { isNotLibraryFile, isPrivateModule };
