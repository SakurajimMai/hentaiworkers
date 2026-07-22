import { createLocalCoverHandler } from '@/lib/server/media/local-cover-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handleLocalCover = createLocalCoverHandler({
  rootDir: process.env.CRAWLER_COVER_DIR || '/data/covers',
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ source: string; filename: string }> },
) {
  return handleLocalCover(await context.params);
}
