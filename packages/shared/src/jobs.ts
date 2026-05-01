export const RUN_QUEUE_NAME = 'testhub-runs';

export interface RunQueue {
  add(name: string, data: { runId: string }): Promise<unknown>;
  getJobs(statuses: string[]): Promise<Array<{ data: { runId: string }; remove(): Promise<unknown> }>>;
}

export function hasRedis(): boolean {
  return false;
}

export function createRunQueue(): RunQueue | undefined {
  return undefined;
}
