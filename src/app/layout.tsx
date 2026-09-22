import type { Metadata } from "next";
import Link from "next/link";
import { ThemePicker } from "@/components/ui/theme-picker";
import "./globals.css";

export const metadata: Metadata = { title: { default: "THING", template: "%s · THING" }, description: "something between two people." };

const themeScript = `try{var t=localStorage.getItem('thing-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-4">Skip to content</a>
        <div className="mx-auto w-full max-w-lg px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <header className="flex items-center justify-between gap-4 py-6">
            <Link href="/" aria-label="THING onboarding" className="py-3 text-lg font-bold tracking-tight">THING.</Link>
            <ThemePicker />
          </header>
          <main id="main" className="pt-8 pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
