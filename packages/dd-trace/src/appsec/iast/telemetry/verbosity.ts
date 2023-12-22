const Verbosity = {
  OFF: 0,
  MANDATORY: 1,
  INFORMATION: 2,
  DEBUG: 3,
};

function isDebugAllowed(value: number) {
  return value >= Verbosity.DEBUG;
}

function isInfoAllowed(value: number) {
  return value >= Verbosity.INFORMATION;
}

function getVerbosity(verbosity: string) {
  if (verbosity) {
    verbosity = verbosity.toUpperCase();

    return Verbosity[verbosity] !== undefined ? Verbosity[verbosity] : Verbosity.INFORMATION;
  } else {
    return Verbosity.INFORMATION;
  }
}

function getName(verbosityValue) {
  for (const name in Verbosity) {
    if (Verbosity[name] === verbosityValue) {
      return name;
    }
  }
  return 'OFF';
}

export { getName, getVerbosity, isDebugAllowed, isInfoAllowed, Verbosity };
