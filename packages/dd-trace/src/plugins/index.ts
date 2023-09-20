export default {
  get '@aws-sdk/smithy-client'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-aws-sdk/src');
  },
  get '@cucumber/cucumber'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-cucumber/src');
  },
  get '@playwright/test'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-playwright/src');
  },
  get '@elastic/elasticsearch'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-elasticsearch/src');
  },
  get '@elastic/transport'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-elasticsearch/src');
  },
  get '@google-cloud/pubsub'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-google-cloud-pubsub/src');
  },
  get '@grpc/grpc-js'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-grpc/src');
  },
  get '@hapi/hapi'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-hapi/src');
  },
  get '@jest/core'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get '@jest/test-sequencer'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get '@jest/transform'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get '@koa/router'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-koa/src');
  },
  get '@node-redis/client'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-redis/src');
  },
  get '@opensearch-project/opensearch'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-opensearch/src');
  },
  get '@redis/client'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-redis/src');
  },
  get '@smithy/smithy-client'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-aws-sdk/src');
  },
  get 'amqp10'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-amqp10/src');
  },
  get 'amqplib'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-amqplib/src');
  },
  get 'aws-sdk'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-aws-sdk/src');
  },
  get 'bunyan'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-bunyan/src');
  },
  get 'cassandra-driver'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-cassandra-driver/src');
  },
  get 'connect'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-connect/src');
  },
  get 'couchbase'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-couchbase/src');
  },
  get 'cypress'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-cypress/src');
  },
  get 'dns'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-dns/src');
  },
  get 'elasticsearch'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-elasticsearch/src');
  },
  get 'express'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-express/src');
  },
  get 'fastify'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-fastify/src');
  },
  get 'find-my-way'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-find-my-way/src');
  },
  get 'graphql'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-graphql/src');
  },
  get 'grpc'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-grpc/src');
  },
  get 'hapi'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-hapi/src');
  },
  get 'http'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-http/src');
  },
  get 'http2'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-http2/src');
  },
  get 'https'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-http/src');
  },
  get 'ioredis'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-ioredis/src');
  },
  get 'jest-circus'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'jest-config'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'jest-environment-node'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'jest-environment-jsdom'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'jest-jasmine2'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'jest-worker'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-jest/src');
  },
  get 'koa'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-koa/src');
  },
  get 'koa-router'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-koa/src');
  },
  get 'kafkajs'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-kafkajs/src');
  },
  get 'mariadb'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mariadb/src');
  },
  get 'memcached'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-memcached/src');
  },
  get 'microgateway-core'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-microgateway-core/src');
  },
  get 'mocha'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mocha/src');
  },
  get 'mocha-each'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mocha/src');
  },
  get 'moleculer'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-moleculer/src');
  },
  get 'mongodb'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mongodb-core/src');
  },
  get 'mongodb-core'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mongodb-core/src');
  },
  get 'mysql'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mysql/src');
  },
  get 'mysql2'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-mysql2/src');
  },
  get 'net'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-net/src');
  },
  get 'next'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-next/src');
  },
  get 'oracledb'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-oracledb/src');
  },
  get 'openai'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-openai/src');
  },
  get 'paperplane'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-paperplane/src');
  },
  get 'pg'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-pg/src');
  },
  get 'pino'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-pino/src');
  },
  get 'pino-pretty'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-pino/src');
  },
  get 'redis'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-redis/src');
  },
  get 'restify'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-restify/src');
  },
  get 'rhea'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-rhea/src');
  },
  get 'router'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-router/src');
  },
  get 'sharedb'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-sharedb/src');
  },
  get 'tedious'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-tedious/src');
  },
  get 'winston'() {
    return import('npm:dd-trace@4.13.1/datadog-plugin-winston/src');
  },
};
