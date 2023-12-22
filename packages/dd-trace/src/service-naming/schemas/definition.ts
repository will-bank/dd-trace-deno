class SchemaDefinition {
  schema: any;
  constructor(
    schema: {
      messaging: {
        producer: {
          amqplib: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          amqp10: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          'google-cloud-pubsub': {
            opName: () => string;
            serviceName: ({ tracerService }: { tracerService: any }) => any;
          };
          kafkajs: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          rhea: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          sqs: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          sns: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
        };
        consumer: {
          amqplib: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          amqp10: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          'google-cloud-pubsub': {
            opName: () => string;
            serviceName: ({ tracerService }: { tracerService: any }) => any;
          };
          kafkajs: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          rhea: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          sqs: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
        };
        client: {
          amqplib: { opName: () => string; serviceName: ({ tracerService }: { tracerService: any }) => any };
          'google-cloud-pubsub': {
            opName: () => string;
            serviceName: ({ tracerService }: { tracerService: any }) => any;
          };
        };
      };
      storage: any;
      web: any;
      graphql: any;
    },
  ) {
    this.schema = schema;
  }

  getSchemaItem(type: string | number, kind: string | number, plugin: string | number) {
    const schema = this.schema;
    if (schema && schema[type] && schema[type][kind] && schema[type][kind][plugin]) {
      return schema[type][kind][plugin];
    }
  }

  getOpName(type: string | number, kind: string | number, plugin: string | number, opts) {
    const item = this.getSchemaItem(type, kind, plugin);
    return item.opName(opts);
  }

  getServiceName(type: string | number, kind: string | number, plugin: string | number, opts) {
    const item = this.getSchemaItem(type, kind, plugin);
    return item.serviceName(opts);
  }
}

export default SchemaDefinition;
