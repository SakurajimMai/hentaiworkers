import { createIndexNowKeyHandler } from '@/lib/server/seo/indexnow';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

/** Serves `/indexnow/{key}.txt` so search engines can verify IndexNow submissions. */
export const GET = createIndexNowKeyHandler(async () => (
  (await getSystemSettingsService().getSettings()).site.indexNowKey
));
