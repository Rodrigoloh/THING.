import Link from "next/link";
import type { ReactNode } from "react";

export function ActionLink({ href, children, secondary = false, themed = false }: { href: string; children: ReactNode; secondary?: boolean; themed?: boolean }) {
  return (
    <Link href={href} className={`flex min-h-14 items-center justify-center px-5 py-4 text-center font-semibold ${secondary ? "border border-border bg-surface text-foreground hover:bg-background" : themed ? "thing-primary-button hover:opacity-90" : "rounded-[18px] bg-accent text-[#171717] hover:opacity-90"}`}>
      {children}
    </Link>
  );
}
