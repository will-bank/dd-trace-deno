import dc from 'npm:dd-trace/packages/diagnostics_channel/index.js';

const Level = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
};

const defaultLevel = Level.Debug;

// based on: https://github.com/trentm/node-bunyan#levels
const logChannels = {
  [Level.Debug]: createLogChannel(Level.Debug, 20),
  [Level.Info]: createLogChannel(Level.Info, 30),
  [Level.Warn]: createLogChannel(Level.Warn, 40),
  [Level.Error]: createLogChannel(Level.Error, 50),
};

function createLogChannel(name: string, logLevel: number) {
  const logChannel = dc.channel(`datadog:log:${name}`);
  logChannel.logLevel = logLevel;
  return logChannel;
}

function getChannelLogLevel(level: string) {
  let logChannel;
  if (level && typeof level === 'string') {
    logChannel = logChannels[level.toLowerCase().trim()] || logChannels[defaultLevel];
  } else {
    logChannel = logChannels[defaultLevel];
  }
  return logChannel.logLevel;
}

export { getChannelLogLevel, Level };

export const debugChannel = logChannels[Level.Debug];
export const infoChannel = logChannels[Level.Info];
export const warnChannel = logChannels[Level.Warn];
export const errorChannel = logChannels[Level.Error];
