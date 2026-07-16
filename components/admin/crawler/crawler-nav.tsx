import Link from 'next/link';

const LINKS = [
  { href: '/admin/crawler', label: '总览' },
  { href: '/admin/crawler/profiles', label: '模板' },
  { href: '/admin/crawler/jobs', label: '任务' },
  { href: '/admin/crawler/schedules', label: '调度' },
  { href: '/admin/crawler/workers', label: 'Worker' },
  { href: '/admin/crawler/storage', label: '存储' },
  { href: '/admin/crawler/import', label: 'YAML 导入' },
] as const;

export function CrawlerNav({ current }: { current?: string }) {
  return (
    <nav className="flex flex-wrap gap-3 font-ui text-[13px] text-[#787774] mb-6">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            current === link.href
              ? 'text-[#111] font-semibold underline underline-offset-4'
              : 'hover:text-[#111]'
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
