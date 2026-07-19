import { AppError } from '../../shared/errors';
import type { CrawlerRepositories } from '../ports/crawler-unit-of-work';

export async function requireEnabledCrawlerProfile(
  repos: Pick<CrawlerRepositories, 'profiles'>,
  profileId: number,
): Promise<void> {
  const profile = await repos.profiles.getForUpdate(profileId);
  if (!profile?.isEnabled) {
    throw new AppError('RESULT_INVALID', '模板不存在或已删除', 404);
  }
}
