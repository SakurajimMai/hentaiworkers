'use client';

import { useState } from 'react';
import { IconChevronDown, IconX } from '@/components/icons';

export type HeroSlideDraft = {
  kind: 'anime' | 'custom';
  animeId: number | null;
  title: string;
  imageUrl: string;
  linkUrl: string;
  description: string;
};

const MAX_SLIDES = 20;

function emptySlide(kind: 'anime' | 'custom'): HeroSlideDraft {
  return { kind, animeId: null, title: '', imageUrl: '', linkUrl: '', description: '' };
}

function serialize(slides: HeroSlideDraft[]): string {
  return JSON.stringify(
    slides.map((slide) => ({
      ...slide,
      animeId: slide.animeId && slide.animeId > 0 ? slide.animeId : null,
    })),
  );
}

export function HeroSlidesEditor({ initialSlides }: { initialSlides: HeroSlideDraft[] }) {
  const [slides, setSlides] = useState<HeroSlideDraft[]>(initialSlides);

  const update = (index: number, patch: Partial<HeroSlideDraft>) => {
    setSlides((current) =>
      current.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    );
  };

  const move = (index: number, delta: number) => {
    setSlides((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const remove = (index: number) => {
    setSlides((current) => current.filter((_, i) => i !== index));
  };

  const add = (kind: 'anime' | 'custom') => {
    setSlides((current) =>
      current.length >= MAX_SLIDES ? current : [...current, emptySlide(kind)],
    );
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="heroSlidesJson" value={serialize(slides)} />

      {slides.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-5 text-center font-ui text-[12px] text-soft">
          还没有配置幻灯片：首页会自动展示最近更新的作品。点击下方按钮添加。
        </p>
      )}

      <ul className="space-y-2.5">
        {slides.map((slide, index) => (
          <li key={index} className="rounded-xl border border-border bg-surface-2 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-meta text-[10px] normal-case tracking-normal tabular">
                #{index + 1}
              </span>
              <select
                value={slide.kind}
                onChange={(event) =>
                  update(index, { kind: event.target.value === 'custom' ? 'custom' : 'anime' })
                }
                className="admin-input !w-auto !py-1.5 !text-[12px]"
                aria-label="幻灯片类型"
              >
                <option value="anime">里番作品</option>
                <option value="custom">自定义</option>
              </select>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-soft transition hover:text-ink disabled:opacity-30"
                  aria-label="上移"
                >
                  <IconChevronDown size={13} className="rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === slides.length - 1}
                  className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-soft transition hover:text-ink disabled:opacity-30"
                  aria-label="下移"
                >
                  <IconChevronDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-soft transition hover:text-danger"
                  aria-label="删除幻灯片"
                >
                  <IconX size={13} />
                </button>
              </div>
            </div>

            {slide.kind === 'anime' ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block font-meta text-[12px]">
                  作品 ID *
                  <input
                    type="number"
                    min={1}
                    value={slide.animeId ?? ''}
                    onChange={(event) =>
                      update(index, {
                        animeId: parseInt(event.target.value, 10) > 0
                          ? parseInt(event.target.value, 10)
                          : null,
                      })
                    }
                    className="admin-input mt-1"
                    placeholder="如 12"
                  />
                </label>
                <label className="block font-meta text-[12px]">
                  自定义封面 URL（选填，覆盖作品海报）
                  <input
                    value={slide.imageUrl}
                    onChange={(event) => update(index, { imageUrl: event.target.value })}
                    className="admin-input mt-1"
                    placeholder="https://cdn.example/banner.jpg"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block font-meta text-[12px]">
                  标题 *
                  <input
                    value={slide.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    className="admin-input mt-1"
                    maxLength={200}
                    placeholder="活动 / 公告标题"
                  />
                </label>
                <label className="block font-meta text-[12px]">
                  封面图 URL *
                  <input
                    value={slide.imageUrl}
                    onChange={(event) => update(index, { imageUrl: event.target.value })}
                    className="admin-input mt-1"
                    placeholder="https://cdn.example/banner.jpg"
                  />
                </label>
                <label className="block font-meta text-[12px]">
                  点击跳转链接（选填，支持站内 / 外部）
                  <input
                    value={slide.linkUrl}
                    onChange={(event) => update(index, { linkUrl: event.target.value })}
                    className="admin-input mt-1"
                    placeholder="/manga 或 https://example.com"
                  />
                </label>
                <label className="block font-meta text-[12px]">
                  描述（选填）
                  <input
                    value={slide.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                    className="admin-input mt-1"
                    maxLength={500}
                    placeholder="一句话说明"
                  />
                </label>
              </div>
            )}

            {slide.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.imageUrl}
                alt=""
                className="h-16 w-28 rounded-lg border border-border object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => add('anime')}
          disabled={slides.length >= MAX_SLIDES}
          className="btn-ghost !py-1.5 !px-3.5 !text-[12px]"
        >
          + 添加作品幻灯片
        </button>
        <button
          type="button"
          onClick={() => add('custom')}
          disabled={slides.length >= MAX_SLIDES}
          className="btn-ghost !py-1.5 !px-3.5 !text-[12px]"
        >
          + 添加自定义幻灯片
        </button>
        <span className="font-ui text-[12px] text-soft">
          {slides.length}/{MAX_SLIDES} 张 · 保存需点击页面底部「保存全部设置」
        </span>
      </div>
    </div>
  );
}
