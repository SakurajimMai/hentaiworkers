import { NextResponse } from 'next/server';
import type {
  HealthError,
  HealthFeatures,
  HealthOk,
  HealthResultRow,
} from '@/lib/public-api-types';

export type HealthQueryDependency = () => Promise<HealthResultRow[]>;
export type HealthFeatureSource = () => HealthFeatures;
export type HealthDatabaseModule = {
  pool: {
    query(sql: string): Promise<[HealthResultRow[], unknown]>;
  };
};
export type HealthDatabaseLoader = () => Promise<HealthDatabaseModule>;

export function createHealthQueryDependency(
  loadDatabase: HealthDatabaseLoader,
): HealthQueryDependency {
  return async () => {
    const database = await loadDatabase();
    const [rows] = await database.pool.query('SELECT 1 AS ok');
    return rows;
  };
}

export function createHealthHandler(
  queryHealth: HealthQueryDependency,
  readFeatures: HealthFeatureSource,
) {
  return async function healthHandler() {
    try {
      const rows = await queryHealth();
      const response: HealthOk = {
        ok: true,
        database: 'mysql',
        result: rows,
        version: '1.0.0',
        features: readFeatures(),
      };
      return NextResponse.json(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown';
      const response: HealthError = { ok: false, error: message };
      return NextResponse.json(response, { status: 500 });
    }
  };
}
