const { addHook } = await import('./helpers/instrument.ts');

// No handler because this is only useful for testing.
// Cypress plugin does not patch any library.
addHook({
  name: 'cypress',
  versions: ['>=6.7.0'],

}, (lib) => lib);
