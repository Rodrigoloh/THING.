import Link from "next/link";
import type { ReactNode } from "react";

export function ActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <Link href={href} className={`flex min-h-14 items-center justify-center rounded-[18px] px-5 py-4 text-center font-semibold ${secondary ? "border border-border bg-surface text-foreground hover:bg-background" : "bg-accent text-[#171717] hover:opacity-90"}`}>
      {children}
    </Link>
  );
}
