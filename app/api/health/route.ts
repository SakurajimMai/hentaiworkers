import type { RowDataPacket } from 'mysql2';
import type { HealthResultRow } from '@/lib/public-api-types';
import {
  createHealthHandler,
  createHealthQueryDependency,
  type HealthDatabaseLoader,
} from './handler';

export const dynamic = 'force-dynamic';

type HealthDatabaseRow = RowDataPacket & HealthResultRow;

const loadHealthDatabase: HealthDatabaseLoader = async () => {
  const { pool } = await import('@/lib/db');
  return {
    pool: {
      query: async (sql) => {
        const [rows, fields] = await pool.query<HealthDatabaseRow[]>(sql);
        const result: [HealthResultRow[], unknown] = [rows, fields];
        return result;
      },
    },
  };
};
const queryHealthFromProduction = createHealthQueryDependency(loadHealthDatabase);

export const GET = createHealthHandler(queryHealthFromProduction);
