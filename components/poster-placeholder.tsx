import type { ReactNode } from 'react';
import { IconImage } from '@/components/icons';
import { cn } from '@/lib/utils';

export type PlaceholderVariant = 'poster' | 'wide' | 'page' | 'thumb';

const LABELS: Record<PlaceholderVariant, string> = {
  poster: '暂无封面',
  wide: '暂无图片',
  page: '本页加载失败',
  thumb: '无图',
};

export function PosterPlaceholder({
  title,
  variant = 'poster',
  label,
  action,
}: {
  title: string;
  variant?: PlaceholderVariant;
  label?: string;
  action?: ReactNode;
}) {
  const text = label || LABELS[variant];
  const compact = variant === 'thumb';

  return (
    <div
      className={cn(
        'poster-placeholder flex h-full w-full flex-col items-center justify-center bg-surface-2 text-center text-soft',
        compact ? 'gap-0 px-1' : 'gap-2.5 px-4',
        variant === 'page' && 'min-h-[min(70dvh,36rem)] py-16',
        variant === 'wide' && 'min-h-[12rem]',
      )}
      role="img"
      aria-label={`${title} ${text}`}
    >
      <span
        className={cn(
          'grid place-items-center rounded-2xl border border-border bg-card shadow-ink',
          compact ? 'h-7 w-7 rounded-lg' : 'h-11 w-11',
        )}
      >
        <IconImage size={compact ? 13 : 18} />
      </span>
      {!compact && (
        <>
          <span className="font-ui text-[11px] leading-snug">{text}</span>
          {action}
        </>
      )}
    </div>
  );
}
