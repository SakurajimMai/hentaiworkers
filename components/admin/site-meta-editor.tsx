'use client';

import { useState } from 'react';
import { IconX } from '@/components/icons';
import { importSiteMetaTags } from '@/lib/client/site-meta';
import { MAX_SITE_META_TAGS, siteMetaTagsSchema, type SiteMetaTag } from '@/lib/site-meta';

export function SiteMetaEditor({ initialTags }: { initialTags: SiteMetaTag[] }) {
  const [tags, setTags] = useState(initialTags);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const update = (index: number, patch: Partial<SiteMetaTag>) => {
    setTags((current) => current.map((tag, i) => i === index ? { ...tag, ...patch } : tag));
  };

  const importTags = () => {
    try {
      const merged = siteMetaTagsSchema.safeParse([...tags, ...importSiteMetaTags(source)]);
      if (!merged.success) throw new Error('标签内容无效，或合计超过 50 条');
      setTags(merged.data);
      setSource('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <input type="hidden" name="siteMetaTagsJson" value={JSON.stringify(tags)} />
      <ul className="divide-y divide-border">
        {tags.map((tag, index) => (
          <li key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-end gap-3 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,2fr)_2.5rem]">
            <label className="col-start-1 min-w-0 font-meta text-[12px]">
              属性
              <select
                aria-label={`Meta ${index + 1} 属性`}
                className="admin-input mt-1"
                value={tag.attribute}
                onChange={(event) => update(index, { attribute: event.target.value === 'property' ? 'property' : 'name' })}
              >
                <option value="name">name</option>
                <option value="property">property</option>
              </select>
            </label>
            <label className="col-start-1 min-w-0 font-meta text-[12px] sm:col-start-2">
              名称
              <input
                aria-label={`Meta ${index + 1} 名称`}
                className="admin-input mt-1 font-mono text-[12px]"
                value={tag.key}
                onChange={(event) => update(index, { key: event.target.value })}
                placeholder="google-site-verification"
                required
                maxLength={128}
                pattern="[a-zA-Z][a-zA-Z0-9:._\-]*"
              />
            </label>
            <label className="col-start-1 min-w-0 font-meta text-[12px] sm:col-start-3">
              内容
              <input
                aria-label={`Meta ${index + 1} 内容`}
                className="admin-input mt-1 font-mono text-[12px]"
                value={tag.content}
                onChange={(event) => update(index, { content: event.target.value })}
                placeholder="验证值"
                required
                maxLength={4096}
              />
            </label>
            <button
              type="button"
              className="col-start-2 row-start-1 flex h-10 w-10 items-center justify-center text-soft hover:bg-surface-2 hover:text-ink sm:col-start-4"
              title="删除标签"
              aria-label={`删除 Meta ${index + 1}`}
              onClick={() => setTags((current) => current.filter((_, i) => i !== index))}
            >
              <IconX size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost !px-3.5 !py-1.5 !text-[12px]"
          disabled={tags.length >= MAX_SITE_META_TAGS}
          onClick={() => setTags((current) => [...current, { attribute: 'name', key: '', content: '' }])}
        >
          添加标签
        </button>
        <span className="font-ui text-[12px] text-soft">{tags.length} / {MAX_SITE_META_TAGS}</span>
      </div>
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer font-ui text-sm">导入验证标签</summary>
        <label className="mt-3 block font-meta text-[12px]">
          Meta 标签
          <textarea
            className="admin-input mt-1 font-mono text-[12px]"
            rows={3}
            value={source}
            maxLength={220000}
            onChange={(event) => setSource(event.target.value)}
            placeholder={'<meta name="google-site-verification" content="验证值">'}
          />
        </label>
        <button type="button" className="btn-ghost mt-2 !px-3.5 !py-1.5 !text-[12px]" onClick={importTags} disabled={!source.trim()}>
          导入
        </button>
        {error ? <p role="alert" className="mt-2 font-ui text-sm text-danger">{error}</p> : null}
      </details>
    </div>
  );
}
