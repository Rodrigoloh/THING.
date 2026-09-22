import Link from "next/link";
import type { Thing } from "@/types/thing";

export function ThingCard({ thing, name, activity }: { thing: Thing; name: string; activity: string }) {
  return (
    <Link href={`/thing/${encodeURIComponent(thing.id)}`} className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-5 hover:border-muted">
      <span className="text-4xl" role="img" aria-label={`Charm: ${thing.charm}`}>{thing.charm}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{name}</span><span className="mt-1 block text-[13px] text-muted">{activity}</span></span>
      <span aria-hidden="true" className="text-muted">→</span>
    </Link>
  );
}
