import { actionImportJson } from '../actions';

export default function AdminImportPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="font-meta mb-2">Import</p>
        <h1 className="font-serif text-3xl">批量导入</h1>
        <p className="mt-2 font-ui text-sm text-[#787774]">
          粘贴 JSON 数组。字段：title、videoUrl（必填），以及 titleJapanese、titleEnglish、description、cover、fanart、tags[]、id（可选更新）。
        </p>
      </div>

      <form action={actionImportJson} className="surface-card p-6 space-y-4">
        <textarea
          name="payload"
          className="admin-input min-h-[320px] font-mono text-xs"
          placeholder={`[\n  {\n    "title": "示例",\n    "videoUrl": "https://...",\n    "tags": ["标签A"]\n  }\n]`}
          required
        />
        <button type="submit" className="btn-ink">
          开始导入
        </button>
      </form>
    </div>
  );
}
