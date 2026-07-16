import { AppError } from '@/lib/server/shared/errors';
import type {
  AnimeWorkDetail,
  AnimeWorkListQuery,
  AnimeWorkPage,
  AnimeWorkUpdateInput,
  WorkPlayLine,
} from '../domain/models';
import type { WorksRepository } from '../ports/works-repository';

function normalizePlayLines(lines: ReadonlyArray<WorkPlayLine>): WorkPlayLine[] {
  const out: WorkPlayLine[] = [];
  for (const line of lines) {
    const name = String(line.name ?? '').trim();
    const flag = String(line.flag ?? name).trim() || name;
    if (!name) continue;
    const episodes = (line.episodes ?? [])
      .map((ep) => ({
        name: String(ep.name ?? '').trim(),
        url: String(ep.url ?? '').trim(),
      }))
      .filter((ep) => ep.name && ep.url);
    if (episodes.length === 0) continue;
    out.push({ name, flag, episodes });
  }
  return out;
}

export class WorksQueryService {
  constructor(private readonly repository: WorksRepository) {}

  list(query: AnimeWorkListQuery = {}): Promise<AnimeWorkPage> {
    return this.repository.list(query);
  }

  getById(id: number, options?: { activeOnly?: boolean }): Promise<AnimeWorkDetail | null> {
    return this.repository.getById(id, options);
  }

  setActive(id: number, isActive: boolean): Promise<void> {
    return this.repository.setActive(id, isActive);
  }

  async setActiveMany(ids: readonly number[], isActive: boolean): Promise<number> {
    const cleaned = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
    if (!cleaned.length) return 0;
    return this.repository.setActiveMany(cleaned, isActive);
  }

  async delete(id: number): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('RESULT_INVALID', 'Invalid work id', 400);
    }
    const ok = await this.repository.delete(id);
    if (!ok) {
      throw new AppError('RESULT_INVALID', 'Work not found', 404, false, { id });
    }
  }

  async deleteMany(ids: readonly number[]): Promise<number> {
    const cleaned = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
    if (!cleaned.length) return 0;
    return this.repository.deleteMany(cleaned);
  }

  async update(id: number, input: AnimeWorkUpdateInput): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('RESULT_INVALID', 'Invalid work id', 400);
    }
    const title = input.title.trim();
    const streamUrl = input.streamUrl.trim();
    if (!title || !streamUrl) {
      throw new AppError('RESULT_INVALID', 'Title and stream URL are required', 400, false, {
        field: !title ? 'title' : 'streamUrl',
      });
    }
    const existing = await this.repository.getById(id, { activeOnly: false });
    if (!existing) {
      throw new AppError('RESULT_INVALID', 'Work not found', 404, false, { id });
    }

    const playLines = normalizePlayLines(input.playLines);
    const fanartUrls = [...new Set(input.fanartUrls.map((u) => u.trim()).filter(Boolean))];
    const tagIds = [
      ...new Set(
        input.tagIds.filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    const streamFormat =
      input.streamFormat.trim() ||
      (streamUrl.includes('.m3u8') ? 'hls' : 'external');

    await this.repository.update(id, {
      title,
      titleEnglish: input.titleEnglish?.trim() || null,
      titleJapanese: input.titleJapanese?.trim() || null,
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl?.trim() || null,
      fanartUrls,
      streamUrl,
      streamFormat,
      releaseYear: input.releaseYear,
      releaseDate: input.releaseDate?.trim() || null,
      remarks: input.remarks?.trim() || null,
      actors: input.actors?.trim() || null,
      directors: input.directors?.trim() || null,
      aliases: input.aliases?.trim() || null,
      area: input.area?.trim() || null,
      lang: input.lang?.trim() || null,
      sourceUpdatedAt: input.sourceUpdatedAt?.trim() || null,
      isActive: input.isActive,
      tagIds,
      playLines,
    });
  }
}
