import { createRequire } from 'node:module';
import { WorksQueryService } from './application/works-query-service';
import type { WorksRepository } from './ports/works-repository';

const require = createRequire(import.meta.url);

let service: WorksQueryService | undefined;
let factory: (() => WorksRepository) | undefined;

function defaultRepo(): WorksRepository {
  const mod = require('../infrastructure/database/mariadb-works-repository') as {
    getMariaDbWorksRepository: () => WorksRepository;
  };
  return mod.getMariaDbWorksRepository();
}

export function getWorksQueryService(): WorksQueryService {
  if (!service) {
    service = new WorksQueryService((factory ?? defaultRepo)());
  }
  return service;
}

export function setWorksQueryServiceForTests(next: WorksQueryService | undefined): void {
  service = next;
}

export function setWorksRepositoryFactoryForTests(
  next?: () => WorksRepository,
): void {
  factory = next;
  service = undefined;
}

export { WorksQueryService } from './application/works-query-service';
export type * from './domain/models';
