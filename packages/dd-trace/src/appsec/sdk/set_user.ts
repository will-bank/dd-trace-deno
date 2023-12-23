import { getRootSpan } from './utils.ts';
import log from '../../log/index.ts';
import { ITracer, User } from '../../interfaces.ts';

function setUserTags(user: object, rootSpan: { setTag: (arg0: string, arg1: string) => void }) {
  for (const k of Object.keys(user)) {
    rootSpan.setTag(`usr.${k}`, '' + user[k]);
  }
}

function setUser(
  tracer: ITracer,
  user: User,
) {
  if (!user || !user.id) {
    log.warn('Invalid user provided to setUser');
    return;
  }

  const rootSpan = getRootSpan(tracer);
  if (!rootSpan) {
    log.warn('Root span not available in setUser');
    return;
  }

  setUserTags(user, rootSpan);
}

export { setUser, setUserTags };
