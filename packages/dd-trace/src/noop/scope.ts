class Scope {

  active() {
    return null;
  }


  activate(span, callback: () => any) {
    if (typeof callback !== 'function') return callback;

    return callback();
  }


  bind(fn, span) {
    return fn;
  }
}

export default Scope;
