import { storage } from '../../datadog-core/index.ts';

function getDataStreamsContext() {
  const store = storage.getStore();
  return (store && store.dataStreamsContext) || null;
}

function setDataStreamsContext(dataStreamsContext) {
  storage.enterWith({ ...(storage.getStore()), dataStreamsContext });
}

export { getDataStreamsContext, setDataStreamsContext };
