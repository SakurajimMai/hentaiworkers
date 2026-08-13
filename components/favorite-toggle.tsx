'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type MouseEvent } from 'react';
import {
  actionToggleFavoriteState,
  actionToggleMangaFavoriteState,
} from '@/app/(site)/auth/actions';

type FavoriteKind = 'anime' | 'manga';

export function FavoriteButton({
  animeId,
  favorited,
  returnTo,
}: {
  animeId: number;
  favorited: boolean;
  returnTo: string;
}) {
  return (
    <FavoriteControl
      kind="anime"
      id={animeId}
      favorited={favorited}
      returnTo={returnTo}
      variant="button"
    />
  );
}

export function MangaFavoriteButton({
  mangaId,
  favorited,
  returnTo,
  compact = false,
}: {
  mangaId: number;
  favorited: boolean;
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <FavoriteControl
      kind="manga"
      id={mangaId}
      favorited={favorited}
      returnTo={returnTo}
      variant={compact ? 'compact' : 'button'}
    />
  );
}

export function FavoriteHeart({
  kind,
  id,
  favorited,
  returnTo,
  onRemoved,
}: {
  kind: FavoriteKind;
  id: number;
  favorited: boolean;
  returnTo: string;
  onRemoved?: () => void;
}) {
  return (
    <FavoriteControl
      kind={kind}
      id={id}
      favorited={favorited}
      returnTo={returnTo}
      variant="heart"
      onRemoved={onRemoved}
    />
  );
}

function FavoriteControl({
  kind,
  id,
  favorited,
  returnTo,
  variant,
  onRemoved,
}: {
  kind: FavoriteKind;
  id: number;
  favorited: boolean;
  returnTo: string;
  variant: 'button' | 'compact' | 'heart';
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [on, setOn] = useState(favorited);
  const [pending, start] = useTransition();

  const toggle = (event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    const previous = on;
    setOn(!previous);
    start(async () => {
      const result = kind === 'anime'
        ? await actionToggleFavoriteState(id, returnTo)
        : await actionToggleMangaFavoriteState(id, returnTo);
      if (result.ok) {
        setOn(result.favorited);
        if (!result.favorited) onRemoved?.();
        router.refresh();
        return;
      }
      setOn(previous);
      if ('login' in result && result.login) {
        router.push(result.login);
      }
    });
  };

  if (variant === 'heart') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        aria-label={on ? '取消收藏' : '收藏'}
        className="grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-[15px] leading-none text-white shadow-ink backdrop-blur-sm transition hover:bg-ink/85 active:scale-95 disabled:opacity-70"
      >
        {on ? '♥' : '♡'}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        aria-label={on ? '取消收藏' : '收藏'}
        title={on ? '取消收藏' : '收藏'}
        className="reader-icon-button"
      >
        <span aria-hidden className="text-[14px] leading-none">{on ? '♥' : '♡'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      className={
        on
          ? 'inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 font-ui text-[12px] font-medium text-accent transition active:scale-[0.98] disabled:opacity-70'
          : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-ui text-[12px] font-medium text-soft transition hover:border-ink/20 hover:bg-secondary active:scale-[0.98] disabled:opacity-70'
      }
    >
      <span aria-hidden>{on ? '♥' : '♡'}</span>
      {on ? '已收藏' : '收藏'}
    </button>
  );
}
