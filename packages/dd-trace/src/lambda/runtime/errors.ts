/**
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Defines custom error types throwable by the runtime.
 */
class ExtendedError extends Error {
  constructor(reason: string) {
    super(reason);

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class ImpendingTimeout extends ExtendedError {}
ImpendingTimeout.prototype.name = 'Impending Timeout';

export { ImpendingTimeout };
