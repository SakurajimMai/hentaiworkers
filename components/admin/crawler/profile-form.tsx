'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ProfileSourceFields } from '@/components/admin/crawler/profile-source-fields';
import { ProfileSubmitButton } from '@/components/admin/crawler/profile-submit-button';
import type { ProfileFormDefaults } from '@/app/admin/crawler/form-config';

type CrawlerProfileFormProps = Readonly<{
  action: (
    previous: Readonly<{ error?: string }>,
    formData: FormData,
  ) => Promise<Readonly<{ error?: string }>>;
  defaults?: ProfileFormDefaults;
  profileId?: number;
  heading: string;
  submitLabel: string;
}>;

export function CrawlerProfileForm({
  action,
  defaults,
  profileId,
  heading,
  submitLabel,
}: CrawlerProfileFormProps) {
  const defaultYear = new Date().getUTCFullYear();
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="surface-card p-5 space-y-6">
      {profileId ? <input type="hidden" name="profileId" value={profileId} /> : null}
      <h2 className="font-ui text-sm font-semibold">{heading}</h2>
      {state.error ? (
        <p role="alert" className="font-ui text-[13px] text-[#C5221F]">
          {state.error}
        </p>
      ) : null}
      <ProfileSourceFields defaultYear={defaultYear} defaults={defaults} />

      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">质量与跳过</h2>
        <label className="block font-meta text-[12px]">
          质量优先级（逗号分隔）
          <input
            name="qualityPriority"
            className="admin-input mt-1"
            defaultValue={defaults?.qualityPriority ?? '1080,720,480'}
          />
        </label>
        <label className="block font-meta text-[12px]">
          跳过关键词（逗号分隔）
          <input
            name="skipKeywords"
            className="admin-input mt-1"
            defaultValue={
              defaults?.skipKeywords
              ?? '中字後補,简中补字,Chinese Sub,中文字幕後補'
            }
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">并发与策略</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block font-meta text-[12px]">
            下载并发（线程）
            <input
              name="downloadConcurrency"
              type="number"
              min={1}
              max={32}
              defaultValue={defaults?.downloadConcurrency ?? 2}
              className="admin-input mt-1"
            />
          </label>
          <label className="block font-meta text-[12px]">
            解析并发（线程）
            <input
              name="parseConcurrency"
              type="number"
              min={1}
              max={32}
              defaultValue={defaults?.parseConcurrency ?? 2}
              className="admin-input mt-1"
            />
          </label>
          <label className="block font-meta text-[12px]">
            翻页并发（线程）
            <input
              name="pageConcurrency"
              type="number"
              min={1}
              max={16}
              defaultValue={defaults?.pageConcurrency ?? 2}
              className="admin-input mt-1"
            />
          </label>
          <label className="block font-meta text-[12px]">
            模板最大活动任务
            <input
              name="maxActiveJobs"
              type="number"
              min={1}
              max={16}
              defaultValue={defaults?.maxActiveJobs ?? 1}
              className="admin-input mt-1"
            />
          </label>
        </div>
        <p className="font-meta text-[11px] text-[#787774]">
          MacCMS 外链主要使用翻页并发拉取列表页；Hanime 下载与解析并发用于媒体上传流水线。
        </p>
        <label className="inline-flex items-center gap-2 font-ui text-sm">
          <input
            type="checkbox"
            name="continueOnError"
            value="1"
            defaultChecked={defaults?.continueOnError ?? true}
          />
          遇错继续（部分成功）
        </label>
        <label className="block font-meta text-[12px]">
          媒体存储模式
          <select
            name="storageDriver"
            className="admin-input mt-1"
            defaultValue={defaults?.storageDriver ?? 'external'}
          >
            <option value="external">外链（MacCMS 动漫 / 仅 URL）</option>
            <option value="s3">S3 对象存储（Hanime 下载上传）</option>
            <option value="sftp">SFTP（Hanime 下载上传）</option>
          </select>
        </label>
        <p className="font-meta text-[12px] text-[#787774]">
          MacCMS 选外链。Hanime 须选 S3 或 SFTP，并先在{' '}
          <Link href="/admin/crawler/storage" className="underline text-[#111]">
            存储
          </Link>{' '}
          创建并激活对应配置。
        </p>
      </section>

      <ProfileSubmitButton label={submitLabel} />
    </form>
  );
}
