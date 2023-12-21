import ipaddr from 'https://esm.sh/ipaddr.js@2.1.0';

export default class BlockList {
  v4Ranges: any[];
  v6Ranges: any[];
  constructor() {
    this.v4Ranges = [];
    this.v6Ranges = [];
  }

  addSubnet(net, prefix, type: string) {
    this[type === 'ipv4' ? 'v4Ranges' : 'v6Ranges'].push(ipaddr.parseCIDR(`${net}/${prefix}`));
  }

  check(address, type: string) {
    try {
      let ip = ipaddr.parse(address);

      type = ip.kind();

      if (type === 'ipv6') {
        for (const range of this.v6Ranges) {
          if (ip.match(range)) return true;
        }

        if (ip.isIPv4MappedAddress()) {
          ip = ip.toIPv4Address();
          type = ip.kind();
        }
      }

      if (type === 'ipv4') {
        for (const range of this.v4Ranges) {
          if (ip.match(range)) return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}
