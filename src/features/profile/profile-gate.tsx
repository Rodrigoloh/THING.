"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIdentity } from "@/features/auth/identity-provider";
import { useLocale } from "@/lib/i18n/provider";
import { useProfile } from "./profile-provider";
import { profileDestination } from "./profile";
import { browserInviteDestination } from '@/features/things/model';

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useIdentity();
  const { state, retry } = useProfile();
  const { t } = useLocale();
  const destination = auth.status === "signedOut" && pathname !== "/" && pathname !== "/dev" ? "/" : state.status === "ready" ? profileDestination(pathname, !!state.profile) : null;
  useEffect(() => { if (destination) router.replace(destination === '/things' ? browserInviteDestination() ?? destination : destination); }, [destination, router]);

  if (pathname === "/dev") return children;
  if (pathname === "/" && auth.status !== "active") return children;
  if ((pathname === "/profile/settings" || pathname === "/auth/update-password") && auth.status === "active") return children;
  if (auth.status === "error") return null; // The auth provider owns its retry UI.
  if (state.status === "error") return (
    <div role="alert" className="space-y-4 rounded-[20px] border border-border bg-surface p-6">
      <h1 className="text-2xl font-semibold">{t.errorTitle}</h1>
      <p>{t[state.error]}</p>
      <button type="button" onClick={retry} className="min-h-11 underline underline-offset-4">{t.retry}</button>
    </div>
  );
  if (state.status !== "ready" || destination) return <p role="status" className="py-12 text-muted">{t.loading}</p>;
  return children;
}
