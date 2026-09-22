"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useIdentity } from "@/features/auth/identity-provider";
import { useLocale } from "@/lib/i18n/provider";
import type { Profile } from "@/types/database";
import { loadProfile } from "./actions";
import type { ProfileError, ProfileResult } from "./profile";

type ProfileState =
  | { status: "loading"; profile: null; error: null }
  | { status: "ready"; profile: Profile | null; error: null }
  | { status: "error"; profile: null; error: ProfileError };
type Context = { state: ProfileState; acceptProfile: (profile: Profile) => void; retry: () => void };
const ProfileContext = createContext<Context | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const auth = useIdentity();
  const userId = auth.identity?.id;
  const { setLocale } = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ userId: string; result: ProfileResult } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadProfile().then((result) => {
      if (!active) return;
      if (result.ok && result.profile) setLocale(result.profile.locale);
      setLoaded({ userId, result });
    }).catch(() => {
      if (active) setLoaded({ userId, result: { ok: false, error: "connectionFailed" } });
    });
    return () => { active = false; };
  }, [userId, attempt, setLocale]);

  const acceptProfile = useCallback((profile: Profile) => {
    setLocale(profile.locale);
    setLoaded({ userId: profile.id, result: { ok: true, profile } });
  }, [setLocale]);
  const retry = useCallback(() => { setLoaded(null); setAttempt((value) => value + 1); }, []);
  const result = userId && loaded?.userId === userId ? loaded.result : null;
  const state: ProfileState = result
    ? result.ok ? { status: "ready", profile: result.profile, error: null } : { status: "error", profile: null, error: result.error }
    : { status: "loading", profile: null, error: null };

  return <ProfileContext.Provider value={{ state, acceptProfile, retry }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used within ProfileProvider.");
  return value;
}
