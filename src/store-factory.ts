import { JsonStore, type Store } from './store.js';
import { PgStore } from './pg-store.js';

export function createStore(): Store {
  if (process.env.DATABASE_URL) return new PgStore(process.env.DATABASE_URL);
  return new JsonStore();
}
