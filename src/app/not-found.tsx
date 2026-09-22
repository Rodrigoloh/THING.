"use client";

import { Screen } from "@/components/ui/screen";
import { ActionLink } from "@/components/ui/action-link";
import { useLocale } from "@/lib/i18n/provider";

export default function NotFound() {
  const { t } = useLocale();
  return <Screen title={t.notFoundTitle} description={t.notFoundDescription}><ActionLink href="/things">{t.backThings}</ActionLink></Screen>;
}
