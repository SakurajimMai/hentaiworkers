export type WorkTitleFields = Readonly<{
  title: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  aliases?: string | null;
  releaseYear?: number | null;
}>;

export type WorkPlayLine = Readonly<{
  name: string;
  flag?: string;
  episodes: ReadonlyArray<Readonly<{ name: string; url: string }>>;
}>;

export type WorkCandidate = WorkTitleFields & Readonly<{
  id: number;
  playLinesJson: string | null;
}>;

export type WorkMatch =
  | Readonly<{ kind: 'matched'; candidate: WorkCandidate }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'ambiguous'; candidateIds: readonly number[] }>;

const ALIAS_SEPARATOR = /[,，、/／|｜;；]+/u;
const TITLE_SEPARATOR = /[\p{P}\p{Z}\s]+/gu;

function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(TITLE_SEPARATOR, '');
}

export function normalizedWorkTitles(input: WorkTitleFields): string[] {
  const aliases = (input.aliases ?? '').split(ALIAS_SEPARATOR);
  const values = [
    input.title,
    input.titleEnglish ?? '',
    input.titleJapanese ?? '',
    ...aliases,
  ];
  return [...new Set(values.map(normalizeTitle).filter(Boolean))];
}

export function matchUniqueWork(
  input: WorkTitleFields,
  candidates: readonly WorkCandidate[],
): WorkMatch {
  const inputTitles = new Set(normalizedWorkTitles(input));
  if (!inputTitles.size) return { kind: 'not_found' };

  const matches = candidates.filter((candidate) => {
    if (
      input.releaseYear != null
      && candidate.releaseYear != null
      && input.releaseYear !== candidate.releaseYear
    ) {
      return false;
    }
    return normalizedWorkTitles(candidate).some((title) => inputTitles.has(title));
  });

  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length > 1) {
    return { kind: 'ambiguous', candidateIds: matches.map(({ id }) => id) };
  }
  return { kind: 'matched', candidate: matches[0] };
}

function isWorkPlayLine(value: unknown): value is WorkPlayLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<WorkPlayLine>;
  if (typeof line.name !== 'string' || !line.name.trim()) return false;
  if (line.flag !== undefined && typeof line.flag !== 'string') return false;
  return Array.isArray(line.episodes) && line.episodes.every((episode) => (
    Boolean(episode)
    && typeof episode === 'object'
    && typeof episode.name === 'string'
    && typeof episode.url === 'string'
  ));
}

function parseExistingLines(existingJson: string | null): WorkPlayLine[] {
  if (!existingJson) return [];
  try {
    const parsed: unknown = JSON.parse(existingJson);
    return Array.isArray(parsed) ? parsed.filter(isWorkPlayLine) : [];
  } catch {
    return [];
  }
}

function lineKey(line: WorkPlayLine): string {
  return (line.flag?.trim() || line.name.trim()).normalize('NFKC').toLowerCase();
}

export function mergeWorkPlayLines(
  existingJson: string | null,
  incoming: readonly WorkPlayLine[],
): WorkPlayLine[] {
  const merged: WorkPlayLine[] = [];
  const indexes = new Map<string, number>();

  for (const line of [...parseExistingLines(existingJson), ...incoming.filter(isWorkPlayLine)]) {
    const key = lineKey(line);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(line);
    } else {
      merged[existingIndex] = line;
    }
  }

  return merged;
}
