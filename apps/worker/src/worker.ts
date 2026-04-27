#!/usr/bin/env node
import { Worker } from 'bullmq';
import { RUN_QUEUE_NAME } from '../../../packages/shared/src/jobs.js';
import { createStore } from '../../../packages/db/src/store-factory.js';
import { executeRun } from './run-executor.js';

if (!process.env.REDIS_URL) throw new Error('REDIS_URL obrigatorio para worker BullMQ');

const store = createStore();

const worker = new Worker<{ runId: string }>(
  RUN_QUEUE_NAME,
  async (job) => {
    await executeRun(store, job.data.runId);
  },
  { connection: { url: process.env.REDIS_URL }, concurrency: Number(process.env.TESTHUB_WORKER_CONCURRENCY ?? 2) },
);

worker.on('completed', (job) => console.log(`run job completed ${job.id}`));
worker.on('failed', (job, error) => console.error(`run job failed ${job?.id}`, error));

console.log('TestHub worker started');
