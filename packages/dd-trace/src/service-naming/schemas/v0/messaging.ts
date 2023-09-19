import { awsServiceV0, identityService } from '../util.ts';

function amqpServiceName({ tracerService }) {
  return `${tracerService}-amqp`;
}

export const producer = {
  amqplib: {
    opName: () => 'amqp.command',
    serviceName: amqpServiceName,
  },
  amqp10: {
    opName: () => 'amqp.send',
    serviceName: amqpServiceName,
  },
  'google-cloud-pubsub': {
    opName: () => 'pubsub.request',

    serviceName: ({ tracerService }) => `${tracerService}-pubsub`,
  },
  kafkajs: {
    opName: () => 'kafka.produce',

    serviceName: ({ tracerService }) => `${tracerService}-kafka`,
  },
  rhea: {
    opName: () => 'amqp.send',

    serviceName: ({ tracerService }) => `${tracerService}-amqp-producer`,
  },
  sqs: {
    opName: () => 'aws.request',
    serviceName: awsServiceV0,
  },
  sns: {
    opName: () => 'aws.request',
    serviceName: awsServiceV0,
  },
};

export const consumer = {
  amqplib: {
    opName: () => 'amqp.command',
    serviceName: amqpServiceName,
  },
  amqp10: {
    opName: () => 'amqp.receive',
    serviceName: amqpServiceName,
  },
  'google-cloud-pubsub': {
    opName: () => 'pubsub.receive',
    serviceName: identityService,
  },
  kafkajs: {
    opName: () => 'kafka.consume',

    serviceName: ({ tracerService }) => `${tracerService}-kafka`,
  },
  rhea: {
    opName: () => 'amqp.receive',
    serviceName: identityService,
  },
  sqs: {
    opName: () => 'aws.request',
    serviceName: awsServiceV0,
  },
};

export const client = {
  amqplib: {
    opName: () => 'amqp.command',
    serviceName: amqpServiceName,
  },
  'google-cloud-pubsub': {
    opName: () => 'pubsub.request',

    serviceName: ({ tracerService }) => `${tracerService}-pubsub`,
  },
};
