'use strict';

const {

  channel,

  addHook,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const cryptoHashCh = dc.channel('datadog:crypto:hashing:start');
const cryptoCipherCh = dc.channel('datadog:crypto:cipher:start');

const hashMethods = ['createHash', 'createHmac', 'createSign', 'createVerify', 'sign', 'verify'];
const cipherMethods = ['createCipheriv', 'createDecipheriv'];

addHook({ name: 'crypto' }, (crypto) => {
  shimmer.massWrap(crypto, hashMethods, wrapCryptoMethod(cryptoHashCh));
  shimmer.massWrap(crypto, cipherMethods, wrapCryptoMethod(cryptoCipherCh));
  return crypto;
});

function wrapCryptoMethod(channel: { hasSubscribers: any; publish: (arg0: { algorithm: any }) => void }) {
  function wrapMethod(cryptoMethod: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function () {
      if (channel.hasSubscribers && arguments.length > 0) {
        const algorithm = arguments[0];
        channel.publish({ algorithm });
      }
      return cryptoMethod.apply(this, arguments);
    };
  }
  return wrapMethod;
}
