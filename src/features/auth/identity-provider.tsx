"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readIdentity, identityErrorKey, toIdentity, type Identity } from "./auth";
import { useLocale } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/messages";

type IdentityState =
  | { status: "loading"; identity: null; error: null }
  | { status: "signedOut"; identity: null; error: null }
  | { status: "active"; identity: Identity; error: null }
  | { status: "error"; identity: null; error: MessageKey };

const IdentityContext = createContext<IdentityState | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [state, setState] = useState<IdentityState>({ status: "loading", identity: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading", identity: null, error: null });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const client = getSupabaseBrowserClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted || event === "INITIAL_SESSION") return;
      changed = true;
      const identity = session?.user ? toIdentity(session.user) : null;
      setState(identity ? { status: "active", identity, error: null } : { status: "signedOut", identity: null, error: null });
    });

    void readIdentity(client.auth).then(
      (identity) => { if (mounted && !changed) setState(identity ? { status: "active", identity, error: null } : { status: "signedOut", identity: null, error: null }); },
      (error: unknown) => {
        if (mounted && !changed) setState({ status: "error", identity: null, error: identityErrorKey(error) });
      },
    );
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [attempt]);

  return (
    <IdentityContext.Provider value={state}>
      {state.status === "error" && (
        <div role="alert" className="mb-6 rounded-[20px] border border-border bg-surface p-4 text-sm">
          <p>{process.env.NODE_ENV === "development" ? t[state.error] : t.authFailed}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 font-semibold underline underline-offset-4">{t.retry}</button>
        </div>
      )}
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const state = useContext(IdentityContext);
  if (!state) throw new Error("useIdentity must be used within IdentityProvider.");
  return state;
}
