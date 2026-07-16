'use client';

/**
 * External 解析播放器 host (iframe). Used for MacCMS lines that have an official
 * parser (e.g. 红牛 https://www.hnjiexi.com/m3u8/?url=).
 */
export function ParserPlayer({
  src,
  title,
  className,
}: {
  src: string;
  title?: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={className ?? 'flex h-full w-full items-center justify-center bg-black'}>
        <p className="font-ui text-sm text-white/70">解析地址无效</p>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title={title || '解析播放器'}
      className={className ?? 'h-full w-full border-0 bg-black'}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
    />
  );
}
