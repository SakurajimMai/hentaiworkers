import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DeprecatedCrawlerAuditPage() {
  await requireAdmin();
  redirect('/admin/crawler');
}
