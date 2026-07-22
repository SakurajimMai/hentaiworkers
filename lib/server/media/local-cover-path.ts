export const LOCAL_COVER_ROUTE_PREFIX = '/api/media/covers';

export const LOCAL_COVER_PATH_PATTERN = new RegExp(
  `^${LOCAL_COVER_ROUTE_PREFIX}/[a-z0-9_-]+/[a-f0-9]{64}\\.(?:jpg|jpeg|png|webp)$`,
);

export function isLocalCoverPath(value: string): boolean {
  return LOCAL_COVER_PATH_PATTERN.test(value);
}

export function isLocalCoverPathParts(source: string, filename: string): boolean {
  return isLocalCoverPath(`${LOCAL_COVER_ROUTE_PREFIX}/${source}/${filename}`);
}
