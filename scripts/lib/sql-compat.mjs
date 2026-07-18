export const PRODUCTION_COLLATION = 'utf8mb4_uca1400_ai_ci';
export const PORTABLE_COLLATION = 'utf8mb4_unicode_ci';

export function replaceUnsupportedProductionCollation(sql, supported) {
  if (supported) return sql;
  return sql.replaceAll(PRODUCTION_COLLATION, PORTABLE_COLLATION);
}

export async function databaseSupportsProductionCollation(connection) {
  const [rows] = await connection.query(
    `SELECT COLLATION_NAME
     FROM information_schema.COLLATIONS
     WHERE COLLATION_NAME = ?
     LIMIT 1`,
    [PRODUCTION_COLLATION],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]> }} connection
 * @param {{ warn: (message: string) => void }} logger
 */
export async function createSqlCompatibilityNormalizer(connection, logger = console) {
  const supported = await databaseSupportsProductionCollation(connection);
  if (!supported) {
    logger.warn(
      `[warn] ${PRODUCTION_COLLATION} is unavailable; using ${PORTABLE_COLLATION} for execution`,
    );
  }
  return (sql) => replaceUnsupportedProductionCollation(sql, supported);
}
