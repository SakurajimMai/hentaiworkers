import type { RowDataPacket } from 'mysql2';
import type { HealthResultRow } from '@/lib/public-api-types';
import {
  createHealthHandler,
  createHealthQueryDependency,
  type HealthDatabaseLoader,
  type HealthFeatureSource,
} from './handler';
import { configuredAndroidUpdateRepository } from '@/lib/server/android-update';
import { imageProxyDomainForHints } from '@/lib/server/image-proxy';

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

// Visible from outside so an Android-only symptom can be traced to deployment configuration.
const readDeploymentFeatures: HealthFeatureSource = () => ({
  androidUpdates: configuredAndroidUpdateRepository() !== null,
  imageProxyDomain: imageProxyDomainForHints(),
});

export const GET = createHealthHandler(queryHealthFromProduction, readDeploymentFeatures);
