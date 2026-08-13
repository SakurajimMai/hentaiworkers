'use client';

import { useState } from 'react';

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function AdminMangaPublishSecret({ configured }: { configured: boolean }) {
  const [secret, setSecret] = useState('');
  const [visible, setVisible] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function createSecret() {
    setSecret(generateSecret());
    setGenerated(true);
    setCopied(false);
    setVisible(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 font-meta text-[12px]">
          发布密钥
          {configured ? '（已配置，留空不改）' : '（首次保存必填）'}
          <input
            name="mangaPublishSecret"
            type={visible ? 'text' : 'password'}
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
              setGenerated(false);
              setCopied(false);
            }}
            className="admin-input mt-1 font-mono text-[12px]"
            autoComplete="new-password"
            placeholder={configured ? '••••••••' : '设置一个足够长的随机密钥'}
          />
        </label>
        <div className="flex shrink-0 gap-2 pb-px">
          <button type="button" className="btn-ghost" onClick={createSecret}>
            {configured ? '生成并重置' : '生成密钥'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setVisible((current) => !current)}
            disabled={!secret}
          >
            {visible ? '隐藏' : '显示'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={copySecret}
            disabled={!secret}
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
      {generated && (
        <p className="font-ui text-[12px] text-accent">
          新密钥尚未保存。请先复制到 tg-manga 的 <code className="text-foreground">SITE_PUBLISH_SECRET</code>，再点击页面底部的“保存全部设置”。
        </p>
      )}
    </div>
  );
}
