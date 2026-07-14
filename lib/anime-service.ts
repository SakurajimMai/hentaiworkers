/**
 * Compatibility facade for the public catalog.
 * Prefer importing CatalogQueryService in new code; keep these names stable for
 * existing pages, API loaders, and mobile-facing route adapters.
 */
import {
  getCatalogQueryService,
  type CatalogListQuery,
  type SortType,
} from './server/catalog';

export type { SortType } from './server/catalog/domain/models';
export type {
  AnimeListItem,
  AnimeDetail,
  AnimeSimilarItem,
  TagSummary,
} from './server/catalog/domain/models';

export type ListAnimesOptions = CatalogListQuery;

export async function listAnimes(opts: CatalogListQuery = {}) {
  return getCatalogQueryService().list(opts);
}

export async function getAnimeById(id: number) {
  return getCatalogQueryService().getById(id);
}

export async function listTags() {
  return getCatalogQueryService().listTags();
}

export async function listSitemapData() {
  return getCatalogQueryService().getSitemapData();
}

export async function getSimilarAnimes(id: number, limit = 12) {
  return getCatalogQueryService().getSimilar(id, limit);
}
