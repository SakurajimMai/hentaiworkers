import type { RowDataPacket } from 'mysql2';
import type { HealthResultRow } from '@/lib/public-api-types';
import {
  createHealthHandler,
  createHealthQueryDependency,
  type HealthDatabaseLoader,
  type HealthFeatureSource,
} from './handler';
import { configuredAndroidUpdateRepository } from '@/lib/server/android-update';
import { imageProxyOriginForHints } from '@/lib/server/image-proxy';

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

// A deployment that lost these keys otherwise only shows up as 503/404 answers inside the app.
const readDeploymentFeatures: HealthFeatureSource = () => ({
  imageProxy: imageProxyOriginForHints() !== null,
  androidUpdates: configuredAndroidUpdateRepository() !== null,
});

export const GET = createHealthHandler(queryHealthFromProduction, readDeploymentFeatures);
