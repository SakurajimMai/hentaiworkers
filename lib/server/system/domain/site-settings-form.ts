import { siteMetaTagsSchema } from '@/lib/site-meta';
import { isValidIndexNowKey } from '@/lib/server/seo/indexnow';
import { AppError } from '../../shared/errors';

export function parseSiteMetaTagsFromForm(formData: FormData) {
  const raw = formData.get('siteMetaTagsJson');
  if (raw === null) return undefined;
  try {
    return siteMetaTagsSchema.parse(JSON.parse(String(raw)));
  } catch {
    throw new AppError('RESULT_INVALID', '全局 Meta 标签无效', 400, true, { field: 'siteMetaTags' });
  }
}

/** Empty disables IndexNow; anything else must be a valid key so the served key file matches. */
export function parseIndexNowKeyFromForm(formData: FormData): string {
  const key = String(formData.get('indexNowKey') || '').trim();
  if (!key) return '';
  if (!isValidIndexNowKey(key)) {
    throw new AppError('RESULT_INVALID', 'IndexNow 密钥无效', 400, true, { field: 'indexNowKey' });
  }
  return key;
}
