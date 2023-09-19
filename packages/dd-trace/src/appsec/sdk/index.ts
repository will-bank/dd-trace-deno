import { trackCustomEvent, trackUserLoginFailureEvent, trackUserLoginSuccessEvent } from './track_event.ts';
import { blockRequest, checkUserAndSetUser } from './user_blocking.ts';
import { setTemplates } from '../blocking.ts';
import { setUser } from './set_user.ts';

class AppsecSdk {
  private _tracer: any;

  constructor(tracer, config) {
    this._tracer = tracer;
    if (config) {
      setTemplates(config);
    }
  }


  trackUserLoginSuccessEvent(user: { id: any }, metadata) {
    return trackUserLoginSuccessEvent(this._tracer, user, metadata);
  }


  trackUserLoginFailureEvent(userId, exists, metadata) {
    return trackUserLoginFailureEvent(this._tracer, userId, exists, metadata);
  }


  trackCustomEvent(eventName, metadata) {
    return trackCustomEvent(this._tracer, eventName, metadata);
  }

  isUserBlocked(user: { id: any }) {
    return checkUserAndSetUser(this._tracer, user);
  }


  blockRequest(req, res) {
    return blockRequest(this._tracer, req, res);
  }

  setUser(user: { id: any }) {
    return setUser(this._tracer, user);
  }
}

export default AppsecSdk;
