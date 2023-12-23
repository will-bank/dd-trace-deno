import { IAppsec, IAppsecMetadata, ITracer, User } from '../../interfaces.ts';
import { setTemplates } from '../blocking.ts';
import { setUser } from './set_user.ts';
import { trackCustomEvent, trackUserLoginFailureEvent, trackUserLoginSuccessEvent } from './track_event.ts';
import { blockRequest, checkUserAndSetUser } from './user_blocking.ts';

export default class AppsecSdk implements IAppsec {
  private _tracer: ITracer;

  constructor(tracer: ITracer, config) {
    this._tracer = tracer;
    if (config) {
      setTemplates(config);
    }
  }

  trackUserLoginSuccessEvent(user: User, metadata?: IAppsecMetadata) {
    return trackUserLoginSuccessEvent(this._tracer, user, metadata);
  }

  trackUserLoginFailureEvent(userId: string, exists: boolean, metadata?: IAppsecMetadata) {
    return trackUserLoginFailureEvent(this._tracer, userId, exists, metadata);
  }

  trackCustomEvent(eventName: string, metadata?: IAppsecMetadata) {
    return trackCustomEvent(this._tracer, eventName, metadata);
  }

  isUserBlocked(user: { id: any }) {
    return checkUserAndSetUser(this._tracer, user);
  }

  blockRequest(req?: Request) {
    return blockRequest(this._tracer, req);
  }

  setUser(user: { id: any }) {
    return setUser(this._tracer, user);
  }
}
