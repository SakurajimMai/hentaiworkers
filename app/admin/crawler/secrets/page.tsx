import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DeprecatedCrawlerSecretsPage() {
  await requireAdmin();
  redirect('/admin/crawler?notice=external-storage');
}
