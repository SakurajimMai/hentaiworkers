import type {
  CatalogWriteAnimeInput,
  CatalogWriteRepository,
} from '../ports/catalog-write-repository';

/**
 * Command side for catalog mutations. Full transactional admin use-cases land in Task 6;
 * this service is the stable application entry point.
 */
export class CatalogCommandService {
  constructor(private readonly repository: CatalogWriteRepository) {}

  createAnime(input: CatalogWriteAnimeInput): Promise<number> {
    return this.repository.createAnime(input);
  }

  updateAnime(id: number, input: CatalogWriteAnimeInput): Promise<void> {
    return this.repository.updateAnime(id, input);
  }

  deleteAnime(id: number): Promise<void> {
    return this.repository.deleteAnime(id);
  }

  setAnimeActive(id: number, isActive: number): Promise<void> {
    return this.repository.setAnimeActive(id, isActive);
  }
}
