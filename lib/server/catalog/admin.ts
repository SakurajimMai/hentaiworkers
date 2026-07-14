import { createRequire } from 'node:module';
import { AdminCatalogService } from './application/admin-catalog-service';
import type { AdminCatalogRepository } from './application/admin-catalog-service';

const require = createRequire(import.meta.url);

let adminService: AdminCatalogService | undefined;
let repoFactory: (() => AdminCatalogRepository) | undefined;

function defaultRepo(): AdminCatalogRepository {
  const mod = require('../infrastructure/database/mariadb-admin-catalog-repository') as {
    getMariaDbAdminCatalogRepository: () => AdminCatalogRepository;
  };
  return mod.getMariaDbAdminCatalogRepository();
}

export function getAdminCatalogService(): AdminCatalogService {
  if (!adminService) {
    adminService = new AdminCatalogService((repoFactory ?? defaultRepo)());
  }
  return adminService;
}

export function setAdminCatalogServiceForTests(service: AdminCatalogService | undefined) {
  adminService = service;
}

export function setAdminCatalogRepositoryFactoryForTests(
  factory?: () => AdminCatalogRepository,
) {
  repoFactory = factory;
  adminService = undefined;
}

export { AdminCatalogService } from './application/admin-catalog-service';
export type {
  AdminAnimeSaveInput,
  ImportAnimeItem,
  ImportResult,
} from './application/admin-catalog-service';
