export default function SiteLoading() {
  return (
    <div className="pb-20 sm:pb-24">
      <div className="page-shell pt-8 sm:pt-12 space-y-12">
        <div className="max-w-xl space-y-3">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-10 w-72 max-w-full" />
          <div className="skeleton h-4 w-full max-w-md" />
          <div className="skeleton h-4 w-2/3 max-w-sm" />
        </div>
        <div className="skeleton h-[min(46vh,460px)] min-h-[320px] w-full rounded-3xl" />
        <div className="space-y-4">
          <div className="flex items-end justify-between border-b border-[#ece8e0] pb-3">
            <div className="space-y-2">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-7 w-28" />
            </div>
            <div className="skeleton h-8 w-20 rounded-full" />
          </div>
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[140px] sm:w-[156px] shrink-0 space-y-2">
                <div className="skeleton aspect-[2/3] w-full rounded-2xl" />
                <div className="skeleton h-3.5 w-[80%]" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
