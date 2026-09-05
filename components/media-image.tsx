'use client';

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { PosterPlaceholder, type PlaceholderVariant } from '@/components/poster-placeholder';
import { cn } from '@/lib/utils';

type MediaImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  sizes?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  decoding?: 'async' | 'auto' | 'sync';
  variant?: PlaceholderVariant;
  fallbackLabel?: string;
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
  onLoad?: ImgHTMLAttributes<HTMLImageElement>['onLoad'];
  onError?: ImgHTMLAttributes<HTMLImageElement>['onError'];
  onRetry?: () => void;
};

export function MediaImage({
  src,
  alt,
  className,
  width,
  height,
  sizes,
  loading = 'lazy',
  fetchPriority,
  decoding = 'async',
  variant = 'poster',
  fallbackLabel,
  referrerPolicy = 'no-referrer',
  onLoad,
  onError,
  onRetry,
}: MediaImageProps) {
  const [failed, setFailed] = useState(!src);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return (
      <PosterPlaceholder
        title={alt}
        variant={variant}
        label={fallbackLabel || (src ? (variant === 'page' ? '本页加载失败' : '封面加载失败') : undefined)}
        action={
          src && variant === 'page' ? (
            <button
              type="button"
              className="mt-1 rounded-full border border-border bg-card px-3 py-1 font-ui text-[11px] text-ink transition hover:bg-secondary"
              onClick={() => {
                onRetry?.();
                setFailed(false);
                setRetry((value) => value + 1);
              }}
            >
              重新加载
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="relative h-full w-full bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${src}:${retry}`}
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding={decoding}
        referrerPolicy={referrerPolicy}
        className={cn('bg-surface-2', className)}
        onLoad={onLoad}
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
      />
    </div>
  );
}
