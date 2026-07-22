import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isLocalCoverPathParts } from './local-cover-path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

type LocalCoverParams = Readonly<{
  source: string;
  filename: string;
}>;

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createLocalCoverHandler(options: { rootDir: string }) {
  return async function localCoverHandler(params: LocalCoverParams): Promise<Response> {
    if (!isLocalCoverPathParts(params.source, params.filename)) {
      return notFound();
    }

    const extension = params.filename.slice(params.filename.lastIndexOf('.') + 1);
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) return notFound();

    const path = join(options.rootDir, params.source, params.filename);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) return notFound();
      const content = await readFile(path);
      return new Response(new Uint8Array(content), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(content.byteLength),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return notFound();
    }
  };
}
