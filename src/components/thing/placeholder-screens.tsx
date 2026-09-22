"use client";
import { ActionLink } from "@/components/ui/action-link";
import { Placeholder } from "@/components/ui/placeholder";
import { Screen } from "@/components/ui/screen";
import { useLocale } from "@/lib/i18n/provider";

export function StartThingScreen() {
  const { t } = useLocale();
  return <Screen title={t.startTitle} description={t.startDescription} backHref="/things"><Placeholder>{t.startLater}</Placeholder><ActionLink href="/join" secondary>{t.joinInvite}</ActionLink></Screen>;
}

export function JoinThingScreen({ code }: { code?: string }) {
  const { t } = useLocale();
  return <Screen title={t.joinTitle} description={t.joinDescription} backHref="/things">
    {code && <div className="rounded-[20px] border border-border bg-surface p-6"><p className="text-[13px] text-muted">{t.inviteCode}</p><p className="mt-2 break-all font-semibold">{code}</p></div>}
    <Placeholder>{t.joinLater}</Placeholder>
    <ActionLink href="/things" secondary>{t.backThings}</ActionLink>
  </Screen>;
}

export function ThingHomeScreen({ thingId }: { thingId: string }) {
  const { t } = useLocale();
  return <Screen title={t.thingHome} description={t.thingDescription} backHref="/things"><Placeholder>{t.thingLater}</Placeholder><ActionLink href={`/thing/${encodeURIComponent(thingId)}/hangout/new`}>{t.hangOut}</ActionLink></Screen>;
}

export function HangoutScreen({ thingId }: { thingId: string }) {
  const { t } = useLocale();
  return <Screen title={t.hangoutTitle} description={t.hangoutDescription} backHref={`/thing/${encodeURIComponent(thingId)}`}><Placeholder>{t.hangoutLater}</Placeholder></Screen>;
}

export function ThingAreaScreen({ area }: { area: "space" | "chat" | "moments" }) {
  const { t } = useLocale();
  return <Screen title={t[area]} description={t[`${area}Description`]}><Placeholder>{t[`${area}Later`]}</Placeholder></Screen>;
}