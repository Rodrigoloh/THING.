import type { Metadata } from "next";
import { AppHeader } from "@/components/ui/app-header";
import { IdentityProvider } from "@/features/auth/identity-provider";
import { ProfileProvider } from "@/features/profile/profile-provider";
import { ProfileGate } from "@/features/profile/profile-gate";
import { LocaleProvider } from "@/lib/i18n/provider";
import { Geist, Space_Grotesk } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = { title: { default: "THING", template: "%s · THING" }, description: "something between two people." };

const themeScript = `try{var t=localStorage.getItem('thing-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className={`${geist.variable} ${spaceGrotesk.variable} min-h-dvh antialiased`}>
        <LocaleProvider>
          <div className="mx-auto w-full max-w-lg px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            <AppHeader />
            <main id="main" className="pb-8">
              <IdentityProvider>
                <ProfileProvider><ProfileGate>{children}</ProfileGate></ProfileProvider>
              </IdentityProvider>
            </main>
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
