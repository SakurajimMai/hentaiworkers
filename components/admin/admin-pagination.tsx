import Link from 'next/link';

export function AdminPagination({
  page,
  totalPages,
  total,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  function href(p: number) {
    const params = new URLSearchParams();
    params.set('page', String(p));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v) params.set(k, v);
      }
    }
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center gap-3 font-ui text-sm text-[#787774]">
      <span>
        第 {page}/{totalPages} 页 · 共 {total} 条
      </span>
      {page > 1 && (
        <Link href={href(page - 1)} className="underline">
          上一页
        </Link>
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} className="underline">
          下一页
        </Link>
      )}
    </div>
  );
}
