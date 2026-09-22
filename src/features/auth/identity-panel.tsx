"use client";
import { Screen } from "@/components/ui/screen";
import { useLocale } from "@/lib/i18n/provider";
import { useProfile } from "@/features/profile/profile-provider";
import { useIdentity } from "./identity-provider";
import { ThemePicker } from "@/components/ui/theme-picker";
import { AvatarRenderer } from "@/features/profile/avatar-renderer";

export function IdentityPanel() {
  const { status, identity, error } = useIdentity();
  const { state } = useProfile();
  const { t } = useLocale();
  const values = [
    [t.userId, identity?.id ?? t.pending],
    [t.authType, identity?.provider ?? t.pending],
    [t.email, identity?.email ?? "—"],
    [t.session, status === "loading" ? t.pending : t[status]],
    [t.profileStatus, state.status === "ready" ? (state.profile ? t.exists : t.missing) : state.status === "error" ? t.error : t.pending],
    [t.displayName, state.profile?.display_name ?? "—"],
    [t.language, state.profile?.locale ?? "—"],
    [t.avatarType, state.profile?.avatar_type ?? "—"],
    [t.avatarKey, state.profile?.avatar_key ?? "—"],
    [t.hasUploadedAvatar, state.profile?.avatar_type === "upload" ? t.yes : t.no],
  ];
  return <Screen title="THING DEV" description={t.devDescription} backHref="/">
    <div className="space-y-5 rounded-[20px] border border-border bg-surface p-6">
      {state.profile && <AvatarRenderer name={state.profile.display_name} type={state.profile.avatar_type} keyName={state.profile.avatar_key} path={state.profile.avatar_url} size="small" />}
      <dl className="space-y-5">{values.map(([label, value]) => <div key={label}><dt className="text-[13px] text-muted">{label}</dt><dd className="mt-1 break-all text-sm">{value}</dd></div>)}</dl>
      <div className="border-t border-border pt-4"><ThemePicker /></div>
      {error && <p className="text-sm">{t[error]}</p>}
      {state.status === "error" && <p className="text-sm">{t.profileLoadFailed}</p>}
    </div>
  </Screen>;
}
