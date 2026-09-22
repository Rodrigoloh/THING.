import Link from "next/link";
import { ActionLink } from "@/components/ui/action-link";
import { mockJoinCode } from "@/data/mock-things";

export default function OnboardingPage() {
  return (
    <div className="space-y-16 pt-12 sm:pt-20">
      <div className="space-y-5"><h1 className="text-6xl font-bold tracking-tighter">THING.</h1><p className="max-w-64 text-2xl leading-snug">something between two people.</p></div>
      <div className="space-y-3">
        <ActionLink href="/things/new">start a thing →</ActionLink>
        <Link href={`/join/${mockJoinCode}`} className="flex min-h-14 items-center justify-center text-center underline decoration-border underline-offset-4">already have one? join</Link>
      </div>
      <Link href="/things" className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4">Explore your Things</Link>
    </div>
  );
}
