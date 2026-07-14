import {
  createReadyHandler,
  createReadyQueryDependency,
} from './handler';

export const dynamic = 'force-dynamic';

const loadDbPing = async () => {
  return async () => {
    if (!process.env.DATABASE_URL) {
      // Local UI/test without DB still reports ready for live-only deploys.
      return;
    }
    const { pool } = await import('@/lib/db');
    await pool.query('SELECT 1');
  };
};

export const GET = createReadyHandler(createReadyQueryDependency(loadDbPing));
