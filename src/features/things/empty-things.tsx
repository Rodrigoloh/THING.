"use client";
import { Screen } from "@/components/ui/screen";
import { ActionLink } from "@/components/ui/action-link";
import { useLocale } from "@/lib/i18n/provider";
import Link from "next/link";

export function EmptyThings() {
  const { t } = useLocale();
  return (
    <Screen title={t.yourThings}>
      <div className="space-y-3 rounded-[20px] border border-border bg-surface p-6">
        <p className="text-xl">{t.emptyThings}</p>
        <p className="leading-relaxed text-muted">{t.emptyHint}</p>
      </div>
      <div className="space-y-3">
        <ActionLink href="/things/new">{t.startThing}</ActionLink>
        <ActionLink href="/join" secondary>{t.joinInvite}</ActionLink>
      </div>
      <Link href="/profile/settings" className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4">{t.accountSettings}</Link>
    </Screen>
  );
}
