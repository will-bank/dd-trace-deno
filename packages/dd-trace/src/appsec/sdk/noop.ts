import { IAppsec, User } from '../../interfaces.ts';

class NoopAppsecSdk implements IAppsec {
  trackUserLoginSuccessEvent(user: User, metadata?: { [key: string]: string } | undefined): void {
  }
  trackUserLoginFailureEvent(userId: string, exists: boolean, metadata?: { [key: string]: string } | undefined): void {
  }
  trackCustomEvent(eventName: string, metadata?: { [key: string]: string } | undefined): void {
  }
  isUserBlocked(user: User): boolean {
    return false;
  }
  blockRequest(req?: Request | undefined): Response | null {
    return null;
  }
  setUser(user: User): void {
  }
}

export default NoopAppsecSdk;
