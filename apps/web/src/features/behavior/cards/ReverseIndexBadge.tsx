export interface ReverseIndexBadgeProps {
  count: number;
  onClick?: () => void;
}

export function ReverseIndexBadge({ count, onClick }: ReverseIndexBadgeProps) {
  if (count <= 0) return null;
  const display = count >= 10 ? "10+" : String(count);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900 hover:bg-blue-100"
      title={`${count} listener${count === 1 ? "" : "s"} react${count === 1 ? "s" : ""} to this node`}
    >
      <span aria-hidden="true">⇐</span>
      <span>
        {display} listener{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
