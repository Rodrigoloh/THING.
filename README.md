# THING

A mobile-first foundation for a social game shared by exactly two people per Thing.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm install
npm run dev
```

Open http://localhost:3000. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build after `npm run build`.

## Source inventory

```text
src/
  app/
    globals.css                    Tailwind and light/dark color tokens
    layout.tsx                     Mobile shell, metadata, theme initialization
    not-found.tsx                  Missing-page fallback
    page.tsx                       / onboarding
    things/
      page.tsx                     /things
      new/page.tsx                 /things/new
    join/[code]/page.tsx            /join/[code]
    thing/[thingId]/
      layout.tsx                   Shared Thing navigation
      page.tsx                     /thing/[thingId]
      hangout/new/page.tsx          Hangout Setup
      space/page.tsx               Space
      chat/page.tsx                Chat
      moments/page.tsx             Moments
  components/
    ui/
      action-link.tsx               Primary/secondary navigation actions
      placeholder.tsx               Shared future-feature notice
      screen.tsx                    Heading, description, back navigation
      theme-picker.tsx              System/light/dark preference
    thing/
      thing-card.tsx                Thing preview card
      thing-nav.tsx                 Home/Space/Chat/Moments links
  data/mock-things.ts                All mock Things and the demo invitation code
  types/thing.ts                     Temporary Thing domain type
```

Root files: `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, and this `README.md`.

## Scope and architecture

Routes and components are Server Components by default. Only theme selection and active navigation use client components. There is no backend, authentication, membership mutation, chat persistence, or game state yet. Start and Join are explicitly labeled previews; the onboarding Join link opens the demo invitation. Dynamic Thing routes support placeholder IDs; sample IDs display fixture names and Charms.

`Thing` has `id`, `charm`, optional `accent`, and `createdAt`. Names and activity captions belong to display-only fixtures, not the domain type. There is no relationship classification. Supabase Auth, Postgres, Realtime, RLS, and the two-participant membership constraint will be implemented together later.

Add `features/auth`, `features/things`, `features/hangouts`, `features/games`, `features/space`, and `features/safety` when they contain real logic. Likewise, create `components/game` and `lib` when needed. No empty feature scaffolding, fake repositories, or game state booleans are included.

The theme uses CSS variables, the device preference by default, and a localStorage override. An early script applies saved preferences before paint. Storage failure falls back gracefully. Layout uses 24px horizontal padding, fluid height, 56px primary actions, and 20px cards. No external fonts, gradients, UI framework, or animations are included.

Next.js also generates root agent guidance files: `AGENTS.md` and `CLAUDE.md`. Build output lives in ignored `.next/`; installed packages live in ignored `node_modules/`.

## Verification

Lint, TypeScript checks, and the production build pass. All nine requested routes return HTTP 200 with their expected headings from the development server. Browser-based visual checks at 360-430px remain unverified because browser automation was unavailable in this session.
