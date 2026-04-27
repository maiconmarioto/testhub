import { Queue } from 'bullmq';

export const RUN_QUEUE_NAME = 'testhub-runs';

export function hasRedis(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function createRunQueue(): Queue<{ runId: string }> | undefined {
  if (!process.env.REDIS_URL) return undefined;
  return new Queue(RUN_QUEUE_NAME, { connection: { url: process.env.REDIS_URL } });
}
