class JSONEncoder {
  payloads: any[];
  constructor() {
    this.payloads = [];
  }


  encode(payload) {
    this.payloads.push(payload);
  }

  count() {
    return this.payloads.length;
  }

  reset() {
    this.payloads = [];
  }

  makePayload() {
    const data = JSON.stringify(this.payloads);
    this.reset();
    return data;
  }
}

export { JSONEncoder };
