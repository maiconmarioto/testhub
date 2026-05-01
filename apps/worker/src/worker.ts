#!/usr/bin/env node
import pg from 'pg';
import { createStore } from '../../../packages/db/src/store-factory.js';
import { executeRun } from './run-executor.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatorio para worker');

const { Pool } = pg;
const store = createStore();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const workerId = `${process.pid}-${Math.random().toString(16).slice(2)}`;
const concurrency = Number(process.env.TESTHUB_WORKER_CONCURRENCY ?? 2);
let stopped = false;

type RunJob = {
  id: string;
  run_id: string;
  attempts: number;
  max_attempts: number;
};

async function claimJob(): Promise<RunJob | undefined> {
  const result = await pool.query<RunJob>(`
    update run_jobs
       set status = 'running',
           attempts = attempts + 1,
           locked_at = now(),
           locked_by = $1,
           updated_at = now()
     where id = (
       select id
         from run_jobs
        where status = 'queued'
          and available_at <= now()
        order by created_at asc
        for update skip locked
        limit 1
     )
     returning id, run_id, attempts, max_attempts
  `, [workerId]);
  return result.rows[0];
}

async function completeJob(job: RunJob, status: 'completed' | 'failed' | 'canceled', error?: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : error ? String(error) : null;
  await pool.query(
    `update run_jobs set status = $2, last_error = $3, locked_at = null, locked_by = null, updated_at = now() where id = $1`,
    [job.id, status, message],
  );
}

async function workLoop(slot: number): Promise<void> {
  while (!stopped) {
    const job = await claimJob();
    if (!job) {
      await sleep(1000);
      continue;
    }
    try {
      await executeRun(store, job.run_id);
      const run = (await store.read()).runs.find(item => item.id === job.run_id);
      await completeJob(job, run?.status === 'canceled' || run?.status === 'deleted' ? 'canceled' : 'completed');
      console.log(`run job completed ${job.id} slot=${slot}`);
    } catch (error) {
      console.error(`run job failed ${job.id} slot=${slot}`, error);
      if (job.attempts < job.max_attempts) {
        await pool.query(
          `update run_jobs set status = 'queued', last_error = $2, locked_at = null, locked_by = null, available_at = now() + interval '10 seconds', updated_at = now() where id = $1`,
          [job.id, error instanceof Error ? error.message : String(error)],
        );
      } else {
        await completeJob(job, 'failed', error);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function shutdown(): Promise<void> {
  stopped = true;
  await pool.end();
}

process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));

console.log('TestHub worker started');
await Promise.all(Array.from({ length: concurrency }, (_, index) => workLoop(index + 1)));
