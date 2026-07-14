/**
 * Field metadata for typed crawler profile editors (YAML group mapping).
 */
export const PROFILE_FIELD_GROUPS = [
  {
    id: 'source',
    title: '来源',
    fields: [
      { key: 'source.baseUrl', label: 'Base URL', type: 'url' },
      { key: 'source.genre', label: 'Genre', type: 'text' },
      { key: 'source.sort', label: 'Sort', type: 'text' },
      { key: 'source.type', label: 'Type', type: 'text' },
    ],
  },
  {
    id: 'dateFilter',
    title: '日期过滤',
    fields: [
      { key: 'dateFilter.years', label: '年份 (JSON 数组)', type: 'json' },
      { key: 'dateFilter.months', label: '月份 (JSON 数组)', type: 'json' },
    ],
  },
  {
    id: 'quality',
    title: '质量',
    fields: [
      { key: 'qualityPriority', label: '质量优先级 (JSON)', type: 'json' },
      { key: 'skipKeywords', label: '跳过关键词 (JSON)', type: 'json' },
    ],
  },
  {
    id: 'concurrency',
    title: '并发 / 策略',
    fields: [
      { key: 'concurrency.download', label: '下载并发', type: 'number' },
      { key: 'concurrency.parse', label: '解析并发', type: 'number' },
      { key: 'continueOnError', label: '遇错继续', type: 'boolean' },
      { key: 'maxActiveJobs', label: '模板最大活动任务', type: 'number' },
    ],
  },
] as const;

export function ProfileFieldGroupsHelp() {
  return (
    <div className="space-y-4">
      {PROFILE_FIELD_GROUPS.map((group) => (
        <section key={group.id} className="surface-card p-4">
          <h3 className="font-ui text-sm font-semibold mb-2">{group.title}</h3>
          <ul className="space-y-1 font-meta text-[12px] text-[#787774]">
            {group.fields.map((f) => (
              <li key={f.key}>
                <span className="text-[#111]">{f.label}</span>
                <span className="ml-2 font-mono">{f.key}</span>
                <span className="ml-2">({f.type})</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="surface-card p-4">
        <h3 className="font-ui text-sm font-semibold mb-2">扩展分组（YAML 导入）</h3>
        <p className="font-meta text-[12px] text-[#787774]">
          download / proxy / selenium / strategy / getchu / logging / performance /
          schedule / storage 由 YAML 预览映射后写入 JSON 模板；高级字段可直接编辑
          config JSON。
        </p>
      </section>
    </div>
  );
}
