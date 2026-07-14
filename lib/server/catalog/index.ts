import { createRequire } from 'node:module';
import { CatalogCommandService } from './application/catalog-command-service';
import { CatalogQueryService } from './application/catalog-query-service';
import type { CatalogReadRepository } from './ports/catalog-read-repository';
import type { CatalogWriteRepository } from './ports/catalog-write-repository';

const require = createRequire(import.meta.url);

let queryService: CatalogQueryService | undefined;
let commandService: CatalogCommandService | undefined;
let readFactory: (() => CatalogReadRepository) | undefined;
let writeFactory: (() => CatalogWriteRepository) | undefined;

function defaultMariaRepo(): CatalogReadRepository & CatalogWriteRepository {
  const mod = require('../infrastructure/database/mariadb-catalog-repository') as {
    getMariaDbCatalogRepository: () => CatalogReadRepository & CatalogWriteRepository;
  };
  return mod.getMariaDbCatalogRepository();
}

export function getCatalogQueryService(): CatalogQueryService {
  if (!queryService) {
    const repo = (readFactory ?? defaultMariaRepo)();
    queryService = new CatalogQueryService(repo);
  }
  return queryService;
}

export function getCatalogCommandService(): CatalogCommandService {
  if (!commandService) {
    const repo = (writeFactory ?? defaultMariaRepo)();
    commandService = new CatalogCommandService(repo);
  }
  return commandService;
}

export function setCatalogQueryServiceForTests(service: CatalogQueryService | undefined) {
  queryService = service;
}

export function setCatalogRepositoryFactoriesForTests(factories?: {
  read?: () => CatalogReadRepository;
  write?: () => CatalogWriteRepository;
}) {
  readFactory = factories?.read;
  writeFactory = factories?.write;
  queryService = undefined;
  commandService = undefined;
}

export { CatalogQueryService } from './application/catalog-query-service';
export { CatalogCommandService } from './application/catalog-command-service';
export type * from './domain/models';
