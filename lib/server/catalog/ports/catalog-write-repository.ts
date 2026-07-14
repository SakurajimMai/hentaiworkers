/**
 * Write-side port for admin catalog mutations (wired in Task 6).
 * Task 5 only defines the contract so application layer can depend on it.
 */
export type CatalogWriteAnimeInput = Readonly<{
  title: string;
  videoUrl: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  description?: string | null;
  cover?: string | null;
  fanart?: string | null;
  isActive?: number;
  tagIds?: readonly number[];
}>;

export interface CatalogWriteRepository {
  createAnime(input: CatalogWriteAnimeInput): Promise<number>;
  updateAnime(id: number, input: CatalogWriteAnimeInput): Promise<void>;
  deleteAnime(id: number): Promise<void>;
  setAnimeActive(id: number, isActive: number): Promise<void>;
}
