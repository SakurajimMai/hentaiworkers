const COLORS: Record<string, string> = {
  queued: 'bg-[#F0EDE6] text-[#5C5A54]',
  leased: 'bg-[#E8F0FE] text-[#1A56DB]',
  running: 'bg-[#E6F4EA] text-[#137333]',
  retry_wait: 'bg-[#FEF7E0] text-[#B06000]',
  cancel_requested: 'bg-[#FCE8E6] text-[#C5221F]',
  succeeded: 'bg-[#E6F4EA] text-[#137333]',
  partial_succeeded: 'bg-[#FEF7E0] text-[#B06000]',
  failed: 'bg-[#FCE8E6] text-[#C5221F]',
  cancelled: 'bg-[#F0EDE6] text-[#5C5A54]',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? 'bg-[#F0EDE6] text-[#5C5A54]';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 font-meta text-[11px] ${cls}`}>
      {status}
    </span>
  );
}
