import RemoteConfigManager from './manager.ts';
import * as RemoteConfigCapabilities from './capabilities.ts';
import * as RuleManager from '../rule_manager.ts';
import * as appsec from '../index.ts';

let rc;

function enable(config: { appsec: { enabled: any } }) {
  rc = new RemoteConfigManager(config);

  if (config.appsec.enabled === undefined) { // only activate ASM_FEATURES when conf is not set locally
    rc.updateCapabilities(RemoteConfigCapabilities.ASM_ACTIVATION, true);

    rc.on('ASM_FEATURES', (action: string, conf: { asm: { enabled: any } }) => {
      if (conf && conf.asm && typeof conf.asm.enabled === 'boolean') {
        let shouldEnable;

        if (action === 'apply' || action === 'modify') {
          shouldEnable = conf.asm.enabled; // take control
        } else {
          shouldEnable = config.appsec.enabled; // give back control to local config
        }

        if (shouldEnable) {
          appsec.enable(config);
        } else {
          appsec.disable();
        }
      }
    });
  }

  return rc;
}

function enableWafUpdate(appsecConfig: { customRulesProvided: any }) {
  if (rc && appsecConfig && !appsecConfig.customRulesProvided) {
    rc.updateCapabilities(RemoteConfigCapabilities.ASM_IP_BLOCKING, true);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_USER_BLOCKING, true);
    // TODO: we should have a different capability for rule override

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_DD_RULES, true);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_EXCLUSIONS, true);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_REQUEST_BLOCKING, true);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_CUSTOM_RULES, true);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_CUSTOM_BLOCKING_RESPONSE, true);

    rc.on('ASM_DATA', noop);

    rc.on('ASM_DD', noop);

    rc.on('ASM', noop);

    rc.on(RemoteConfigManager.kPreUpdate, RuleManager.updateWafFromRC);
  }
}

function disableWafUpdate() {
  if (rc) {
    rc.updateCapabilities(RemoteConfigCapabilities.ASM_IP_BLOCKING, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_USER_BLOCKING, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_DD_RULES, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_EXCLUSIONS, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_REQUEST_BLOCKING, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_CUSTOM_RULES, false);

    rc.updateCapabilities(RemoteConfigCapabilities.ASM_CUSTOM_BLOCKING_RESPONSE, false);

    rc.off('ASM_DATA', noop);

    rc.off('ASM_DD', noop);

    rc.off('ASM', noop);

    rc.off(RemoteConfigManager.kPreUpdate, RuleManager.updateWafFromRC);
  }
}

function noop() {}

export { disableWafUpdate, enable, enableWafUpdate };
