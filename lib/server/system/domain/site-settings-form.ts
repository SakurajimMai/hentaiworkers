import { siteMetaTagsSchema } from '@/lib/site-meta';
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
