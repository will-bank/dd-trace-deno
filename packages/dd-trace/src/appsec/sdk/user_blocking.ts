import { getRootSpan } from './utils.ts';
import { block } from '../blocking.ts';
import { storage } from '../../../../datadog-core/index.ts';
import { setUserTags } from './set_user.ts';
import log from '../../log/index.ts';
import { ITracer } from '../../interfaces.ts';

function isUserBlocked(user: { id: any }) {
  log.warn('WAF is not supported');
}

function checkUserAndSetUser(
  tracer: ITracer,
  user: { id: any },
) {
  if (!user || !user.id) {
    log.warn('Invalid user provided to isUserBlocked');
    return false;
  }

  const rootSpan = getRootSpan(tracer);
  if (rootSpan) {
    if (!rootSpan.context()._tags['usr.id']) {
      setUserTags(user, rootSpan);
    }
  } else {
    log.warn('Root span not available in isUserBlocked');
  }

  return isUserBlocked(user);
}

function blockRequest(tracer: ITracer, req?: Request) {
  if (!req) {
    const store = storage.getStore();
    if (store) {
      req = req || store.req;
    }
  }

  if (!req) {
    log.warn('Requests or response object not available in blockRequest');
    return null;
  }

  const rootSpan = getRootSpan(tracer);
  if (!rootSpan) {
    log.warn('Root span not available in blockRequest');
    return null;
  }

  return block(req, rootSpan);
}

export { blockRequest, checkUserAndSetUser };
