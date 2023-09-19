export default {
  get '@aws-sdk/smithy-client'() {
    return import('npm:dd-trace/datadog-plugin-aws-sdk/src');
  },
  get '@cucumber/cucumber'() {
    return import('npm:dd-trace/datadog-plugin-cucumber/src');
  },
  get '@playwright/test'() {
    return import('npm:dd-trace/datadog-plugin-playwright/src');
  },
  get '@elastic/elasticsearch'() {
    return import('npm:dd-trace/datadog-plugin-elasticsearch/src');
  },
  get '@elastic/transport'() {
    return import('npm:dd-trace/datadog-plugin-elasticsearch/src');
  },
  get '@google-cloud/pubsub'() {
    return import('npm:dd-trace/datadog-plugin-google-cloud-pubsub/src');
  },
  get '@grpc/grpc-js'() {
    return import('npm:dd-trace/datadog-plugin-grpc/src');
  },
  get '@hapi/hapi'() {
    return import('npm:dd-trace/datadog-plugin-hapi/src');
  },
  get '@jest/core'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get '@jest/test-sequencer'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get '@jest/transform'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get '@koa/router'() {
    return import('npm:dd-trace/datadog-plugin-koa/src');
  },
  get '@node-redis/client'() {
    return import('npm:dd-trace/datadog-plugin-redis/src');
  },
  get '@opensearch-project/opensearch'() {
    return import('npm:dd-trace/datadog-plugin-opensearch/src');
  },
  get '@redis/client'() {
    return import('npm:dd-trace/datadog-plugin-redis/src');
  },
  get '@smithy/smithy-client'() {
    return import('npm:dd-trace/datadog-plugin-aws-sdk/src');
  },
  get 'amqp10'() {
    return import('npm:dd-trace/datadog-plugin-amqp10/src');
  },
  get 'amqplib'() {
    return import('npm:dd-trace/datadog-plugin-amqplib/src');
  },
  get 'aws-sdk'() {
    return import('npm:dd-trace/datadog-plugin-aws-sdk/src');
  },
  get 'bunyan'() {
    return import('npm:dd-trace/datadog-plugin-bunyan/src');
  },
  get 'cassandra-driver'() {
    return import('npm:dd-trace/datadog-plugin-cassandra-driver/src');
  },
  get 'connect'() {
    return import('npm:dd-trace/datadog-plugin-connect/src');
  },
  get 'couchbase'() {
    return import('npm:dd-trace/datadog-plugin-couchbase/src');
  },
  get 'cypress'() {
    return import('npm:dd-trace/datadog-plugin-cypress/src');
  },
  get 'dns'() {
    return import('npm:dd-trace/datadog-plugin-dns/src');
  },
  get 'elasticsearch'() {
    return import('npm:dd-trace/datadog-plugin-elasticsearch/src');
  },
  get 'express'() {
    return import('npm:dd-trace/datadog-plugin-express/src');
  },
  get 'fastify'() {
    return import('npm:dd-trace/datadog-plugin-fastify/src');
  },
  get 'find-my-way'() {
    return import('npm:dd-trace/datadog-plugin-find-my-way/src');
  },
  get 'graphql'() {
    return import('npm:dd-trace/datadog-plugin-graphql/src');
  },
  get 'grpc'() {
    return import('npm:dd-trace/datadog-plugin-grpc/src');
  },
  get 'hapi'() {
    return import('npm:dd-trace/datadog-plugin-hapi/src');
  },
  get 'http'() {
    return import('npm:dd-trace/datadog-plugin-http/src');
  },
  get 'http2'() {
    return import('npm:dd-trace/datadog-plugin-http2/src');
  },
  get 'https'() {
    return import('npm:dd-trace/datadog-plugin-http/src');
  },
  get 'ioredis'() {
    return import('npm:dd-trace/datadog-plugin-ioredis/src');
  },
  get 'jest-circus'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'jest-config'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'jest-environment-node'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'jest-environment-jsdom'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'jest-jasmine2'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'jest-worker'() {
    return import('npm:dd-trace/datadog-plugin-jest/src');
  },
  get 'koa'() {
    return import('npm:dd-trace/datadog-plugin-koa/src');
  },
  get 'koa-router'() {
    return import('npm:dd-trace/datadog-plugin-koa/src');
  },
  get 'kafkajs'() {
    return import('npm:dd-trace/datadog-plugin-kafkajs/src');
  },
  get 'mariadb'() {
    return import('npm:dd-trace/datadog-plugin-mariadb/src');
  },
  get 'memcached'() {
    return import('npm:dd-trace/datadog-plugin-memcached/src');
  },
  get 'microgateway-core'() {
    return import('npm:dd-trace/datadog-plugin-microgateway-core/src');
  },
  get 'mocha'() {
    return import('npm:dd-trace/datadog-plugin-mocha/src');
  },
  get 'mocha-each'() {
    return import('npm:dd-trace/datadog-plugin-mocha/src');
  },
  get 'moleculer'() {
    return import('npm:dd-trace/datadog-plugin-moleculer/src');
  },
  get 'mongodb'() {
    return import('npm:dd-trace/datadog-plugin-mongodb-core/src');
  },
  get 'mongodb-core'() {
    return import('npm:dd-trace/datadog-plugin-mongodb-core/src');
  },
  get 'mysql'() {
    return import('npm:dd-trace/datadog-plugin-mysql/src');
  },
  get 'mysql2'() {
    return import('npm:dd-trace/datadog-plugin-mysql2/src');
  },
  get 'net'() {
    return import('npm:dd-trace/datadog-plugin-net/src');
  },
  get 'next'() {
    return import('npm:dd-trace/datadog-plugin-next/src');
  },
  get 'oracledb'() {
    return import('npm:dd-trace/datadog-plugin-oracledb/src');
  },
  get 'openai'() {
    return import('npm:dd-trace/datadog-plugin-openai/src');
  },
  get 'paperplane'() {
    return import('npm:dd-trace/datadog-plugin-paperplane/src');
  },
  get 'pg'() {
    return import('npm:dd-trace/datadog-plugin-pg/src');
  },
  get 'pino'() {
    return import('npm:dd-trace/datadog-plugin-pino/src');
  },
  get 'pino-pretty'() {
    return import('npm:dd-trace/datadog-plugin-pino/src');
  },
  get 'redis'() {
    return import('npm:dd-trace/datadog-plugin-redis/src');
  },
  get 'restify'() {
    return import('npm:dd-trace/datadog-plugin-restify/src');
  },
  get 'rhea'() {
    return import('npm:dd-trace/datadog-plugin-rhea/src');
  },
  get 'router'() {
    return import('npm:dd-trace/datadog-plugin-router/src');
  },
  get 'sharedb'() {
    return import('npm:dd-trace/datadog-plugin-sharedb/src');
  },
  get 'tedious'() {
    return import('npm:dd-trace/datadog-plugin-tedious/src');
  },
  get 'winston'() {
    return import('npm:dd-trace/datadog-plugin-winston/src');
  },
};
