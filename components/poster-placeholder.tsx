export function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_35%,#fff_0%,#f3f0e9_58%,#e9e4da_100%)] px-4 text-center"
      role="img"
      aria-label={`${title} 暂无封面`}
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#ddd8ce] bg-white/70 text-[#8a877f] shadow-[0_8px_24px_hsla(30,12%,18%,0.06)]">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m7 16 3.5-3.5 2.5 2 2-2 2 2.5" />
          <circle cx="9" cy="9" r="1.25" />
        </svg>
      </span>
      <span className="font-ui text-[11px] text-[#8a877f]">暂无封面</span>
    </div>
  );
}
