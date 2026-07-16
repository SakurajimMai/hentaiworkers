'use client';

import { useMemo, useState } from 'react';
import {
  MACCMS_PRESETS,
  getMacCmsPreset,
} from '@/lib/server/crawler/domain/maccms-presets';
import { MacCmsTypePicker } from '@/components/admin/crawler/maccms-type-picker';

const HANIME_BASE = 'https://hanime1.me';

export function ProfileSourceFields({ defaultYear }: { defaultYear: number }) {
  const [source, setSource] = useState('ikun');
  const [baseUrl, setBaseUrl] = useState(
    () => getMacCmsPreset('ikun')?.baseUrl ?? '',
  );
  const preset = useMemo(() => getMacCmsPreset(source), [source]);
  const isMac = source !== 'hanime';

  return (
    <>
      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">基本</h2>
        <label className="block font-meta text-[12px]">
          模板名称 *
          <input name="name" required className="admin-input mt-1" placeholder="例如：iKun 日本动漫" />
        </label>
        <label className="block font-meta text-[12px]">
          来源适配器
          <select
            name="requiredSource"
            className="admin-input mt-1"
            value={source}
            onChange={(e) => {
              const next = e.target.value;
              setSource(next);
              if (next !== 'hanime') {
                setBaseUrl(getMacCmsPreset(next)?.baseUrl ?? '');
              } else {
                setBaseUrl(HANIME_BASE);
              }
            }}
          >
            {MACCMS_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="hanime">Hanime</option>
          </select>
        </label>
        <p className="font-ui text-[12px] text-[#787774]">
          {isMac
            ? '影视资源站走苹果 CMS JSON 接口。请从 API 加载分类后勾选要采集的项；未勾选的分类一律不采。'
            : 'Hanime 使用列表页 HTML 解析。'}
          {preset?.helpUrl ? (
            <>
              {' '}
              <a
                href={preset.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#0B57D0] underline"
              >
                帮助文档
              </a>
            </>
          ) : null}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">来源</h2>
        <label className="block font-meta text-[12px]">
          {isMac ? 'API Base URL *' : '站点 Base URL *'}
          <input
            name="baseUrl"
            type="url"
            required
            className="admin-input mt-1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={isMac ? 'https://…/api.php/provide/vod/' : HANIME_BASE}
          />
        </label>

        {isMac ? (
          <>
            <MacCmsTypePicker
              key={`${source}-${baseUrl}`}
              provider={source}
              baseUrl={baseUrl}
              initialTypeIds={[...(preset?.typeIds ?? [])]}
            />

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block font-meta text-[12px]">
                播放标识 playFrom（可选，优先线路）
                <input
                  key={`${source}-play`}
                  name="playFrom"
                  className="admin-input mt-1"
                  defaultValue={preset?.playFrom ?? ''}
                  placeholder="ikm3u8 / wjm3u8…"
                />
              </label>
              <label className="block font-meta text-[12px]">
                最近 N 小时（可选）
                <input name="hours" type="number" min={1} className="admin-input mt-1" placeholder="如 24" />
              </label>
              <label className="block font-meta text-[12px]">
                Type 单值（可选覆盖）
                <input name="type" className="admin-input mt-1" placeholder="一般留空" />
              </label>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block font-meta text-[12px]">
                最大页数
                <input name="maxPages" type="number" min={1} max={200} className="admin-input mt-1" defaultValue={3} />
              </label>
              <label className="block font-meta text-[12px]">
                最大条目
                <input name="maxItems" type="number" min={1} max={5000} className="admin-input mt-1" defaultValue={100} />
              </label>
              <label className="block font-meta text-[12px]">
                采集页顺序
                <select name="pageOrder" className="admin-input mt-1" defaultValue="reverse">
                  <option value="reverse">倒序（最新页优先，page 1→N）</option>
                  <option value="from_end">从末页往前（pagecount→…）</option>
                  <option value="forward">正序（page 1→N，同倒序但不反转条目）</option>
                </select>
              </label>
              <label className="block font-meta text-[12px]">
                翻页线程数
                <input
                  name="pageConcurrency"
                  type="number"
                  min={1}
                  max={16}
                  defaultValue={2}
                  className="admin-input mt-1"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="field-check text-[12px]">
                <input type="checkbox" name="filterJpKr" value="1" />
                额外过滤非日本/韩国条目（可选）
              </label>
            </div>
            <p className="font-meta text-[11px] text-[#787774]">
              默认<strong>倒序</strong>：先采最新列表页；条目按 <code className="font-mono">vod_id</code> 从大到小。
              「从末页往前」会先探测 <code className="font-mono">pagecount</code> 再采最后 N 页。
              翻页线程与下方「解析并发」可分别配置。入库表{' '}
              <code className="font-mono">anime_works</code>，只存外链。
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block font-meta text-[12px]">
                Genre
                <input name="genre" className="admin-input mt-1" defaultValue="裏番" />
              </label>
              <label className="block font-meta text-[12px]">
                Sort（可选）
                <input name="sort" className="admin-input mt-1" />
              </label>
              <label className="block font-meta text-[12px]">
                Type（可选）
                <input name="type" className="admin-input mt-1" />
              </label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block font-meta text-[12px]">
                每次最大条目（空 = 不限）
                <input name="maxItems" type="number" min={1} max={2000} className="admin-input mt-1" />
              </label>
              <label className="block font-meta text-[12px]">
                条目间隔（秒）
                <input name="requestDelaySeconds" type="number" min={0} max={30} step="0.5" defaultValue={1} className="admin-input mt-1" />
              </label>
              <label className="block font-meta text-[12px]">
                Getchu 剧照上限
                <input name="maxFanartImages" type="number" min={1} max={50} defaultValue={50} className="admin-input mt-1" />
              </label>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <label className="field-check text-[12px]">
                <input type="checkbox" name="skipExisting" value="1" defaultChecked />
                跳过已入库来源（避免重复下载）
              </label>
              <span className="font-ui text-[12px] text-[#6f6d68]">视频固定上传到所选 S3/SFTP</span>
              <label className="field-check text-[12px]">
                <input type="checkbox" name="enableCover" value="1" defaultChecked />
                上传封面
              </label>
              <label className="field-check text-[12px]">
                <input type="checkbox" name="enableFanart" value="1" defaultChecked />
                Getchu 剧照
              </label>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">日期过滤</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block font-meta text-[12px]">
            年份（逗号分隔）*
            <input name="years" className="admin-input mt-1" defaultValue={String(defaultYear)} required />
          </label>
          <label className="block font-meta text-[12px]">
            月份 1–12（逗号分隔）*
            <input
              name="months"
              className="admin-input mt-1"
              defaultValue="1,2,3,4,5,6,7,8,9,10,11,12"
              required
            />
          </label>
        </div>
        {isMac ? (
          <p className="font-ui text-[12px] text-[#787774]">
            MacCMS 按条目 <code className="font-mono text-[11px]">vod_year</code> 过滤年份；月份字段保留兼容。
          </p>
        ) : null}
      </section>
    </>
  );
}
