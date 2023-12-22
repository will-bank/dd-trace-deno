import log from '../../log/index.ts';

const urlFilter = {
  getFilter(
    config: {
      filter: any;
      hasOwnProperty: (arg0: string) => any;
      allowlist: any;
      whitelist: any;
      blocklist: any;
      blacklist: any;
    },
  ) {
    if (typeof config.filter === 'function') {
      return config.filter;
    } else if (config.hasOwnProperty('filter')) {
      log.error('Expected `filter` to be a function. Overriding filter property to default.');
    }

    const allowlist = config.allowlist || config.whitelist || /.*/;
    const blocklist = config.blocklist || config.blacklist || [];

    return (uri: string) => {
      const allowed = applyFilter(allowlist, uri);
      const blocked = applyFilter(blocklist, uri);
      return allowed && !blocked;
    };

    function applyFilter(filter: { (arg0: any): any; (arg0: any): any; test: any; some: any }, uri: string) {
      if (typeof filter === 'function') {
        return filter(uri);
      } else if (filter instanceof RegExp) {
        return filter.test(uri);
      } else if (filter instanceof Array) {
        return filter.some((filter: { (arg0: any): any; (arg0: any): any; test: any; some: any }) =>
          applyFilter(filter, uri)
        );
      }

      return filter === uri;
    }
  },
};

export default urlFilter;
