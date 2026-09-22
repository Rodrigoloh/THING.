export function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] border border-border bg-surface p-6"><p className="mb-3 text-[13px] font-medium text-muted">Coming later</p><p className="leading-relaxed">{children}</p></div>;
}
