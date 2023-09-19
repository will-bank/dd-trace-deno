import { USER_ID } from '../addresses.ts';
import waf from '../waf/index.ts';
import { getRootSpan } from './utils.ts';
import { block } from '../blocking.ts';
import { storage } from '../../../../datadog-core/index.ts';
import { setUserTags } from './set_user.ts';
import log from '../../log/index.ts';

function isUserBlocked(user: { id: any }) {
  const actions = waf.run({ [USER_ID]: user.id });

  if (!actions) return false;

  return actions.includes('block');
}

function checkUserAndSetUser(
  tracer: { scope: () => { (): any; new (): any; active: { (): any; new (): any } } },
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

function blockRequest(tracer: { scope: () => { (): any; new (): any; active: { (): any; new (): any } } }, req, res) {
  if (!req || !res) {
    const store = storage.getStore();
    if (store) {
      req = req || store.req;
      res = res || store.res;
    }
  }

  if (!req || !res) {
    log.warn('Requests or response object not available in blockRequest');
    return false;
  }

  const rootSpan = getRootSpan(tracer);
  if (!rootSpan) {
    log.warn('Root span not available in blockRequest');
    return false;
  }

  block(req, res, rootSpan);

  return true;
}

export { blockRequest, checkUserAndSetUser };
