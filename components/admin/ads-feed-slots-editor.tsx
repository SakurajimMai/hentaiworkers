'use client';

import { useState } from 'react';
import { IconX } from '@/components/icons';
import { MAX_FEED_ADS, type FeedAdSlot } from '@/lib/server/system/domain/settings';
import { AdSizeFields } from '@/components/admin/ad-size-fields';

function emptySlot(index: number): FeedAdSlot {
  return {
    enabled: true,
    name: `信息流广告 ${index + 1}`,
    interval: 5,
    href: '',
    html: '',
  };
}

export function AdsFeedSlotsEditor({ initialSlots }: { initialSlots: FeedAdSlot[] }) {
  const [slots, setSlots] = useState<FeedAdSlot[]>(
    initialSlots.length ? initialSlots : [emptySlot(0)],
  );

  const update = (index: number, patch: Partial<FeedAdSlot>) => {
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="adsFeedSlotsJson" value={JSON.stringify(slots)} />

      <ul className="space-y-2.5">
        {slots.map((slot, index) => (
          <li key={index} className="space-y-3 rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-meta text-[10px] normal-case tracking-normal tabular">
                #{index + 1}
              </span>
              <label className="field-check text-sm">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(event) => update(index, { enabled: event.target.checked })}
                />
                启用
              </label>
              <input
                value={slot.name}
                onChange={(event) => update(index, { name: event.target.value.slice(0, 40) })}
                className="admin-input !h-8 max-w-[12rem] !py-1 !text-[12px]"
                placeholder={`信息流广告 ${index + 1}`}
              />
              <button
                type="button"
                className="ml-auto rounded-full p-1 text-soft hover:bg-card hover:text-ink"
                aria-label="删除这条广告"
                onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                disabled={slots.length <= 1}
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block font-meta text-[12px]">
                每隔几张卡片插入
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={slot.interval}
                  onChange={(event) =>
                    update(index, {
                      interval: Math.max(1, Math.min(40, Number(event.target.value) || 5)),
                    })
                  }
                  className="admin-input mt-1"
                />
              </label>
              <label className="block font-meta text-[12px]">
                默认卡片跳转链接
                <input
                  value={slot.href}
                  onChange={(event) => update(index, { href: event.target.value.slice(0, 1000) })}
                  className="admin-input mt-1"
                  placeholder="https://example.com/ad"
                />
              </label>
              <label className="block font-meta text-[12px] sm:col-span-2">
                自定义 HTML（留空则用默认招租卡）
                <textarea
                  rows={3}
                  value={slot.html}
                  onChange={(event) => update(index, { html: event.target.value.slice(0, 20000) })}
                  className="admin-input mt-1 font-mono text-[12px]"
                  placeholder={'<iframe src="https://example.com/ad" style="width:100%;height:100%;border:0"></iframe>'}
                />
              </label>
            </div>
            <AdSizeFields value={slot} onChange={(dimensions) => update(index, dimensions)} />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost !px-3.5 !py-1.5 !text-[12px]"
          disabled={slots.length >= MAX_FEED_ADS}
          onClick={() =>
            setSlots((current) =>
              current.length >= MAX_FEED_ADS ? current : [...current, emptySlot(current.length)],
            )
          }
        >
          + 添加信息流广告
        </button>
        <span className="font-ui text-[12px] text-soft">
          {slots.length}/{MAX_FEED_ADS} 条 · 每条可单独开关和设置间隔
        </span>
      </div>
    </div>
  );
}
